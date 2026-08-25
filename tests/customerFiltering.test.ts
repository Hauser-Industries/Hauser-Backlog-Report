import { describe, expect, it } from 'vitest'

import { MockBacklogDataSource } from '../src/main/data/mock/mockBacklogDataSource'
import { BacklogService } from '../src/main/services/backlogService'
import { ALLOWED_CUSTOMERS } from '../src/shared/constants/customers'

const NOW = new Date('2026-08-21T19:15:00.000Z')

describe('customer allowlist', () => {
  it('returns all and only the six configured customers in the full report', async () => {
    const page = await new MockBacklogDataSource().getBacklog({})
    const customerNames = new Set(page.salesOrders.map((salesOrder) => salesOrder.customerName))

    expect(customerNames).toEqual(new Set(ALLOWED_CUSTOMERS))
    expect(
      page.salesOrders.every((salesOrder) =>
        ALLOWED_CUSTOMERS.includes(salesOrder.customerName as never)
      )
    ).toBe(true)
  })

  it('filters to one configured customer', async () => {
    const customerName = 'WATERLOO - HAUSER COMPANY STORES'
    const page = await new MockBacklogDataSource().getBacklog({ customerName })

    expect(page.salesOrders.length).toBeGreaterThan(0)
    expect(page.salesOrders.every((salesOrder) => salesOrder.customerName === customerName)).toBe(
      true
    )
  })

  it('classifies a real sales order for an outside customer instead of displaying it', async () => {
    const service = new BacklogService(new MockBacklogDataSource(), () => NOW)
    const response = await service.searchSalesOrder({ salesOrderNumber: '9999' })

    expect(response.outcome).toBe('outside-allowed-customer')
    expect(response.salesOrders).toEqual([])
    expect(response.lastUpdated).toBe(NOW.toISOString())
  })
})
