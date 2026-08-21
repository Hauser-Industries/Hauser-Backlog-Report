import { createMockSourceRows } from './fixtures'
import type { BacklogDataSource } from '../backlogDataSource'
import { isAllowedCustomer } from '@shared/constants/customers'
import type { BacklogFilter, BacklogRow } from '@shared/types/backlog'

function cloneRows(rows: readonly BacklogRow[]): BacklogRow[] {
  return structuredClone([...rows])
}

export class MockBacklogDataSource implements BacklogDataSource {
  private readonly sourceRows: readonly BacklogRow[]

  constructor(rows: readonly BacklogRow[] = createMockSourceRows()) {
    this.sourceRows = cloneRows(rows)
  }

  async getBacklog(filter: BacklogFilter): Promise<BacklogRow[]> {
    const allowedRows = this.sourceRows.filter((row) => isAllowedCustomer(row.customerName))
    const rows = filter.customerName
      ? allowedRows.filter((row) => row.customerName === filter.customerName)
      : allowedRows
    return cloneRows(rows)
  }

  async getSalesOrder(salesOrderNumber: string): Promise<BacklogRow[]> {
    const normalized = salesOrderNumber.trim().toUpperCase()
    return cloneRows(
      this.sourceRows.filter((row) => row.salesOrderNumber.toUpperCase() === normalized)
    )
  }
}
