import type { BacklogFilter, BacklogRow } from '@shared/types/backlog'

import type { SuiteQlOptions } from '../client/suiteQlClient'
import type { BacklogQueryFactory } from '../queries/backlogQuery'
import type { VerifiedQuantityNormalization } from '../transforms/quantityNormalization'
import type { SuiteQlClient } from '../client/suiteQlClient'
import { transformBacklogRecords } from '../transforms/backlogTransform'

export interface BacklogRepository {
  getBacklog(filter: BacklogFilter, options?: SuiteQlOptions): Promise<BacklogRow[]>
  getSalesOrder(salesOrderNumber: string, options?: SuiteQlOptions): Promise<BacklogRow[]>
}

export class NetSuiteBacklogRepository implements BacklogRepository {
  private readonly suiteQlClient: SuiteQlClient
  private readonly queryFactory: BacklogQueryFactory
  private readonly quantityRules: VerifiedQuantityNormalization

  constructor(
    suiteQlClient: SuiteQlClient,
    queryFactory: BacklogQueryFactory,
    quantityRules: VerifiedQuantityNormalization
  ) {
    this.suiteQlClient = suiteQlClient
    this.queryFactory = queryFactory
    this.quantityRules = quantityRules
  }

  async getBacklog(filter: BacklogFilter, options?: SuiteQlOptions): Promise<BacklogRow[]> {
    const result = await this.suiteQlClient.queryAll(
      this.queryFactory.createBacklogQuery(filter),
      options
    )
    return transformBacklogRecords(result.items, this.quantityRules)
  }

  async getSalesOrder(salesOrderNumber: string, options?: SuiteQlOptions): Promise<BacklogRow[]> {
    const result = await this.suiteQlClient.queryAll(
      this.queryFactory.createSalesOrderQuery(salesOrderNumber),
      options
    )
    return transformBacklogRecords(result.items, this.quantityRules)
  }
}
