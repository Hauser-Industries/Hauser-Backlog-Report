import { describe, expect, it } from 'vitest'

import { MockBacklogDataSource } from '../src/main/data/mock/mockBacklogDataSource'
import { BacklogService } from '../src/main/services/backlogService'
import { ALLOWED_CUSTOMERS } from '../src/shared/constants/customers'

const NOW = new Date('2026-08-21T19:15:00.000Z')

describe('customer allowlist', () => {
  it('returns all and only the six configured customers in the full report', async () => {
    const rows = await new MockBacklogDataSource().getBacklog({})
    const customerNames = new Set(rows.map((row) => row.customerName))

    expect(customerNames).toEqual(new Set(ALLOWED_CUSTOMERS))
    expect(rows.every((row) => ALLOWED_CUSTOMERS.includes(row.customerName as never))).toBe(true)
  })

  it('filters to one configured customer', async () => {
    const customerName = 'WATERLOO - HAUSER COMPANY STORES'
    const rows = await new MockBacklogDataSource().getBacklog({ customerName })

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.customerName === customerName)).toBe(true)
  })

  it('classifies a real sales order for an outside customer instead of displaying it', async () => {
    const service = new BacklogService(new MockBacklogDataSource(), () => NOW)
    const response = await service.searchSalesOrder({ salesOrderNumber: '9999' })

    expect(response.outcome).toBe('outside-allowed-customer')
    expect(response.rows).toEqual([])
    expect(response.lastUpdated).toBe(NOW.toISOString())
  })
})
