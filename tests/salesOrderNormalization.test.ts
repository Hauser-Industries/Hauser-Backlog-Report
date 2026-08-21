import { describe, expect, it } from 'vitest'

import {
  InvalidSalesOrderNumberError,
  normalizeSalesOrderNumber
} from '../src/shared/utils/salesOrder'

describe('normalizeSalesOrderNumber', () => {
  it.each([
    ['1234', 'SO1234'],
    ['SO1234', 'SO1234'],
    ['so1234', 'SO1234'],
    [' SO1234 ', 'SO1234']
  ])('normalizes %j to %s', (input, expected) => {
    expect(normalizeSalesOrderNumber(input)).toBe(expected)
  })

  it.each(['', 'SO', '1234A', 'PO1234', 'SO 1234'])('rejects unsafe input %j', (input) => {
    expect(() => normalizeSalesOrderNumber(input)).toThrow(InvalidSalesOrderNumberError)
  })
})
