import { describe, expect, it } from 'vitest'

import { MOCK_BACKLOG_ROWS, MOCK_SOURCE_ROWS } from '../src/main/data/mock/fixtures'
import { ALLOWED_CUSTOMERS } from '../src/shared/constants/customers'

describe('realistic mock fixtures', () => {
  it('covers all six customers, multiple sales orders, decimal shipping, and no-WO rows', () => {
    expect(new Set(MOCK_BACKLOG_ROWS.map((row) => row.customerName))).toEqual(
      new Set(ALLOWED_CUSTOMERS)
    )
    expect(new Set(MOCK_BACKLOG_ROWS.map((row) => row.salesOrderNumber)).size).toBeGreaterThan(6)
    expect(MOCK_BACKLOG_ROWS.some((row) => !row.workOrderInternalId)).toBe(true)
    expect(MOCK_BACKLOG_ROWS.some((row) => !Number.isInteger(row.quantityShipped))).toBe(true)
    expect(
      MOCK_SOURCE_ROWS.some((row) => !ALLOWED_CUSTOMERS.includes(row.customerName as never))
    ).toBe(true)
  })

  it('contains a leaf, a three-child root, and a hierarchy more than three levels deep', () => {
    const multiChild = MOCK_BACKLOG_ROWS.find((row) => row.workOrderNumber === 'WO1000')
    const leaf = MOCK_BACKLOG_ROWS.find((row) => row.workOrderNumber === 'WO1010')

    expect(multiChild?.workOrderHierarchy?.children).toHaveLength(3)
    expect(
      multiChild?.workOrderHierarchy?.children[2]?.children[0]?.children[0]?.workOrderNumber
    ).toBe('WO1005')
    expect(leaf?.workOrderHierarchy?.children).toEqual([])
  })

  it('preserves an unfamiliar status label in the production-shaped mock row', () => {
    const row = MOCK_BACKLOG_ROWS.find((candidate) => candidate.workOrderNumber === 'WO2000')

    expect(row?.workOrderStatus?.label).toBe('Pending Material Review')
    expect(row?.workOrderHierarchy?.statusLabel).toBe('Pending Material Review')
  })
})
