/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PluginInitializerContext, CoreSetup, CoreStart, Plugin, Logger } from 'src/core/server';

import { DataSourcePluginSetup, DataSourcePluginStart } from './types';

export class DataSourcePlugin implements Plugin<DataSourcePluginSetup, DataSourcePluginStart> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('data_source: Setup');

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('data_source: Started');
    return {};
  }

  public stop() {}
}
