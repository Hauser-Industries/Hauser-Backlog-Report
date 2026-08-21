import type { BacklogFilter, BacklogRow } from '@shared/types/backlog'
import type { BacklogDataSource } from '../../data/backlogDataSource'
import type { SuiteQlOptions } from '../client/suiteQlClient'
import type { NetSuiteFieldMapping } from '../config/fieldMapping'
import type { WorkOrderHierarchyResolver } from '../hierarchy/workOrderHierarchyResolver'
import type { BacklogRepository } from '../repositories/backlogRepository'
import { ALL_CUSTOMERS_VALUE, isAllowedCustomer } from '@shared/constants/customers'
import { normalizeSalesOrderNumber } from '@shared/utils/salesOrder'
import { assertLiveFieldMappingsReady, NETSUITE_FIELD_MAPPING } from '../config/fieldMapping'
import { NetSuiteIntegrationError } from '../errors'

export interface NetSuiteBacklogDataSourceOptions {
  backlogRepository: BacklogRepository
  hierarchyResolver: WorkOrderHierarchyResolver
  fieldMapping?: NetSuiteFieldMapping
}

export class NetSuiteBacklogDataSource implements BacklogDataSource {
  private readonly backlogRepository: BacklogRepository
  private readonly hierarchyResolver: WorkOrderHierarchyResolver
  private readonly fieldMapping: NetSuiteFieldMapping

  constructor(options: NetSuiteBacklogDataSourceOptions) {
    this.backlogRepository = options.backlogRepository
    this.hierarchyResolver = options.hierarchyResolver
    this.fieldMapping = options.fieldMapping ?? NETSUITE_FIELD_MAPPING
  }

  async getBacklog(filter: BacklogFilter, options?: SuiteQlOptions): Promise<BacklogRow[]> {
    assertLiveFieldMappingsReady(this.fieldMapping)
    const normalizedFilter = this.normalizeFilter(filter)
    const rows = await this.backlogRepository.getBacklog(normalizedFilter, options)
    return this.attachHierarchies(
      this.applyAllowedCustomerBoundary(rows, normalizedFilter),
      options
    )
  }

  async getSalesOrder(salesOrderNumber: string, options?: SuiteQlOptions): Promise<BacklogRow[]> {
    assertLiveFieldMappingsReady(this.fieldMapping)
    const normalizedSalesOrder = normalizeSalesOrderNumber(salesOrderNumber)
    const rows = await this.backlogRepository.getSalesOrder(normalizedSalesOrder, options)
    // Preserve outside-allowlist rows long enough for BacklogService to return its
    // distinct outside-allowed-customer outcome. Only allowed rows need hierarchy data.
    const allowedRows = rows.filter((row) => isAllowedCustomer(row.customerName))
    const enrichedAllowedRows = await this.attachHierarchies(allowedRows, options)
    const allowedRowsByKey = new Map(enrichedAllowedRows.map((row) => [row.rowKey, row]))
    return rows.map((row) => allowedRowsByKey.get(row.rowKey) ?? row)
  }

  private normalizeFilter(filter: BacklogFilter): BacklogFilter {
    const customerName = filter.customerName?.trim()
    if (!customerName || customerName === ALL_CUSTOMERS_VALUE) return {}
    if (!isAllowedCustomer(customerName)) {
      throw new NetSuiteIntegrationError('Only configured Hauser customers may be queried.', {
        code: 'invalid-query'
      })
    }
    return { customerName }
  }

  private applyAllowedCustomerBoundary(
    rows: readonly BacklogRow[],
    filter: BacklogFilter
  ): BacklogRow[] {
    return rows.filter(
      (row) =>
        isAllowedCustomer(row.customerName) &&
        (!filter.customerName || row.customerName === filter.customerName)
    )
  }

  private async attachHierarchies(
    rows: readonly BacklogRow[],
    options?: SuiteQlOptions
  ): Promise<BacklogRow[]> {
    const rootIds = [
      ...new Set(
        rows.map((row) => row.workOrderInternalId?.trim()).filter((id): id is string => Boolean(id))
      )
    ]
    if (rootIds.length === 0) return [...rows]

    // One batched relationship load prevents both N+1 requests and quantity fan-out.
    const hierarchies = await this.hierarchyResolver.getHierarchies(rootIds, options)
    return rows.map((row) => {
      const rootId = row.workOrderInternalId?.trim()
      const hierarchy = rootId ? hierarchies.get(rootId) : undefined
      return hierarchy ? { ...row, workOrderHierarchy: hierarchy } : row
    })
  }
}
