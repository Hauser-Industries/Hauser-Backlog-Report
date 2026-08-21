import type { SuiteQlOptions } from '../client/suiteQlClient'
import type { WorkOrderQueryFactory } from '../queries/workOrderQuery'
import type { WorkOrderRecord } from '../types/netsuiteTypes'
import type { WorkOrderQuantityRules } from '../transforms/workOrderTransform'
import type { SuiteQlClient } from '../client/suiteQlClient'
import { transformWorkOrderRecords } from '../transforms/workOrderTransform'

export interface WorkOrderRepository {
  getRelatedWorkOrders(
    rootWorkOrderInternalIds: readonly string[],
    options?: SuiteQlOptions
  ): Promise<WorkOrderRecord[]>
}

export class NetSuiteWorkOrderRepository implements WorkOrderRepository {
  private readonly suiteQlClient: SuiteQlClient
  private readonly queryFactory: WorkOrderQueryFactory
  private readonly quantityRules: WorkOrderQuantityRules

  constructor(
    suiteQlClient: SuiteQlClient,
    queryFactory: WorkOrderQueryFactory,
    quantityRules: WorkOrderQuantityRules
  ) {
    this.suiteQlClient = suiteQlClient
    this.queryFactory = queryFactory
    this.quantityRules = quantityRules
  }

  async getRelatedWorkOrders(
    rootWorkOrderInternalIds: readonly string[],
    options?: SuiteQlOptions
  ): Promise<WorkOrderRecord[]> {
    const uniqueRootIds = [...new Set(rootWorkOrderInternalIds.filter(Boolean))]
    if (uniqueRootIds.length === 0) return []

    const result = await this.suiteQlClient.queryAll(
      this.queryFactory.createRelatedWorkOrdersQuery(uniqueRootIds),
      options
    )
    return transformWorkOrderRecords(result.items, this.quantityRules)
  }
}
