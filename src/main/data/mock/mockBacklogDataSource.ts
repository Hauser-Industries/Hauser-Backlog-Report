import { createMockSourceRows } from './fixtures'
import type { BacklogDataSource } from '../backlogDataSource'
import { isAllowedCustomer } from '@shared/constants/customers'
import type {
  BacklogFilter,
  BacklogPageData,
  BacklogRow,
  SalesOrderDetailsResult
} from '@shared/types/backlog'
import {
  DEFAULT_SALES_ORDER_PAGE_SIZE,
  groupBacklogRows,
  pageSalesOrderGroups
} from '../backlogGrouping'

function cloneRows(rows: readonly BacklogRow[]): BacklogRow[] {
  return structuredClone([...rows])
}

export class MockBacklogDataSource implements BacklogDataSource {
  private readonly sourceRows: readonly BacklogRow[]

  constructor(rows: readonly BacklogRow[] = createMockSourceRows()) {
    this.sourceRows = cloneRows(rows)
  }

  async getBacklog(filter: BacklogFilter): Promise<BacklogPageData> {
    const allowedRows = this.sourceRows.filter((row) => isAllowedCustomer(row.customerName))
    const rows = filter.customerName
      ? allowedRows.filter((row) => row.customerName === filter.customerName)
      : allowedRows
    return pageSalesOrderGroups(
      groupBacklogRows(cloneRows(rows)),
      filter.page ?? 0,
      filter.pageSize ?? DEFAULT_SALES_ORDER_PAGE_SIZE
    )
  }

  async getSalesOrder(salesOrderNumber: string): Promise<BacklogPageData> {
    const normalized = salesOrderNumber.trim().toUpperCase()
    const salesOrders = groupBacklogRows(
      cloneRows(this.sourceRows.filter((row) => row.salesOrderNumber.toUpperCase() === normalized))
    )
    return pageSalesOrderGroups(salesOrders, 0, 1)
  }

  async getPurchaseOrder(purchaseOrderNumber: string): Promise<BacklogPageData> {
    const normalized = purchaseOrderNumber.trim().toUpperCase()
    const salesOrders = groupBacklogRows(
      cloneRows(this.sourceRows.filter((row) => row.poNumber.toUpperCase() === normalized))
    )
    return pageSalesOrderGroups(salesOrders, 0, Math.max(1, salesOrders.length))
  }

  async getSalesOrderDetails(): Promise<SalesOrderDetailsResult> {
    return { success: true, items: [] }
  }
}
