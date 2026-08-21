import type { WorkOrderRecord } from '../../src/main/data/workOrderRecord'
import type { BacklogRow } from '../../src/shared/types/backlog'

export function makeBacklogRow(overrides: Partial<BacklogRow> = {}): BacklogRow {
  return {
    rowKey: 'row-1',
    customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
    poNumber: 'PO-1',
    workOrderInternalId: 'wo-1',
    workOrderNumber: 'WO1',
    salesOrderInternalId: 'so-1',
    salesOrderNumber: 'SO1234',
    shipTo: 'Waterloo, ON',
    itemInternalId: 'item-1',
    item: 'ABC',
    itemDescription: 'Assembly ABC',
    paintName: 'Graphite',
    fabricName: 'Slate',
    quantity: 10,
    quantityShipped: 3,
    quantityRemaining: 7,
    createdDate: '2026-08-01',
    dueDate: '2026-08-21',
    workOrderStatus: { code: 'RELEASED', label: 'Released' },
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
