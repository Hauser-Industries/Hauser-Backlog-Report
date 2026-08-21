import { describe, expect, it } from 'vitest'

import { attachWorkOrderHierarchies } from '../src/main/services/backlogMerge'
import {
  calculateQuantityRemaining,
  formatQuantity,
  normalizeQuantity
} from '../src/shared/utils/quantity'
import { makeBacklogRow, makeWorkOrderRecord } from './helpers/testData'

describe('quantity normalization', () => {
  it('normalizes ordered, shipped, and remaining decimal values', () => {
    expect(normalizeQuantity('10.0000000004')).toBe(10)
    expect(normalizeQuantity('2.75')).toBe(2.75)
    expect(calculateQuantityRemaining(10.5, 3.25)).toBe(7.25)
    expect(formatQuantity(2.0000000004)).toBe('2')
  })

  it('gracefully normalizes missing and malformed numeric values', () => {
    expect(normalizeQuantity(undefined)).toBe(0)
    expect(normalizeQuantity(null)).toBe(0)
    expect(normalizeQuantity('not-a-number')).toBe(0)
  })
})

describe('quantity-safe work order merge', () => {
  it('does not multiply a sales-order line when three child work orders are attached', () => {
    const row = makeBacklogRow({ quantity: 10, quantityShipped: 3, quantityRemaining: 7 })
    const workOrders = [
      makeWorkOrderRecord('wo-1'),
      makeWorkOrderRecord('wo-child-a', 'wo-1'),
      makeWorkOrderRecord('wo-child-b', 'wo-1'),
      makeWorkOrderRecord('wo-child-c', 'wo-1')
    ]

    const merged = attachWorkOrderHierarchies([row], workOrders)

    expect(merged).toHaveLength(1)
    expect(merged[0]?.quantity).toBe(10)
    expect(merged[0]?.quantityShipped).toBe(3)
    expect(merged[0]?.quantityRemaining).toBe(7)
    expect(merged[0]?.workOrderHierarchy?.children).toHaveLength(3)
  })
})
