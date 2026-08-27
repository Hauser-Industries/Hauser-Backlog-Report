import { z } from 'zod'

import type {
  WorkOrderPaintedReference,
  WorkOrderPaintedResult
} from '@shared/types/backlog'
import type { SuiteQlClient } from '../client/suiteQlClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import type { SuiteQlQuery, SuiteQlRecord } from '../types/netsuiteTypes'
import type { WorkOrderBuiltProvider } from './workOrderBuiltProvider'

const scalar = z.union([z.string(), z.number(), z.null()])
const REST_BUILT_LOOKUP_CONCURRENCY = 4

function numericIdList(ids: readonly string[]): string {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0 || uniqueIds.some((id) => !/^[0-9]+$/.test(id))) {
    throw new Error('Work Order IDs must be numeric NetSuite internal IDs.')
  }
  return uniqueIds.join(', ')
}

export function createPaintChildWorkOrderQuery(
  parentWorkOrderInternalIds: readonly string[]
): SuiteQlQuery {
  return {
    name: 'paint-child-work-orders',
    sql: `SELECT DISTINCT
    ParentLine.Transaction AS parent_work_order_internal_id,
    ParentLine.ID AS parent_work_order_line_id,
    ComponentItem.ID AS component_item_internal_id,
    ComponentItem.ItemID AS component_sku,
    ChildWO.ID AS paint_work_order_internal_id,
    ChildWO.TranID AS paint_work_order_number
FROM TransactionLine ParentLine
INNER JOIN Transaction ParentWO
    ON ParentWO.ID = ParentLine.Transaction
    AND ParentWO.Type = 'WorkOrd'
INNER JOIN Item ComponentItem
    ON ComponentItem.ID = ParentLine.Item
INNER JOIN NextTransactionLineLink NTLL
    ON NTLL.PreviousDoc = ParentWO.ID
    AND NTLL.PreviousLine = ParentLine.ID
INNER JOIN Transaction ChildWO
    ON ChildWO.ID = NTLL.NextDoc
    AND ChildWO.Type = 'WorkOrd'
WHERE ParentWO.ID IN (${numericIdList(parentWorkOrderInternalIds)})
    AND NVL(ParentLine.MainLine, 'F') = 'F'
    AND NVL(ParentLine.TaxLine, 'F') = 'F'
    AND UPPER(ComponentItem.ItemID) LIKE '8%'
ORDER BY ParentLine.Transaction, ParentLine.ID, ChildWO.ID`
  }
}

function normalizeAliases(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key.toLowerCase(),
      entry
    ])
  )
}

const paintChildWorkOrderSchema = z.preprocess(
  normalizeAliases,
  z
    .object({
      parent_work_order_internal_id: scalar,
      parent_work_order_line_id: scalar,
      component_item_internal_id: scalar,
      component_sku: scalar,
      paint_work_order_internal_id: scalar,
      paint_work_order_number: scalar
    })
    .passthrough()
)

function text(value: string | number | null): string {
  return value === null ? '' : String(value).trim()
}

interface PaintChildWorkOrder {
  internalId: string
  number: string
}

function childCandidates(
  records: readonly SuiteQlRecord[]
): ReadonlyMap<string, ReadonlyMap<string, PaintChildWorkOrder>> {
  const candidates = new Map<string, Map<string, PaintChildWorkOrder>>()
  for (const record of records) {
    const parsed = paintChildWorkOrderSchema.safeParse(record)
    if (!parsed.success) continue
    const row = parsed.data
    const parentId = text(row.parent_work_order_internal_id)
    const componentSku = text(row.component_sku)
    const childId = text(row.paint_work_order_internal_id)
    const childNumber = text(row.paint_work_order_number)
    if (!parentId || !componentSku.toUpperCase().startsWith('8') || !childId || !childNumber) {
      continue
    }
    const byChildId = candidates.get(parentId) ?? new Map<string, PaintChildWorkOrder>()
    byChildId.set(childId, { internalId: childId, number: childNumber })
    candidates.set(parentId, byChildId)
  }
  return candidates
}

export class NetSuiteWorkOrderPaintedProvider {
  private readonly cache = new Map<string, number | null>()

  constructor(
    private readonly suiteQlClient: SuiteQlClient,
    private readonly builtProvider: WorkOrderBuiltProvider,
    private readonly logger: DiagnosticLogger = netSuiteDiagnosticLogger
  ) {}

  async getPaintedValues(
    workOrders: readonly WorkOrderPaintedReference[]
  ): Promise<WorkOrderPaintedResult> {
    const uniqueWorkOrders = [
      ...new Map(
        workOrders.map((workOrder) => [workOrder.workOrderInternalId, workOrder] as const)
      ).values()
    ]
    const missing = uniqueWorkOrders.filter(
      ({ workOrderInternalId }) => !this.cache.has(workOrderInternalId)
    )

    if (missing.length > 0) await this.loadMissing(missing)

    return {
      success: true,
      values: uniqueWorkOrders.map(({ workOrderInternalId }) => ({
        workOrderInternalId,
        painted: this.cache.get(workOrderInternalId) ?? null
      }))
    }
  }

  invalidate(): void {
    this.cache.clear()
  }

  private async loadMissing(workOrders: readonly WorkOrderPaintedReference[]): Promise<void> {
    try {
      const result = await this.suiteQlClient.queryAll(
        createPaintChildWorkOrderQuery(workOrders.map(({ workOrderInternalId }) => workOrderInternalId))
      )
      const candidates = childCandidates(result.items)
      const resolvedChildren = new Map<string, PaintChildWorkOrder>()

      for (const { workOrderInternalId } of workOrders) {
        const matches = [...(candidates.get(workOrderInternalId)?.values() ?? [])]
        if (matches.length > 0) {
          resolvedChildren.set(workOrderInternalId, matches[0]!)
          if (matches.length > 1) {
            this.logger.info('Additional paint child Work Orders were ignored.', {
              endpointCategory: 'paint-work-order-lookup',
              parentWorkOrderInternalId: workOrderInternalId,
              ignoredCandidateCount: matches.length - 1
            })
          }
        } else {
          this.cache.set(workOrderInternalId, null)
        }
      }

      const resolvedEntries = [...resolvedChildren]
      for (let index = 0; index < resolvedEntries.length; index += REST_BUILT_LOOKUP_CONCURRENCY) {
        const batch = resolvedEntries.slice(index, index + REST_BUILT_LOOKUP_CONCURRENCY)
        const builtValues = await Promise.all(
          batch.map(([, child]) => this.builtProvider.getBuilt(child.internalId, child.number))
        )
        batch.forEach(([parentId], batchIndex) => {
          this.cache.set(parentId, builtValues[batchIndex] ?? null)
        })
      }

      this.logger.info('Paint child Work Order lookup completed.', {
        endpointCategory: 'paint-work-order-lookup',
        parentWorkOrderCount: workOrders.length,
        resolvedChildWorkOrderCount: resolvedChildren.size
      })
    } catch {
      workOrders.forEach(({ workOrderInternalId }) => this.cache.set(workOrderInternalId, null))
      this.logger.warn('Paint child Work Order lookup failed.', {
        endpointCategory: 'paint-work-order-lookup',
        parentWorkOrderCount: workOrders.length
      })
    }
  }
}
