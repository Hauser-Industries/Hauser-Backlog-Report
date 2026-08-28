import { describe, expect, it, vi } from 'vitest'

import { NetSuiteBacklogDataSource } from '../src/main/netsuite/dataSource/netSuiteBacklogDataSource'
import type { BacklogRepository } from '../src/main/netsuite/repositories/backlogRepository'
import { makeBacklogPage, makeSalesOrderGroup } from './helpers/testData'

describe('NetSuiteBacklogDataSource grouped Sales Order flow', () => {
  it('normalizes a Purchase Order before calling the exact repository path', async () => {
    const getPurchaseOrder = vi.fn(async () => makeBacklogPage([]))
    const repository: BacklogRepository = {
      getBacklog: vi.fn(async () => makeBacklogPage([])),
      getSalesOrder: vi.fn(async () => makeBacklogPage([])),
      getPurchaseOrder
    }
    const source = new NetSuiteBacklogDataSource({ backlogRepository: repository })

    await source.getPurchaseOrder(' po-45001 ')

    expect(getPurchaseOrder).toHaveBeenCalledWith('PO-45001', undefined)
  })

  it('returns repository Sales Order groups without child Work Order traversal', async () => {
    const getBacklog = vi.fn(async () =>
      makeBacklogPage([
        makeSalesOrderGroup({
          items: [
            {
              rowKey: '1-1',
              lineId: '1',
              lineSequence: 1,
              itemInternalId: '10',
              item: 'CHAIR',
              itemDescription: 'Chair',
              quantity: 4
            }
          ]
        })
      ])
    )
    const repository: BacklogRepository = {
      getBacklog,
      getSalesOrder: vi.fn(async () => makeBacklogPage([])),
      getPurchaseOrder: vi.fn(async () => makeBacklogPage([]))
    }
    const source = new NetSuiteBacklogDataSource({
      backlogRepository: repository
    })

    const page = await source.getBacklog({})

    expect(getBacklog).toHaveBeenCalledOnce()
    expect(page.salesOrders).toHaveLength(1)
    expect(page.salesOrders[0]?.items[0]?.quantity).toBe(4)
  })
})
