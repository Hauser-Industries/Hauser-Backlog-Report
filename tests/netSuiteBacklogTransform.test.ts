import { describe, expect, it } from 'vitest'

import { transformBacklogRecord } from '../src/main/netsuite/transforms/backlogTransform'

describe('NetSuite active backlog row transformation', () => {
  it('inverts the verified line quantity and uses Customer Name as Ship To', () => {
    const row = transformBacklogRecord(
      {
        row_key: 'line-10',
        customer_internal_id: '1432',
        customer_name: 'LONDON - HAUSER COMPANY STORES',
        sales_order_number: 'SO10144',
        item: 'HSPR0290C',
        quantity: '-4',
        ship_to: 'A physical address that the active report must ignore'
      },
      { verified: true, orderedSign: 'invert' }
    )

    expect(row.quantity).toBe(4)
    expect(row.shipTo).toBe('LONDON - HAUSER COMPANY STORES')
    expect(row).not.toHaveProperty('quantityShipped')
    expect(row).not.toHaveProperty('quantityRemaining')
    expect(row).not.toHaveProperty('workOrderHierarchy')
  })
})
