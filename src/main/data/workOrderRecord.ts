import type { WorkOrderNode } from '@shared/types/backlog'

/** A work order after API validation but before recursive hierarchy construction. */
export type WorkOrderRecord = Omit<WorkOrderNode, 'children'>
