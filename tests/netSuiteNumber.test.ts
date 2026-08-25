import { describe, expect, it } from 'vitest'

import { parseNetSuiteNumber } from '../src/main/netsuite/transforms/netSuiteNumber'

describe('parseNetSuiteNumber', () => {
  it.each([
    ['1', 1],
    ['2', 2],
    ['-1', -1],
    ['-2', -2],
    ['2.5', 2.5],
    [1, 1],
    [2, 2],
    [-1, -1],
    [-2, -2],
    [2.5, 2.5],
    [null, null]
  ])('parses %j as %j', (input, expected) => {
    expect(parseNetSuiteNumber(input)).toBe(expected)
  })

  it.each(['', '   ', 'not-a-number', '2 chairs', Number.NaN, Number.POSITIVE_INFINITY, {}, true])(
    'returns null for malformed value %j instead of silently producing zero',
    (input) => {
      expect(parseNetSuiteNumber(input)).toBeNull()
    }
  )
})
