import { describe, expect, it } from 'vitest'

import {
  InvalidPurchaseOrderNumberError,
  normalizePurchaseOrderNumber
} from '../src/shared/utils/purchaseOrder'

describe('Purchase Order normalization', () => {
  it.each([
    [' PO-45001 ', 'PO-45001'],
    ['web-88421', 'WEB-88421'],
    ['182560', '182560'],
    ['PO 123/45', 'PO 123/45']
  ])('normalizes %j for an exact case-insensitive search', (input, expected) => {
    expect(normalizePurchaseOrderNumber(input)).toBe(expected)
  })

  it.each(['', '   ', 'PO-1; SELECT', 'PO--COMMENT', 'PO/*COMMENT', 'PO\u0000123'])(
    'rejects unsafe input %j before a NetSuite request',
    (input) => {
      expect(() => normalizePurchaseOrderNumber(input)).toThrow(InvalidPurchaseOrderNumberError)
    }
  )
})
