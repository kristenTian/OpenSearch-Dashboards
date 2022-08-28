/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuditableEvent, Auditor, Logger, OpenSearchDashboardsRequest } from 'src/core/server';

export class ScopedAuditClient implements Auditor {
  constructor(
    private readonly request: OpenSearchDashboardsRequest,
    private readonly logger: Logger
  ) {}

  public withAuditScope(name: string) {}

  public add(event: AuditableEvent) {
    const xForwardFor = this.request.headers['x-forwarded-for'];
    const message = `${xForwardFor} accessing ${event.message}`;
    const meta = {
      type: event.type,
    };
    this.logger.info(message, meta);
  }
}
