import { describe, expect, it } from 'vitest'

import { transformSalesOrderLine } from '../src/main/netsuite/transforms/groupedBacklogTransform'
import { formatQuantity } from '../src/shared/utils/quantity'

function line(quantity: string | null, alias = 'quantity_api_value') {
  return transformSalesOrderLine(
    {
      sales_order_internal_id: '10144',
      line_id: '11',
      line_sequence: '1',
      item_internal_id: '44',
      item: 'HSPR0290C',
      [alias]: quantity
    },
    { verified: true, orderedSign: 'invert' }
  ).item
}

describe('grouped report quantity mapping', () => {
  it.each([
    ['-1', 1],
    ['-2', 2],
    ['-2', 2]
  ])('maps raw %s to report quantity %s', (raw, expected) => {
    const item = line(raw)

    expect(item.quantity).toBe(expected)
    expect(formatQuantity(item.quantity)).toBe(String(expected))
  })

  it('normalizes SuiteQL alias casing like the working diagnostic', () => {
    expect(line('-2', 'QUANTITY_API_VALUE').quantity).toBe(2)
  })

  it('preserves a missing quantity as null and renders a blank instead of zero', () => {
    const item = line(null)

    expect(item.quantity).toBeNull()
    expect(formatQuantity(item.quantity)).toBe('')
    expect(formatQuantity(item.quantity)).not.toBe('0')
  })
})
