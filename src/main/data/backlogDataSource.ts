import type { BacklogFilter, BacklogRow } from '@shared/types/backlog'

/**
 * Main-process boundary used by both mock data and the future NetSuite adapter.
 * Implementations may apply the customer filter at the source for efficiency;
 * BacklogService applies the allowlist again before returning data to IPC.
 */
export interface BacklogDataSource {
  getBacklog(filter: BacklogFilter): Promise<BacklogRow[]>
  getSalesOrder(salesOrderNumber: string): Promise<BacklogRow[]>
}
