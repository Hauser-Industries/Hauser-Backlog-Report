import { describe, expect, it } from 'vitest'

import {
  InvalidSalesOrderNumberError,
  normalizeSalesOrderNumber
} from '../src/shared/utils/salesOrder'

describe('normalizeSalesOrderNumber', () => {
  it.each([
    ['10144', 'SO10144'],
    ['SO10144', 'SO10144'],
    ['so10144', 'SO10144'],
    [' SO10144 ', 'SO10144']
  ])('normalizes %j to %s', (input, expected) => {
    expect(normalizeSalesOrderNumber(input)).toBe(expected)
  })

  it.each(["SO10'144", 'SO10144 OR 1=1', 'ABC123', 'SO 10144', ''])(
    'rejects unsafe input %j',
    (input) => {
      expect(() => normalizeSalesOrderNumber(input)).toThrow(InvalidSalesOrderNumberError)
    }
  )
})
