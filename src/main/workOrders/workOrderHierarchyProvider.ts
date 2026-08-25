import type { BacklogRow } from '@shared/types/backlog'

export interface WorkOrderHierarchyProvider {
  enrichRows(rows: readonly BacklogRow[]): Promise<BacklogRow[]>
}
