import { describe, expect, it } from 'vitest'

import { transformWorkOrderPayload } from '../src/main/data/transforms/workOrderTransform'
import { formatDate } from '../src/shared/utils/date'
import { getStatusTone } from '../src/shared/utils/status'

describe('date-only values', () => {
  it('formats a YYYY-MM-DD value as that calendar day without a timezone shift', () => {
    const formatted = formatDate('2026-08-21')

    expect(formatted).toBe('Aug 21, 2026')
  })
})

describe('unknown work-order statuses', () => {
  it('preserves the authoritative raw label and uses neutral styling', () => {
    const [record] = transformWorkOrderPayload({
      items: [
        {
          internalId: 'wo-quality',
          workOrderNumber: 'WO-QUALITY',
          item: 'ABC',
          statusCode: 'QUALITY_REVIEW',
          statusLabel: 'Awaiting Engineering Review'
        }
      ]
    })

    expect(record?.statusLabel).toBe('Awaiting Engineering Review')
    expect(getStatusTone(record?.statusLabel)).toBe('neutral')
  })
})
