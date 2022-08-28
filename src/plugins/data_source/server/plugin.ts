/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { first, map } from 'rxjs/operators';
import { OpenSearchClientError } from '@opensearch-project/opensearch/lib/errors';
import { Observable } from 'rxjs';
import { dataSource, credential, CredentialSavedObjectsClientWrapper } from './saved_objects';
import { DataSourcePluginConfigType } from '../config';
import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
  IContextProvider,
  RequestHandler,
  Auditor,
  AuditorFactory,
  OpenSearchDashboardsRequest,
  LoggerContextConfigInput,
  AppenderConfigType,
} from '../../../../src/core/server';
import { DataSourceService, DataSourceServiceSetup } from './data_source_service';
import { DataSourcePluginSetup, DataSourcePluginStart } from './types';
import { CryptographyClient } from './cryptography';
import { ScopedAuditClient } from './audit/scopted_audit_client';

export class DataSourcePlugin implements Plugin<DataSourcePluginSetup, DataSourcePluginStart> {
  private readonly logger: Logger;
  private readonly dataSourceService: DataSourceService;
  private readonly config$: Observable<DataSourcePluginConfigType>;

  constructor(private initializerContext: PluginInitializerContext<DataSourcePluginConfigType>) {
    this.logger = this.initializerContext.logger.get();
    this.dataSourceService = new DataSourceService(this.logger.get('data-source-service'));
    this.config$ = this.initializerContext.config.create<DataSourcePluginConfigType>();
  }

  public async setup(core: CoreSetup) {
    this.logger.debug('data_source: Setup');

    // Register credential saved object type
    core.savedObjects.registerType(credential);

    // Register data source saved object type
    core.savedObjects.registerType(dataSource);

    const config: DataSourcePluginConfigType = await this.config$.pipe(first()).toPromise();

    // Fetch configs used to create credential saved objects client wrapper
    const { wrappingKeyName, wrappingKeyNamespace, wrappingKey } = config.encryption;

    // Create credential saved objects client wrapper
    const cryptographyClient = new CryptographyClient(
      wrappingKeyName,
      wrappingKeyNamespace,
      wrappingKey
    );
    const credentialSavedObjectsClientWrapper = new CredentialSavedObjectsClientWrapper(
      cryptographyClient
    );

    // Add credential saved objects client wrapper factory
    core.savedObjects.addClientWrapper(
      1,
      'credential',
      credentialSavedObjectsClientWrapper.wrapperFactory
    );

    const dataSourceService: DataSourceServiceSetup = await this.dataSourceService.setup(config);

    core.logging.configure(
      this.config$.pipe<LoggerContextConfigInput>(
        map((dataSourceConfig) => ({
          appenders: {
            auditTrailAppender: this.getAppender(config),
          },
          loggers: [
            {
              context: 'audit',
              level: 'info',
              appenders: ['auditTrailAppender'],
            },
          ],
        }))
      )
    );

    const auditorFactory: AuditorFactory = {
      asScoped: (request: OpenSearchDashboardsRequest) => {
        return new ScopedAuditClient(request, this.logger.get('audit'));
      },
    };
    core.auditTrail.register(auditorFactory);

    // Register data source plugin context to route handler context
    core.http.registerRouteHandlerContext(
      'dataSource',
      this.createDataSourceRouteHandlerContext(
        dataSourceService,
        cryptographyClient,
        this.logger,
        auditorFactory
      )
    );

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('data_source: Started');
    return {};
  }

  public stop() {
    this.dataSourceService!.stop();
  }

  private createDataSourceRouteHandlerContext = (
    dataSourceService: DataSourceServiceSetup,
    cryptographyClient: CryptographyClient,
    logger: Logger,
    auditorFactory: AuditorFactory
  ): IContextProvider<RequestHandler<unknown, unknown, unknown>, 'dataSource'> => {
    return (context, req) => {
      const auditor = auditorFactory.asScoped(req);

      return {
        opensearch: {
          getClient: (dataSourceId: string) => {
            try {
              return dataSourceService.getDataSourceClient(
                dataSourceId,
                context.core.savedObjects.client,
                cryptographyClient,
                auditor
              );
            } catch (error: any) {
              logger.error(
                `Fail to get data source client for dataSourceId: [${dataSourceId}]. Detail: ${error.messages}`
              );
              throw new OpenSearchClientError(error.message);
            }
          },
        },
      };
    };
  };

  private getAppender(config: DataSourcePluginConfigType): AppenderConfigType {
    return (
      config.audit.appender ?? {
        kind: 'file',
        layout: {
          kind: 'pattern',
          highlight: true,
        },
        path: '/tmp/log/opensearch-dashboards/data-source-audit.log',
      }
    );
  }
}
