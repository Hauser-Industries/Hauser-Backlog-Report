import type { BacklogFilter } from '@shared/types/backlog'

import type { SuiteQlQuery } from '../types/netsuiteTypes'
import { UnverifiedFieldMappingError } from '../errors'

export interface BacklogQueryFactory {
  createBacklogQuery(filter: BacklogFilter): SuiteQlQuery
  createSalesOrderQuery(salesOrderNumber: string): SuiteQlQuery
}

/**
 * Deliberately blocks live retrieval until the account fields, row grain,
 * exclusions, quantity signs, and joins have been compared to the existing report.
 */
export class PendingBacklogQueryFactory implements BacklogQueryFactory {
  createBacklogQuery(): SuiteQlQuery {
    throw new UnverifiedFieldMappingError([
      'backlog SELECT expressions',
      'backlog FROM/JOIN clauses',
      'backlog inclusion/exclusion rules'
    ])
  }

  createSalesOrderQuery(): SuiteQlQuery {
    throw new UnverifiedFieldMappingError([
      'direct Sales Order query',
      'allowed-customer restriction'
    ])
  }
}
