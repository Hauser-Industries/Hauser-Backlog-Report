import { isAllowedCustomer } from '@shared/constants/customers'
import type { BacklogFilter, BacklogRow } from '@shared/types/backlog'

export function keepAllowedCustomerRows(rows: readonly BacklogRow[]): BacklogRow[] {
  return rows.filter((row) => isAllowedCustomer(row.customerName))
}

export function filterBacklogRows(
  rows: readonly BacklogRow[],
  filter: BacklogFilter
): BacklogRow[] {
  const allowedRows = keepAllowedCustomerRows(rows)
  if (!filter.customerName) return allowedRows
  if (!isAllowedCustomer(filter.customerName)) return []
  return allowedRows.filter((row) => row.customerName === filter.customerName)
}
