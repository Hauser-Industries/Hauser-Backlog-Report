import { describe, expect, it, vi } from 'vitest'

import {
  BacklogPrintDataService,
  type BacklogPrintOperations
} from '../src/main/services/backlogPrintDataService'
import type { BacklogResponse, SalesOrderGroup } from '../src/shared/types/backlog'
import { makeSalesOrderGroup } from './helpers/testData'

function response(
  salesOrders: SalesOrderGroup[],
  page = 0,
  hasNext = false
): BacklogResponse {
  return {
    salesOrders,
    page,
    pageSize: 100,
    totalSalesOrders: salesOrders.length + (hasNext ? 1 : 0),
    hasPrevious: page > 0,
    hasNext,
    lastUpdated: '2026-08-27T12:00:00.000Z',
    outcome: 'success'
  }
}

function printableOrder(id: string): SalesOrderGroup {
  return makeSalesOrderGroup({
    salesOrderInternalId: id,
    salesOrderNumber: `SO${id}`,
    items: [
      {
        rowKey: `${id}-1`,
        lineId: '1',
        lineSequence: 1,
        itemInternalId: '44',
        item: 'CHAIR',
        itemDescription: 'Chair',
        quantity: 4,
        workOrderInternalId: '900',
        workOrderNumber: 'WO900',
        workOrderStatus: 'Released'
      }
    ]
  })
}

describe('BacklogPrintDataService', () => {
  it('walks every selected-customer page and deduplicates Built and Painted requests', async () => {
    const getBacklog = vi.fn(async (filter: { page: number }) =>
      filter.page === 0
        ? response([printableOrder('101')], 0, true)
        : response([printableOrder('102')], 1, false)
    )
    const getWorkOrderBuilt = vi.fn(async () => ({
      success: true as const,
      values: [{ workOrderInternalId: '900', built: 2 }]
    }))
    const getWorkOrderPainted = vi.fn(async () => ({
      success: true as const,
      values: [{ workOrderInternalId: '900', painted: 1 }]
    }))
    const operations = {
      getBacklog,
      searchSalesOrder: vi.fn(async () => response([])),
      searchPurchaseOrder: vi.fn(async () => response([])),
      getSalesOrderDetails: vi.fn(async () => ({
        success: true as const,
        items: [
          {
            lineId: '1',
            paintName: 'PAINT-BLACK',
            paintDescription: 'Textured black powder coat',
            fabricDescription: 'Outdoor fabric'
          }
        ]
      })),
      getWorkOrderBuilt,
      getWorkOrderPainted
    } satisfies BacklogPrintOperations
    const service = new BacklogPrintDataService(
      operations,
      () => new Date('2026-08-27T13:00:00.000Z')
    )

    const snapshot = await service.prepare({
      scope: { kind: 'customer', customerName: 'OTTAWA - HAUSER COMPANY STORES' }
    })

    expect(getBacklog).toHaveBeenNthCalledWith(1, {
      customerName: 'OTTAWA - HAUSER COMPANY STORES',
      page: 0,
      pageSize: 100
    })
    expect(getBacklog).toHaveBeenNthCalledWith(2, {
      customerName: 'OTTAWA - HAUSER COMPANY STORES',
      page: 1,
      pageSize: 100
    })
    expect(getWorkOrderBuilt).toHaveBeenCalledWith({
      workOrders: [{ workOrderInternalId: '900', workOrderNumber: 'WO900' }]
    })
    expect(getWorkOrderPainted).toHaveBeenCalledWith({
      workOrders: [{ workOrderInternalId: '900', workOrderNumber: 'WO900' }]
    })
    expect(snapshot.salesOrders).toHaveLength(2)
    expect(snapshot.salesOrders[0]?.items[0]).toMatchObject({
      paintDescription: 'Textured black powder coat',
      fabricDescription: 'Outdoor fabric',
      built: 2,
      painted: 1
    })
    expect(snapshot.scopeLabel).toBe('OTTAWA - HAUSER COMPANY STORES')
    expect(snapshot.generatedAt).toBe('2026-08-27T13:00:00.000Z')
  })

  it('isolates optional detail and Built failures from the printable base report', async () => {
    const order = printableOrder('101')
    const getWorkOrderPainted = vi.fn(async () => ({ success: true as const, values: [] }))
    const operations = {
      getBacklog: vi.fn(async () => response([order])),
      searchSalesOrder: vi.fn(async () => response([])),
      searchPurchaseOrder: vi.fn(async () => response([])),
      getSalesOrderDetails: vi.fn(async () => {
        throw new Error('optional detail failure')
      }),
      getWorkOrderBuilt: vi.fn(async () => {
        throw new Error('optional Built failure')
      }),
      getWorkOrderPainted
    } satisfies BacklogPrintOperations

    const snapshot = await new BacklogPrintDataService(operations).prepare({
      scope: { kind: 'customer' }
    })

    expect(snapshot.salesOrders[0]?.items[0]).toMatchObject({
      item: 'CHAIR',
      workOrderNumber: 'WO900',
      built: null,
      painted: null
    })
    expect(getWorkOrderPainted).not.toHaveBeenCalled()
  })

  it('uses only the active Purchase Order path for a Purchase Order print scope', async () => {
    const searchPurchaseOrder = vi.fn(async () => response([printableOrder('101')]))
    const getBacklog = vi.fn(async () => response([]))
    const operations = {
      getBacklog,
      searchSalesOrder: vi.fn(async () => response([])),
      searchPurchaseOrder,
      getSalesOrderDetails: vi.fn(async () => ({ success: true as const, items: [] })),
      getWorkOrderBuilt: vi.fn(async () => ({ success: true as const, values: [] })),
      getWorkOrderPainted: vi.fn(async () => ({ success: true as const, values: [] }))
    } satisfies BacklogPrintOperations

    await new BacklogPrintDataService(operations).prepare({
      scope: { kind: 'purchase-order', purchaseOrderNumber: 'PO-45001' }
    })

    expect(searchPurchaseOrder).toHaveBeenCalledWith({ purchaseOrderNumber: 'PO-45001' })
    expect(getBacklog).not.toHaveBeenCalled()
  })
})
