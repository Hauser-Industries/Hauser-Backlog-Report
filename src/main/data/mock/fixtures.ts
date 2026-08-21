import { MOCK_RAW_BACKLOG_RESPONSE, MOCK_RAW_WORK_ORDER_RESPONSE } from './rawFixtures'
import { transformBacklogPayload } from '../transforms/backlogTransform'
import { transformWorkOrderPayload } from '../transforms/workOrderTransform'
import { attachWorkOrderHierarchies } from '../../services/backlogMerge'
import { isAllowedCustomer } from '@shared/constants/customers'
import type { BacklogRow } from '@shared/types/backlog'

export function createMockSourceRows(): BacklogRow[] {
  const rows = transformBacklogPayload(MOCK_RAW_BACKLOG_RESPONSE)
  const workOrders = transformWorkOrderPayload(MOCK_RAW_WORK_ORDER_RESPONSE)
  return attachWorkOrderHierarchies(rows, workOrders)
}

/** Includes the outside-customer search fixture; never use directly for the full report. */
export const MOCK_SOURCE_ROWS: readonly BacklogRow[] = createMockSourceRows()

/** The safe full-report fixture exposed to renderer-facing code. */
export const MOCK_BACKLOG_ROWS: readonly BacklogRow[] = MOCK_SOURCE_ROWS.filter((row) =>
  isAllowedCustomer(row.customerName)
)
