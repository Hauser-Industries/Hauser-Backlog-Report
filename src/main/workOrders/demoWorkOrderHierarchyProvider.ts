import type { BacklogRow, WorkOrderNode } from '@shared/types/backlog'
import { MOCK_RAW_WORK_ORDER_RESPONSE } from '../data/mock/rawFixtures'
import { transformWorkOrderPayload } from '../data/transforms/workOrderTransform'
import { buildWorkOrderHierarchy } from '../services/workOrderHierarchy'
import type { WorkOrderHierarchyProvider } from './workOrderHierarchyProvider'

const DEMO_ROOT_ID = 'mock-wo-1000'

function createDemoHierarchy(): WorkOrderNode {
  const hierarchy = buildWorkOrderHierarchy(
    transformWorkOrderPayload(MOCK_RAW_WORK_ORDER_RESPONSE),
    DEMO_ROOT_ID
  )
  if (!hierarchy) throw new Error('The packaged demo Work Order hierarchy is unavailable.')
  return hierarchy
}

/** Clearly labelled fallback; it never attempts to infer live relationships from an Item/SKU. */
export class DemoWorkOrderHierarchyProvider implements WorkOrderHierarchyProvider {
  private readonly hierarchy = createDemoHierarchy()

  async enrichRows(rows: readonly BacklogRow[]): Promise<BacklogRow[]> {
    return rows.map((row) => {
      const workOrderHierarchy = structuredClone(this.hierarchy)
      return {
        ...row,
        workOrderInternalId: workOrderHierarchy.internalId,
        workOrderNumber: workOrderHierarchy.workOrderNumber,
        ...(workOrderHierarchy.statusCode
          ? { workOrderStatusCode: workOrderHierarchy.statusCode }
          : {}),
        workOrderStatusLabel: workOrderHierarchy.statusLabel,
        workOrderHierarchy,
        workOrderHierarchySource: 'demo'
      }
    })
  }
}
