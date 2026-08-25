import { describe, expect, it } from 'vitest'

import { MOCK_BACKLOG_ROWS, MOCK_SOURCE_ROWS } from '../src/main/data/mock/fixtures'
import { ALLOWED_CUSTOMERS } from '../src/shared/constants/customers'

describe('realistic mock fixtures', () => {
  it('covers all six customers, multiple sales orders, quantities, and no-WO rows', () => {
    expect(new Set(MOCK_BACKLOG_ROWS.map((row) => row.customerName))).toEqual(
      new Set(ALLOWED_CUSTOMERS)
    )
    expect(new Set(MOCK_BACKLOG_ROWS.map((row) => row.salesOrderNumber)).size).toBeGreaterThan(6)
    expect(MOCK_BACKLOG_ROWS.some((row) => !row.workOrderInternalId)).toBe(true)
    expect(MOCK_BACKLOG_ROWS.some((row) => !Number.isInteger(row.quantity))).toBe(true)
    expect(
      MOCK_SOURCE_ROWS.some((row) => !ALLOWED_CUSTOMERS.includes(row.customerName as never))
    ).toBe(true)
  })

  it('uses Customer Name for Ship To and exposes no retired or child-WO fields', () => {
    for (const row of MOCK_BACKLOG_ROWS) {
      expect(row.shipTo).toBe(row.customerName)
      expect(row).not.toHaveProperty('quantityShipped')
      expect(row).not.toHaveProperty('quantityRemaining')
      expect(row).not.toHaveProperty('workOrderHierarchy')
    }
  })

  it('preserves an unfamiliar status label in the production-shaped mock row', () => {
    const row = MOCK_BACKLOG_ROWS.find((candidate) => candidate.workOrderNumber === 'WO2000')

    expect(row?.workOrderStatusCode).toBe('PENDING_MATERIAL')
    expect(row?.workOrderStatusLabel).toBe('Pending Material Review')
  })
})
