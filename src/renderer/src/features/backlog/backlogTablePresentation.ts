export const BACKLOG_TABLE_HEADERS = [
  'Customer Name',
  'Sales Order #',
  'PO #',
  'Item',
  'Item Description',
  'Paint Description',
  'Fabric Description',
  'Sum of Qty.',
  'Built',
  'Painted',
  'Work Order #',
  'WO Status',
  'Created Date',
  'Due Date'
] as const

export const MIN_REPORT_COLUMN_WIDTH = 72

export type BuiltCompletionState = 'none' | 'partial' | 'complete' | 'unavailable'

export function getBuiltCompletionState(
  built: number | null | undefined,
  quantity: number | null | undefined
): BuiltCompletionState {
  if (
    built === null ||
    built === undefined ||
    !Number.isFinite(built)
  ) {
    return 'unavailable'
  }
  if (built === 0) return 'none'
  if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) {
    return 'unavailable'
  }
  return built >= quantity ? 'complete' : 'partial'
}

export function shouldLoadPainted(
  paintSku: string | null | undefined,
  built: number | null | undefined,
  quantity: number | null | undefined
): boolean {
  return Boolean(
    paintSku?.trim() &&
      built !== null &&
      built !== undefined &&
      Number.isFinite(built) &&
      quantity !== null &&
      quantity !== undefined &&
      Number.isFinite(quantity) &&
      built < quantity
  )
}

export function setReportColumnWidth(
  widths: readonly number[],
  columnIndex: number,
  requestedWidth: number
): number[] {
  if (columnIndex < 0 || columnIndex >= widths.length) return [...widths]
  return widths.map((width, index) =>
    index === columnIndex ? Math.max(MIN_REPORT_COLUMN_WIDTH, requestedWidth) : width
  )
}

export function displayWorkOrderStatus(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  const withoutRecordType = normalized.replace(/^Work Order\s*:\s*/i, '').trim()
  return withoutRecordType.toLowerCase() === 'no work order' ? '' : withoutRecordType
}
