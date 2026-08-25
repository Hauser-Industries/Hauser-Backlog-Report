import { describe, expect, it } from 'vitest'

import {
  BacklogTransformError,
  transformBacklogPayload
} from '../src/main/data/transforms/backlogTransform'
import {
  WorkOrderTransformError,
  transformWorkOrderPayload
} from '../src/main/data/transforms/workOrderTransform'
import { buildWorkOrderHierarchy } from '../src/main/services/workOrderHierarchy'

describe('raw backlog response transformation', () => {
  it('transforms a simulated mapped SuiteQL page into normalized BacklogRow values', () => {
    const rows = transformBacklogPayload({
      count: 1,
      hasMore: false,
      offset: 0,
      totalResults: 1,
      items: [
        {
          rowKey: 'line-17',
          customerInternalId: 123,
          customerName: 'WATERLOO - HAUSER COMPANY STORES',
          poNumber: null,
          workOrderInternalId: 9001,
          workOrderNumber: 'WO9001',
          salesOrderInternalId: 456,
          salesOrderNumber: 'so1234',
          shipTo: 'A physical address that must not become the report Ship To',
          itemInternalId: 789,
          item: 'ABC',
          itemDescription: null,
          paintItemInternalId: 101,
          paintSku: 'PAINT-101',
          paintName: null,
          fabricItemInternalId: 102,
          fabricSku: 'FABRIC-102',
          fabricName: null,
          weltItemInternalId: 103,
          weltSku: 'WELT-103',
          weltName: null,
          buttonItemInternalId: 104,
          buttonSku: 'BUTTON-104',
          buttonName: null,
          quantity: '10.0000000004',
          createdDate: '2026-08-01',
          dueDate: '2026-08-21',
          workOrderStatusCode: 'UNRECOGNIZED_CODE',
          workOrderStatusLabel: 'Awaiting Engineering Review'
        }
      ]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      rowKey: 'line-17',
      customerInternalId: '123',
      salesOrderNumber: 'SO1234',
      salesOrderInternalId: '456',
      workOrderInternalId: '9001',
      itemInternalId: '789',
      poNumber: '',
      shipTo: 'WATERLOO - HAUSER COMPANY STORES',
      itemDescription: '',
      paintItemInternalId: '101',
      paintSku: 'PAINT-101',
      paintName: '',
      fabricItemInternalId: '102',
      fabricSku: 'FABRIC-102',
      fabricName: '',
      weltItemInternalId: '103',
      weltSku: 'WELT-103',
      weltName: '',
      buttonItemInternalId: '104',
      buttonSku: 'BUTTON-104',
      buttonName: '',
      quantity: 10,
      createdDate: '2026-08-01',
      dueDate: '2026-08-21',
      workOrderStatusCode: 'UNRECOGNIZED_CODE',
      workOrderStatusLabel: 'Awaiting Engineering Review'
    })
    expect(rows[0]).not.toHaveProperty('quantityShipped')
    expect(rows[0]).not.toHaveProperty('quantityRemaining')
    expect(rows[0]).not.toHaveProperty('workOrderHierarchy')
  })

  it('ignores retired shipped/remaining inputs and always copies Customer Name to Ship To', () => {
    const [row] = transformBacklogPayload({
      items: [
        {
          rowKey: 'line-1',
          customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
          salesOrderNumber: 'SO1',
          item: 'ABC',
          quantity: 10,
          shipTo: 'Unrelated address',
          quantityShipped: 3,
          quantityRemaining: 7
        }
      ]
    })

    expect(row?.shipTo).toBe('MAIN WAREHOUSE - HAUSER COMPANY STORES')
    expect(row).not.toHaveProperty('quantityShipped')
    expect(row).not.toHaveProperty('quantityRemaining')
  })

  it('identifies the failing record index for malformed payload data', () => {
    expect(() =>
      transformBacklogPayload({
        items: [
          {
            rowKey: '',
            customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
            salesOrderNumber: 'SO1',
            item: 'ABC'
          }
        ]
      })
    ).toThrow(BacklogTransformError)

    try {
      transformBacklogPayload({ items: [{ rowKey: 1 }] })
    } catch (error) {
      expect(error).toBeInstanceOf(BacklogTransformError)
      expect((error as BacklogTransformError).recordIndex).toBe(0)
    }
  })
})

describe('raw work-order response transformation', () => {
  it('transforms flat mapped API records into a recursive WorkOrderNode', () => {
    const records = transformWorkOrderPayload({
      items: [
        {
          internalId: 1000,
          workOrderNumber: 'WO1000',
          rootWorkOrderInternalId: 1000,
          item: 'ABC',
          statusCode: 'RELEASED',
          statusLabel: 'Released',
          quantity: '10',
          quantityCompleted: '3',
          quantityRemaining: '7',
          createdDate: '2026-08-01',
          dueDate: '2026-08-21'
        },
        {
          internalId: 1001,
          workOrderNumber: 'WO1001',
          parentWorkOrderInternalId: 1000,
          rootWorkOrderInternalId: 1000,
          item: 'ABC-CHILD',
          statusLabel: 'Complete'
        },
        {
          internalId: 1002,
          workOrderNumber: 'WO1002',
          parentWorkOrderInternalId: 1001,
          rootWorkOrderInternalId: 1000,
          item: 'ABC-GRANDCHILD',
          statusLabel: 'Released'
        }
      ]
    })
    const hierarchy = buildWorkOrderHierarchy(records, '1000')

    expect(hierarchy).toMatchObject({
      internalId: '1000',
      workOrderNumber: 'WO1000',
      quantity: 10,
      quantityCompleted: 3,
      quantityRemaining: 7,
      createdDate: '2026-08-01',
      dueDate: '2026-08-21',
      children: [
        {
          internalId: '1001',
          statusLabel: 'Complete',
          children: [{ internalId: '1002', statusLabel: 'Released', children: [] }]
        }
      ]
    })
  })

  it('rejects malformed work orders with no stable internal ID', () => {
    expect(() =>
      transformWorkOrderPayload({
        items: [{ internalId: '', workOrderNumber: 'WO1', item: 'ABC' }]
      })
    ).toThrow(WorkOrderTransformError)
  })
})
