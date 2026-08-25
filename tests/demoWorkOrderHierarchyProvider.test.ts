import { describe, expect, it } from 'vitest'

import { DemoWorkOrderHierarchyProvider } from '../src/main/workOrders/demoWorkOrderHierarchyProvider'
import type { BacklogRow } from '../src/shared/types/backlog'

const liveRow: BacklogRow = {
  rowKey: '3850367-10144-1',
  customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
  poNumber: 'PO-10144',
  salesOrderNumber: 'SO10144',
  shipTo: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
  item: 'HSPR0290C',
  itemDescription: 'Live line description',
  paintName: '',
  fabricName: '',
  weltName: '',
  buttonName: '',
  quantity: 1,
  createdDate: '2026-08-24',
  dueDate: '2026-09-15'
}

describe('DemoWorkOrderHierarchyProvider', () => {
  it('preserves live Sales Order fields while attaching a labelled demo hierarchy', async () => {
    const [row] = await new DemoWorkOrderHierarchyProvider().enrichRows([liveRow])

    expect(row).toMatchObject({
      customerName: liveRow.customerName,
      salesOrderNumber: 'SO10144',
      item: 'HSPR0290C',
      quantity: 1,
      workOrderHierarchySource: 'demo',
      workOrderNumber: 'WO1000',
      workOrderStatusLabel: 'Released'
    })
    expect(row?.workOrderHierarchy?.children).toHaveLength(3)
  })
})
