import { describe, expect, it } from 'vitest'

import { getNetSuiteEnvironmentProfileByEnvironment } from '../src/main/netsuite/config/environmentProfiles'
import { VerifiedBacklogQueryFactory } from '../src/main/netsuite/queries/backlogQuery'
import { InvalidSalesOrderNumberError } from '../src/shared/utils/salesOrder'

describe('VerifiedBacklogQueryFactory demo-ready live query', () => {
  const excludedSalesOrderStatusFilter =
    "BUILTIN.CF(t.status) NOT IN ('SalesOrd:C', 'SalesOrd:F', 'SalesOrd:G', 'SalesOrd:H')"
  const factory = new VerifiedBacklogQueryFactory(
    getNetSuiteEnvironmentProfileByEnvironment('production')
  )

  it('loads only the six configured Production customers oldest first', () => {
    const query = factory.createBacklogQuery({})

    expect(query.name).toBe('hauser-backlog-sales-order-headers')
    expect(query.sql).toContain('t.entity IN (1432, 1446, 1578, 5602, 5625, 6344)')
    expect(query.sql).not.toMatch(/\b226\b|\b5601\b/)
    expect(query.sql).toContain(excludedSalesOrderStatusFilter)
    expect(query.sql).toContain('ORDER BY t.createddate ASC, t.id ASC')
  })

  it('applies the selected customer by its configured internal ID', () => {
    const query = factory.createBacklogQuery({
      customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES'
    })

    expect(query.sql).toContain('t.entity IN (6344)')
    expect(query.sql).not.toContain('5602, 5625')
  })

  it('creates an exact safe Sales Order query from only known-good fields', () => {
    const query = factory.createSalesOrderQuery('SO10144')

    expect(query.sql).toContain("UPPER(t.tranid) = 'SO10144'")
    expect(query.sql).toContain('t.custbody_nscs_duedatebal AS due_date')
    expect(query.sql).toContain('tl.quantity AS quantity')
    expect(query.sql).toContain(excludedSalesOrderStatusFilter)
    expect(query.sql).not.toMatch(/custcol_nscs_|createwo|type = 'WorkOrd'/i)
  })

  it('excludes terminal and billing-complete Sales Orders from exact header searches', () => {
    const query = factory.createExactSalesOrderHeaderQuery('SO10144')

    expect(query.sql).toContain(excludedSalesOrderStatusFilter)
    expect(query.sql).toContain("UPPER(t.tranid) = 'SO10144'")
  })

  it('creates a safe exact Purchase Order header query without changing report boundaries', () => {
    const query = factory.createExactPurchaseOrderHeaderQuery(" po'45001 ")

    expect(query.name).toBe('hauser-backlog-exact-purchase-order-header')
    expect(query.sql).toContain("UPPER(t.otherrefnum) = 'PO''45001'")
    expect(query.sql).toContain('t.entity IN (1432, 1446, 1578, 5602, 5625, 6344)')
    expect(query.sql).toContain(excludedSalesOrderStatusFilter)
    expect(query.sql).toContain('ORDER BY t.createddate ASC, t.id ASC')
  })

  it('creates a separate line query for validated current-page Sales Order IDs', () => {
    const query = factory.createSalesOrderLineQuery(['10144', '10145'])

    expect(query.sql).toContain('tl.transaction IN (10144, 10145)')
    expect(query.sql).toContain('tl.quantity AS quantity_api_value')
    expect(query.sql).not.toMatch(/custcol_nscs_|createwo|type = 'WorkOrd'/i)
    expect(() => factory.createSalesOrderLineQuery(['10144', 'unsafe'])).toThrow()
  })

  it('rejects unsafe Sales Order text before query construction', () => {
    expect(() => factory.createSalesOrderQuery("SO10'144")).toThrow(InvalidSalesOrderNumberError)
  })
})
