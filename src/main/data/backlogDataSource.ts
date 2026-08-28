import type {
  BacklogFilter,
  BacklogPageData,
  SalesOrderDetailsResult,
  WorkOrderBuiltRequest,
  WorkOrderBuiltResult,
  WorkOrderPaintedRequest,
  WorkOrderPaintedResult
} from '@shared/types/backlog'

/**
 * Main-process boundary used by both mock data and the future NetSuite adapter.
 * Implementations may apply the customer filter at the source for efficiency;
 * BacklogService applies the allowlist again before returning data to IPC.
 */
export interface BacklogDataSource {
  getBacklog(filter: BacklogFilter): Promise<BacklogPageData>
  getSalesOrder(salesOrderNumber: string): Promise<BacklogPageData>
  getPurchaseOrder(purchaseOrderNumber: string): Promise<BacklogPageData>
  getSalesOrderDetails(salesOrderInternalId: string): Promise<SalesOrderDetailsResult>
  getWorkOrderBuilt?(request: WorkOrderBuiltRequest): Promise<WorkOrderBuiltResult>
  getWorkOrderPainted?(request: WorkOrderPaintedRequest): Promise<WorkOrderPaintedResult>
  invalidateDetails?(): void
}
