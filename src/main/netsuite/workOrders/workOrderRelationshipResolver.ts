import { z } from 'zod'

import type { SalesOrderGroup } from '@shared/types/backlog'
import type { SuiteQlClient } from '../client/suiteQlClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import type { SuiteQlQuery, SuiteQlRecord } from '../types/netsuiteTypes'

const scalar = z.union([z.string(), z.number(), z.null()])

export interface WorkOrderSummary {
  internalId: string
  number: string
  statusRaw?: string
  status?: string
}

export type WorkOrderRelationship =
  | 'NextTransactionLineLink'
  | 'WOLine.CreatedFrom'
  | 'none'

export interface WorkOrderResolution {
  succeeded: boolean
  relationship: WorkOrderRelationship
  bySalesOrderLine: ReadonlyMap<string, WorkOrderSummary>
  ambiguousLineKeys: ReadonlySet<string>
}

export interface WorkOrderRelationshipResolver {
  resolve(salesOrders: readonly SalesOrderGroup[]): Promise<WorkOrderResolution>
}

function numericIdList(ids: readonly string[]): string {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0 || uniqueIds.some((id) => !/^[0-9]+$/.test(id))) {
    throw new Error('Sales Order IDs must be numeric NetSuite internal IDs.')
  }
  return uniqueIds.join(', ')
}

export function createNextTransactionWorkOrderQuery(
  salesOrderInternalIds: readonly string[]
): SuiteQlQuery {
  return {
    name: 'sales-order-work-orders-next-transaction-link',
    sql: `SELECT DISTINCT
    NTLL.PreviousDoc AS sales_order_internal_id,
    NTLL.PreviousLine AS sales_order_line_id,
    WO.ID AS work_order_internal_id,
    WO.TranID AS work_order_number,
    WO.Status AS work_order_status_raw,
    BUILTIN.DF(WO.Status) AS work_order_status,
    NTLL.LinkType AS link_type,
    NTLL.NextLine AS next_line
FROM NextTransactionLineLink NTLL
INNER JOIN Transaction WO
    ON WO.ID = NTLL.NextDoc
    AND WO.Type = 'WorkOrd'
WHERE NTLL.PreviousDoc IN (${numericIdList(salesOrderInternalIds)})`
  }
}

export function createCreatedFromWorkOrderQuery(
  salesOrderInternalIds: readonly string[]
): SuiteQlQuery {
  return {
    name: 'sales-order-work-orders-created-from',
    sql: `SELECT
    WO.ID AS work_order_internal_id,
    WO.TranID AS work_order_number,
    WO.Status AS work_order_status_raw,
    BUILTIN.DF(WO.Status) AS work_order_status,
    WOLine.CreatedFrom AS sales_order_internal_id,
    WOLine.Item AS assembly_item_internal_id
FROM Transaction WO
INNER JOIN TransactionLine WOLine
    ON WOLine.Transaction = WO.ID
    AND NVL(WOLine.MainLine, 'F') = 'T'
WHERE WO.Type = 'WorkOrd'
    AND WOLine.CreatedFrom IN (${numericIdList(salesOrderInternalIds)})`
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

const exactRelationshipSchema = z.preprocess(
  normalizeAliases,
  z
    .object({
      sales_order_internal_id: scalar,
      sales_order_line_id: scalar,
      work_order_internal_id: scalar,
      work_order_number: scalar,
      work_order_status_raw: scalar.optional(),
      work_order_status: scalar.optional(),
      link_type: scalar.optional(),
      next_line: scalar.optional()
    })
    .passthrough()
)

const createdFromRelationshipSchema = z.preprocess(
  normalizeAliases,
  z
    .object({
      sales_order_internal_id: scalar,
      assembly_item_internal_id: scalar,
      work_order_internal_id: scalar,
      work_order_number: scalar,
      work_order_status_raw: scalar.optional(),
      work_order_status: scalar.optional()
    })
    .passthrough()
)

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function summary(
  internalIdValue: string | number | null,
  numberValue: string | number | null,
  statusRawValue?: string | number | null,
  statusValue?: string | number | null
): WorkOrderSummary | undefined {
  const internalId = text(internalIdValue)
  const number = text(numberValue)
  if (!internalId || !number) return undefined
  const statusRaw = text(statusRawValue)
  const status = text(statusValue) || statusRaw
  return {
    internalId,
    number,
    ...(statusRaw ? { statusRaw } : {}),
    ...(status ? { status } : {})
  }
}

function emptyResolution(succeeded: boolean): WorkOrderResolution {
  return {
    succeeded,
    relationship: 'none',
    bySalesOrderLine: new Map(),
    ambiguousLineKeys: new Set()
  }
}

function selectUniqueCandidates(
  candidates: ReadonlyMap<string, readonly WorkOrderSummary[]>,
  preAmbiguousKeys: ReadonlySet<string> = new Set()
): Pick<WorkOrderResolution, 'bySalesOrderLine' | 'ambiguousLineKeys'> {
  const bySalesOrderLine = new Map<string, WorkOrderSummary>()
  const ambiguousLineKeys = new Set(preAmbiguousKeys)

  for (const [key, values] of candidates) {
    const unique = new Map(values.map((value) => [value.internalId, value]))
    if (unique.size === 1 && !ambiguousLineKeys.has(key)) {
      bySalesOrderLine.set(key, [...unique.values()][0]!)
    } else if (unique.size > 1) {
      ambiguousLineKeys.add(key)
    }
  }
  return { bySalesOrderLine, ambiguousLineKeys }
}

export class NetSuiteWorkOrderRelationshipResolver implements WorkOrderRelationshipResolver {
  private readonly logger: DiagnosticLogger

  constructor(
    private readonly suiteQlClient: SuiteQlClient,
    logger: DiagnosticLogger = netSuiteDiagnosticLogger
  ) {
    this.logger = logger
  }

  async resolve(salesOrders: readonly SalesOrderGroup[]): Promise<WorkOrderResolution> {
    const salesOrderIds = [
      ...new Set(salesOrders.map((salesOrder) => salesOrder.salesOrderInternalId))
    ]
    if (salesOrderIds.length === 0) return emptyResolution(true)

    try {
      const result = await this.suiteQlClient.queryAll(
        createNextTransactionWorkOrderQuery(salesOrderIds)
      )
      if (result.items.length > 0) {
        const resolution = this.fromExactRelationships(result.items, salesOrders)
        if (
          resolution.bySalesOrderLine.size > 0 ||
          resolution.ambiguousLineKeys.size > 0
        ) {
          this.logger.info('Work Order relationship resolution completed.', {
            endpointCategory: 'work-order-lookup',
            relationship: resolution.relationship,
            matchedLineCount: resolution.bySalesOrderLine.size,
            ambiguousLineCount: resolution.ambiguousLineKeys.size
          })
          return resolution
        }
        this.logger.warn('NextTransactionLineLink did not match current Sales Order line IDs.', {
          endpointCategory: 'work-order-lookup',
          salesOrderCount: salesOrderIds.length
        })
      }
    } catch {
      this.logger.warn('NextTransactionLineLink Work Order lookup failed.', {
        endpointCategory: 'work-order-lookup',
        salesOrderCount: salesOrderIds.length
      })
    }

    try {
      const result = await this.suiteQlClient.queryAll(
        createCreatedFromWorkOrderQuery(salesOrderIds)
      )
      const resolution = this.fromCreatedFromRelationships(result.items, salesOrders)
      this.logger.info('Work Order relationship resolution completed.', {
        endpointCategory: 'work-order-lookup',
        relationship: resolution.relationship,
        matchedLineCount: resolution.bySalesOrderLine.size,
        ambiguousLineCount: resolution.ambiguousLineKeys.size
      })
      return resolution
    } catch {
      this.logger.warn('CreatedFrom Work Order lookup failed.', {
        endpointCategory: 'work-order-lookup',
        salesOrderCount: salesOrderIds.length
      })
      return emptyResolution(false)
    }
  }

  private fromExactRelationships(
    records: readonly SuiteQlRecord[],
    salesOrders: readonly SalesOrderGroup[]
  ): WorkOrderResolution {
    const currentLineKeys = new Set(
      salesOrders.flatMap((salesOrder) =>
        salesOrder.items.map(
          (item) => `${salesOrder.salesOrderInternalId}:${item.lineId}`
        )
      )
    )
    const candidates = new Map<string, WorkOrderSummary[]>()
    for (const record of records) {
      const parsed = exactRelationshipSchema.safeParse(record)
      if (!parsed.success) continue
      const value = parsed.data
      const salesOrderId = text(value.sales_order_internal_id)
      const lineId = text(value.sales_order_line_id)
      const workOrder = summary(
        value.work_order_internal_id,
        value.work_order_number,
        value.work_order_status_raw,
        value.work_order_status
      )
      if (!salesOrderId || !lineId || !workOrder) continue
      const key = `${salesOrderId}:${lineId}`
      if (!currentLineKeys.has(key)) continue
      candidates.set(key, [...(candidates.get(key) ?? []), workOrder])
    }
    return {
      succeeded: true,
      relationship: 'NextTransactionLineLink',
      ...selectUniqueCandidates(candidates)
    }
  }

  private fromCreatedFromRelationships(
    records: readonly SuiteQlRecord[],
    salesOrders: readonly SalesOrderGroup[]
  ): WorkOrderResolution {
    const lineKeysBySalesOrderItem = new Map<string, string[]>()
    for (const salesOrder of salesOrders) {
      for (const item of salesOrder.items) {
        const itemKey = `${salesOrder.salesOrderInternalId}:${item.itemInternalId}`
        lineKeysBySalesOrderItem.set(itemKey, [
          ...(lineKeysBySalesOrderItem.get(itemKey) ?? []),
          `${salesOrder.salesOrderInternalId}:${item.lineId}`
        ])
      }
    }

    const candidates = new Map<string, WorkOrderSummary[]>()
    const ambiguousLineKeys = new Set<string>()
    for (const record of records) {
      const parsed = createdFromRelationshipSchema.safeParse(record)
      if (!parsed.success) continue
      const value = parsed.data
      const salesOrderId = text(value.sales_order_internal_id)
      const itemId = text(value.assembly_item_internal_id)
      const lineKeys = lineKeysBySalesOrderItem.get(`${salesOrderId}:${itemId}`) ?? []
      if (lineKeys.length !== 1) {
        lineKeys.forEach((key) => ambiguousLineKeys.add(key))
        continue
      }
      const workOrder = summary(
        value.work_order_internal_id,
        value.work_order_number,
        value.work_order_status_raw,
        value.work_order_status
      )
      if (!workOrder) continue
      const key = lineKeys[0]!
      candidates.set(key, [...(candidates.get(key) ?? []), workOrder])
    }

    return {
      succeeded: true,
      relationship: 'WOLine.CreatedFrom',
      ...selectUniqueCandidates(candidates, ambiguousLineKeys)
    }
  }
}
