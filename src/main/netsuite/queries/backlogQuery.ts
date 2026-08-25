import type { BacklogFilter } from '@shared/types/backlog'

import type { SuiteQlQuery } from '../types/netsuiteTypes'
import { UnverifiedFieldMappingError } from '../errors'
import type { NetSuiteEnvironmentProfile } from '../config/environmentProfiles'
import { InvalidSalesOrderNumberError } from '@shared/utils/salesOrder'

export interface BacklogQueryFactory {
  createBacklogQuery(filter: BacklogFilter): SuiteQlQuery
  createSalesOrderQuery(salesOrderNumber: string): SuiteQlQuery
  createSalesOrderHeaderQuery(filter: BacklogFilter): SuiteQlQuery
  createExactSalesOrderHeaderQuery(salesOrderNumber: string): SuiteQlQuery
  createSalesOrderLineQuery(salesOrderInternalIds: readonly string[]): SuiteQlQuery
}

function numericIdList(ids: readonly string[]): string {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0 || uniqueIds.some((id) => !/^[0-9]+$/.test(id))) {
    throw new Error('Configured customer IDs must be numeric NetSuite internal IDs.')
  }
  return uniqueIds.join(', ')
}

function baseBacklogQuery(whereClause: string): string {
  return `SELECT
    TO_CHAR(t.id) || '-' || TO_CHAR(tl.id) AS row_key,
    t.entity AS customer_internal_id,
    BUILTIN.DF(t.entity) AS customer_name,
    t.otherrefnum AS po_number,
    t.id AS sales_order_internal_id,
    t.tranid AS sales_order_number,
    tl.item AS item_internal_id,
    BUILTIN.DF(tl.item) AS item,
    tl.memo AS item_description,
    tl.quantity AS quantity,
    t.createddate AS created_date,
    t.custbody_nscs_duedatebal AS due_date
FROM transaction t
INNER JOIN transactionline tl
    ON tl.transaction = t.id
WHERE t.type = 'SalesOrd'
    AND NVL(tl.mainline, 'F') = 'F'
    AND NVL(tl.taxline, 'F') = 'F'
    AND NVL(tl.isclosed, 'F') = 'F'
    AND tl.item IS NOT NULL
    AND ${whereClause}
ORDER BY t.createddate DESC, t.id DESC, tl.linesequencenumber, tl.id`
}

function salesOrderHeaderQuery(whereClause: string): string {
  return `SELECT
    t.id AS sales_order_internal_id,
    t.tranid AS sales_order_number,
    t.entity AS customer_internal_id,
    BUILTIN.DF(t.entity) AS customer_name,
    t.otherrefnum AS po_number,
    t.createddate AS created_date,
    t.custbody_nscs_duedatebal AS due_date
FROM transaction t
WHERE t.type = 'SalesOrd'
    AND ${whereClause}
ORDER BY t.createddate DESC, t.id DESC`
}

function salesOrderLineQuery(salesOrderInternalIds: readonly string[]): string {
  return `SELECT
    tl.transaction AS sales_order_internal_id,
    tl.id AS line_id,
    tl.linesequencenumber AS line_sequence,
    tl.item AS item_internal_id,
    BUILTIN.DF(tl.item) AS item,
    tl.memo AS item_description,
    tl.quantity AS quantity_api_value
FROM transactionline tl
WHERE tl.transaction IN (${numericIdList(salesOrderInternalIds)})
    AND NVL(tl.mainline, 'F') = 'F'
    AND NVL(tl.taxline, 'F') = 'F'
    AND tl.item IS NOT NULL
ORDER BY tl.transaction, tl.linesequencenumber, tl.id`
}

/** Demo-ready live query using only fields already proven by the SO10144 inspector. */
export class VerifiedBacklogQueryFactory implements BacklogQueryFactory {
  private readonly customerIdByName: ReadonlyMap<string, string>
  private readonly allCustomerIds: string

  constructor(profile: NetSuiteEnvironmentProfile) {
    this.customerIdByName = new Map(
      profile.customers.map((customer) => [customer.name, customer.internalId])
    )
    this.allCustomerIds = numericIdList(profile.customers.map((customer) => customer.internalId))
  }

  createBacklogQuery(filter: BacklogFilter): SuiteQlQuery {
    return this.createSalesOrderHeaderQuery(filter)
  }

  createSalesOrderHeaderQuery(filter: BacklogFilter): SuiteQlQuery {
    const customerId = filter.customerName
      ? this.customerIdByName.get(filter.customerName)
      : undefined
    if (filter.customerName && !customerId) {
      throw new Error('Customer is not configured for the active NetSuite environment.')
    }
    return {
      name: 'hauser-backlog-sales-order-headers',
      sql: salesOrderHeaderQuery(`t.entity IN (${customerId ?? this.allCustomerIds})`)
    }
  }

  createSalesOrderQuery(salesOrderNumber: string): SuiteQlQuery {
    if (!/^SO[0-9]+$/.test(salesOrderNumber)) throw new InvalidSalesOrderNumberError()
    return {
      name: 'hauser-backlog-sales-order',
      sql: baseBacklogQuery(
        `t.entity IN (${this.allCustomerIds}) AND UPPER(t.tranid) = '${salesOrderNumber}'`
      )
    }
  }

  createExactSalesOrderHeaderQuery(salesOrderNumber: string): SuiteQlQuery {
    if (!/^SO[0-9]+$/.test(salesOrderNumber)) throw new InvalidSalesOrderNumberError()
    return {
      name: 'hauser-backlog-exact-sales-order-header',
      sql: salesOrderHeaderQuery(
        `t.entity IN (${this.allCustomerIds}) AND UPPER(t.tranid) = '${salesOrderNumber}'`
      )
    }
  }

  createSalesOrderLineQuery(salesOrderInternalIds: readonly string[]): SuiteQlQuery {
    return {
      name: 'hauser-backlog-sales-order-lines',
      sql: salesOrderLineQuery(salesOrderInternalIds)
    }
  }
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

  createSalesOrderHeaderQuery(): SuiteQlQuery {
    return this.createBacklogQuery()
  }

  createExactSalesOrderHeaderQuery(): SuiteQlQuery {
    return this.createSalesOrderQuery()
  }

  createSalesOrderLineQuery(): SuiteQlQuery {
    throw new UnverifiedFieldMappingError(['Sales Order item line query'])
  }
}
