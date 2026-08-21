import type { SuiteQlQuery } from '../types/netsuiteTypes'
import { UnverifiedFieldMappingError } from '../errors'

export interface WorkOrderQueryFactory {
  createRelatedWorkOrdersQuery(rootWorkOrderInternalIds: readonly string[]): SuiteQlQuery
}

/** Blocks SKU-based guessing until an actual NetSuite transaction link is verified. */
export class PendingWorkOrderQueryFactory implements WorkOrderQueryFactory {
  createRelatedWorkOrdersQuery(): SuiteQlQuery {
    throw new UnverifiedFieldMappingError([
      'top-level Work Order association',
      'recursive child Work Order relationship'
    ])
  }
}
