import { MOCK_RAW_BACKLOG_RESPONSE } from './rawFixtures'
import { transformBacklogPayload } from '../transforms/backlogTransform'
import { isAllowedCustomer } from '@shared/constants/customers'
import type { BacklogRow } from '@shared/types/backlog'

export function createMockSourceRows(): BacklogRow[] {
  const rows = transformBacklogPayload(MOCK_RAW_BACKLOG_RESPONSE)
  return rows
}

/** Includes the outside-customer search fixture; never use directly for the full report. */
export const MOCK_SOURCE_ROWS: readonly BacklogRow[] = createMockSourceRows()

/** The safe full-report fixture exposed to renderer-facing code. */
export const MOCK_BACKLOG_ROWS: readonly BacklogRow[] = MOCK_SOURCE_ROWS.filter((row) =>
  isAllowedCustomer(row.customerName)
)
