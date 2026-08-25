import type {
  BacklogItemRow,
  BacklogPageData,
  BacklogRow,
  SalesOrderGroup
} from '@shared/types/backlog'

export const DEFAULT_SALES_ORDER_PAGE_SIZE = 50

function lineSequenceFromRow(row: BacklogRow, fallback: number): number {
  const suffix = row.rowKey.split('-').at(-1)
  const parsed = suffix ? Number(suffix) : Number.NaN
  return Number.isInteger(parsed) ? parsed : fallback
}

function toItem(row: BacklogRow, fallbackSequence: number): BacklogItemRow {
  return {
    rowKey: row.rowKey,
    lineId: row.rowKey.split('-').at(-1) ?? row.rowKey,
    lineSequence: lineSequenceFromRow(row, fallbackSequence),
    itemInternalId: row.itemInternalId ?? '',
    item: row.item,
    itemDescription: row.itemDescription,
    quantity: row.quantity,
    ...(row.workOrderInternalId ? { workOrderInternalId: row.workOrderInternalId } : {}),
    ...(row.workOrderNumber ? { workOrderNumber: row.workOrderNumber } : {}),
    ...(row.paintName ? { paintName: row.paintName } : {}),
    ...(row.fabricName ? { fabricName: row.fabricName } : {}),
    ...(row.weltName ? { weltName: row.weltName } : {}),
    ...(row.buttonName ? { buttonName: row.buttonName } : {}),
    ...(row.workOrderStatusLabel ? { workOrderStatus: row.workOrderStatusLabel } : {})
  }
}

export function groupBacklogRows(rows: readonly BacklogRow[]): SalesOrderGroup[] {
  const groups = new Map<string, SalesOrderGroup>()

  for (const [index, row] of rows.entries()) {
    const internalId = row.salesOrderInternalId ?? row.salesOrderNumber
    let group = groups.get(internalId)
    if (!group) {
      group = {
        salesOrderInternalId: internalId,
        salesOrderNumber: row.salesOrderNumber,
        customerInternalId: row.customerInternalId ?? '',
        customerName: row.customerName,
        poNumber: row.poNumber,
        createdDate: row.createdDate ?? null,
        dueDate: row.dueDate ?? null,
        items: []
      }
      groups.set(internalId, group)
    }
    group.items.push(toItem(row, index))
  }

  return [...groups.values()].sort((left, right) => {
    const dateOrder = (right.createdDate ?? '').localeCompare(left.createdDate ?? '')
    if (dateOrder !== 0) return dateOrder
    return Number(right.salesOrderInternalId) - Number(left.salesOrderInternalId)
  })
}

export function pageSalesOrderGroups(
  salesOrders: readonly SalesOrderGroup[],
  page: number,
  pageSize: number
): BacklogPageData {
  const start = page * pageSize
  return {
    salesOrders: structuredClone(salesOrders.slice(start, start + pageSize)),
    page,
    pageSize,
    totalSalesOrders: salesOrders.length,
    hasPrevious: page > 0,
    hasNext: start + pageSize < salesOrders.length
  }
}
