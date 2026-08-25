import type { WorkOrderRecord } from '../data/workOrderRecord'
import { buildWorkOrderHierarchyMap } from './workOrderHierarchy'
import type { BacklogRow, BacklogRowWithHierarchy } from '@shared/types/backlog'

/**
 * Attaches independently fetched work-order trees without changing report-row
 * grain. One source backlog line always produces exactly one output row.
 */
export function attachWorkOrderHierarchies(
  rows: readonly BacklogRow[],
  workOrderRecords: readonly WorkOrderRecord[]
): BacklogRowWithHierarchy[] {
  const rootIds = rows.flatMap((row) => (row.workOrderInternalId ? [row.workOrderInternalId] : []))
  const hierarchyByRoot = buildWorkOrderHierarchyMap(workOrderRecords, rootIds)

  return rows.map((row) => {
    const rootId = row.workOrderInternalId
    const hierarchy = rootId ? hierarchyByRoot.get(rootId) : undefined
    return hierarchy ? { ...row, workOrderHierarchy: hierarchy } : { ...row }
  })
}
