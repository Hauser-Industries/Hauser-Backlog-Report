import type { BacklogDataSource } from '../data/backlogDataSource'
import { filterBacklogRows, keepAllowedCustomerRows } from './backlogFilters'
import type {
  BacklogFilter,
  BacklogResponse,
  BacklogRow,
  SalesOrderSearchRequest
} from '@shared/types/backlog'
import { normalizeSalesOrderNumber } from '@shared/utils/salesOrder'

export class BacklogService {
  constructor(
    private readonly dataSource: BacklogDataSource,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getBacklog(filter: BacklogFilter = {}): Promise<BacklogResponse> {
    return this.loadBacklog(filter)
  }

  async refreshBacklog(filter: BacklogFilter = {}): Promise<BacklogResponse> {
    return this.loadBacklog(filter)
  }

  async searchSalesOrder(request: SalesOrderSearchRequest): Promise<BacklogResponse> {
    const salesOrderNumber = normalizeSalesOrderNumber(request.salesOrderNumber)
    const sourceRows = await this.dataSource.getSalesOrder(salesOrderNumber)
    const exactRows = sourceRows.filter(
      (row) => row.salesOrderNumber.toUpperCase() === salesOrderNumber
    )

    if (exactRows.length === 0) return this.response([], 'not-found')

    const allowedRows = keepAllowedCustomerRows(exactRows)
    if (allowedRows.length === 0) return this.response([], 'outside-allowed-customer')

    const filteredRows = filterBacklogRows(allowedRows, {
      ...(request.customerName ? { customerName: request.customerName } : {})
    })

    return filteredRows.length > 0
      ? this.response(filteredRows, 'success')
      : this.response([], 'not-found')
  }

  private async loadBacklog(filter: BacklogFilter): Promise<BacklogResponse> {
    const sourceRows = await this.dataSource.getBacklog(filter)
    return this.response(filterBacklogRows(sourceRows, filter), 'success')
  }

  private response(rows: BacklogRow[], outcome: BacklogResponse['outcome']): BacklogResponse {
    return {
      rows,
      lastUpdated: this.now().toISOString(),
      outcome
    }
  }
}
