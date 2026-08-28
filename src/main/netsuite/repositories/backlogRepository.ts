import type { BacklogFilter, BacklogPageData, SalesOrderGroup } from '@shared/types/backlog'

import type { SuiteQlOptions } from '../client/suiteQlClient'
import type { BacklogQueryFactory } from '../queries/backlogQuery'
import type { VerifiedQuantityNormalization } from '../transforms/quantityNormalization'
import type { SuiteQlClient } from '../client/suiteQlClient'
import {
  transformSalesOrderHeader,
  transformSalesOrderLine
} from '../transforms/groupedBacklogTransform'
import { DEFAULT_SALES_ORDER_PAGE_SIZE } from '../../data/backlogGrouping'
import type { WorkOrderRelationshipResolver } from '../workOrders/workOrderRelationshipResolver'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'

export interface BacklogRepository {
  getBacklog(filter: BacklogFilter, options?: SuiteQlOptions): Promise<BacklogPageData>
  getSalesOrder(salesOrderNumber: string, options?: SuiteQlOptions): Promise<BacklogPageData>
  getPurchaseOrder(purchaseOrderNumber: string, options?: SuiteQlOptions): Promise<BacklogPageData>
}

export class NetSuiteBacklogRepository implements BacklogRepository {
  private readonly suiteQlClient: SuiteQlClient
  private readonly queryFactory: BacklogQueryFactory
  private readonly quantityRules: VerifiedQuantityNormalization
  private readonly workOrderResolver?: WorkOrderRelationshipResolver
  private readonly logger: DiagnosticLogger

  constructor(
    suiteQlClient: SuiteQlClient,
    queryFactory: BacklogQueryFactory,
    quantityRules: VerifiedQuantityNormalization,
    workOrderResolver?: WorkOrderRelationshipResolver,
    logger: DiagnosticLogger = netSuiteDiagnosticLogger
  ) {
    this.suiteQlClient = suiteQlClient
    this.queryFactory = queryFactory
    this.quantityRules = quantityRules
    if (workOrderResolver) this.workOrderResolver = workOrderResolver
    this.logger = logger
  }

  async getBacklog(filter: BacklogFilter, options?: SuiteQlOptions): Promise<BacklogPageData> {
    const page = filter.page ?? 0
    const pageSize = filter.pageSize ?? DEFAULT_SALES_ORDER_PAGE_SIZE
    const headerPage = await this.suiteQlClient.executeSuiteQL(
      this.queryFactory.createSalesOrderHeaderQuery(filter).sql,
      {
        limit: pageSize,
        offset: page * pageSize,
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
      }
    )
    const salesOrders = headerPage.items.map(transformSalesOrderHeader)
    await this.attachItemLines(salesOrders, options)
    await this.attachWorkOrders(salesOrders)

    return {
      salesOrders,
      page,
      pageSize,
      totalSalesOrders: headerPage.totalResults,
      hasPrevious: page > 0,
      hasNext: headerPage.hasMore
    }
  }

  async getSalesOrder(
    salesOrderNumber: string,
    options?: SuiteQlOptions
  ): Promise<BacklogPageData> {
    const headerPage = await this.suiteQlClient.executeSuiteQL(
      this.queryFactory.createExactSalesOrderHeaderQuery(salesOrderNumber).sql,
      {
        limit: 1,
        offset: 0,
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
      }
    )
    const salesOrders = headerPage.items.map(transformSalesOrderHeader)
    await this.attachItemLines(salesOrders, options)
    await this.attachWorkOrders(salesOrders)

    return {
      salesOrders,
      page: 0,
      pageSize: 1,
      totalSalesOrders: salesOrders.length,
      hasPrevious: false,
      hasNext: false
    }
  }

  async getPurchaseOrder(
    purchaseOrderNumber: string,
    options?: SuiteQlOptions
  ): Promise<BacklogPageData> {
    const headerResult = await this.suiteQlClient.queryAll(
      this.queryFactory.createExactPurchaseOrderHeaderQuery(purchaseOrderNumber),
      options
    )
    const salesOrders = headerResult.items.map(transformSalesOrderHeader)
    await this.attachItemLines(salesOrders, options)
    await this.attachWorkOrders(salesOrders)

    return {
      salesOrders,
      page: 0,
      pageSize: Math.max(1, salesOrders.length),
      totalSalesOrders: salesOrders.length,
      hasPrevious: false,
      hasNext: false
    }
  }

  private async attachItemLines(
    salesOrders: SalesOrderGroup[],
    options?: SuiteQlOptions
  ): Promise<void> {
    if (salesOrders.length === 0) return

    const result = await this.suiteQlClient.queryAll(
      this.queryFactory.createSalesOrderLineQuery(
        salesOrders.map((salesOrder) => salesOrder.salesOrderInternalId)
      ),
      options
    )
    const salesOrdersById = new Map(
      salesOrders.map((salesOrder) => [salesOrder.salesOrderInternalId, salesOrder])
    )

    for (const record of result.items) {
      const transformed = transformSalesOrderLine(record, this.quantityRules)
      salesOrdersById.get(transformed.salesOrderInternalId)?.items.push(transformed.item)
    }
  }

  private async attachWorkOrders(salesOrders: SalesOrderGroup[]): Promise<void> {
    if (!this.workOrderResolver || salesOrders.length === 0) return

    try {
      const resolution = await this.workOrderResolver.resolve(salesOrders)
      if (!resolution.succeeded) return

      for (const salesOrder of salesOrders) {
        for (const item of salesOrder.items) {
          const lineKey = `${salesOrder.salesOrderInternalId}:${item.lineId}`
          if (resolution.ambiguousLineKeys.has(lineKey)) continue
          const workOrder = resolution.bySalesOrderLine.get(lineKey)
          if (!workOrder) {
            item.workOrderStatus = 'No Work Order'
            continue
          }
          item.workOrderInternalId = workOrder.internalId
          item.workOrderNumber = workOrder.number
          if (workOrder.status) item.workOrderStatus = workOrder.status
          if (workOrder.built !== undefined) item.built = workOrder.built
        }
      }
    } catch {
      this.logger.warn('Work Order resolution was isolated from the base report.', {
        endpointCategory: 'work-order-lookup',
        salesOrderCount: salesOrders.length
      })
    }
  }
}
