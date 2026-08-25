import type { WorkOrderRecord } from '../../src/main/data/workOrderRecord'
import type {
  BacklogPageData,
  BacklogRow,
  SalesOrderGroup
} from '../../src/shared/types/backlog'

export function makeBacklogRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    rowKey: 'row-1',
    customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
    poNumber: 'PO-1',
    workOrderInternalId: 'wo-1',
    workOrderNumber: 'WO1',
    salesOrderInternalId: 'so-1',
    salesOrderNumber: 'SO1234',
    shipTo: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
    itemInternalId: 'item-1',
    item: 'ABC',
    itemDescription: 'Assembly ABC',
    paintItemInternalId: 'paint-1',
    paintSku: 'PAINT-GRAPHITE',
    paintName: 'Graphite',
    fabricItemInternalId: 'fabric-1',
    fabricSku: 'FABRIC-SLATE',
    fabricName: 'Slate',
    weltItemInternalId: 'welt-1',
    weltSku: 'WELT-SLATE',
    weltName: 'Slate Welt',
    buttonItemInternalId: 'button-1',
    buttonSku: 'BUTTON-BLACK',
    buttonName: 'Black Button',
    quantity: 10,
    createdDate: '2026-08-01',
    dueDate: '2026-08-21',
    workOrderStatusCode: 'RELEASED',
    workOrderStatusLabel: 'Released',
    ...overrides
  }
}

export function makeSalesOrderGroup(
  overrides: Partial<SalesOrderGroup> = {}
): SalesOrderGroup {
  const row = makeBacklogRow()
  return {
    salesOrderInternalId: row.salesOrderInternalId ?? '1',
    salesOrderNumber: row.salesOrderNumber,
    customerInternalId: row.customerInternalId ?? '6344',
    customerName: row.customerName,
    poNumber: row.poNumber,
    createdDate: row.createdDate ?? null,
    dueDate: row.dueDate ?? null,
    items: [
      {
        rowKey: row.rowKey,
        lineId: '1',
        lineSequence: 1,
        itemInternalId: row.itemInternalId ?? '1',
        item: row.item,
        itemDescription: row.itemDescription,
        quantity: row.quantity,
        ...(row.workOrderInternalId
          ? { workOrderInternalId: row.workOrderInternalId }
          : {}),
        ...(row.workOrderNumber ? { workOrderNumber: row.workOrderNumber } : {}),
        ...(row.paintName ? { paintName: row.paintName } : {}),
        ...(row.fabricName ? { fabricName: row.fabricName } : {}),
        ...(row.weltName ? { weltName: row.weltName } : {}),
        ...(row.buttonName ? { buttonName: row.buttonName } : {}),
        ...(row.workOrderStatusLabel ? { workOrderStatus: row.workOrderStatusLabel } : {})
      }
    ],
    ...overrides
  }
}

export function makeBacklogPage(
  salesOrders: SalesOrderGroup[] = [makeSalesOrderGroup()],
  overrides: Partial<BacklogPageData> = {}
): BacklogPageData {
  return {
    salesOrders,
    page: 0,
    pageSize: 50,
    totalSalesOrders: salesOrders.length,
    hasPrevious: false,
    hasNext: false,
    ...overrides
  }
}

export function makeWorkOrderRecord(
  internalId: string,
  parentWorkOrderInternalId?: string,
  overrides: Partial<WorkOrderRecord> = {}
): WorkOrderRecord {
  return {
    internalId,
    workOrderNumber: internalId.toUpperCase(),
    ...(parentWorkOrderInternalId ? { parentWorkOrderInternalId } : {}),
    item: `ITEM-${internalId}`,
    statusLabel: 'Released',
    ...overrides
  }
}
