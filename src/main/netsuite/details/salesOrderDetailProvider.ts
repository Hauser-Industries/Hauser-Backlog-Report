import { z } from 'zod'

import type { SalesOrderDetailsResult, SalesOrderItemDetail } from '@shared/types/backlog'
import type { NetSuiteHttpClient } from '../client/netsuiteHttpClient'
import type { SuiteQlClient } from '../client/suiteQlClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'

const restRecordSchema = z.record(z.string(), z.unknown())

type UnknownRecord = Record<string, unknown>
type ReplacementKind = 'paint' | 'fabric'

interface ReplacementReference {
  id?: string
  name?: string
}

interface PendingLineDetail {
  detail: SalesOrderItemDetail
  replacements: Record<ReplacementKind, ReplacementReference | undefined>
}

interface ReplacementItemSummary {
  name?: string
  description?: string
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined
}

function lowercaseRecord(value: UnknownRecord): UnknownRecord {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.toLowerCase(), entry]))
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim()
    return normalized || undefined
  }
  const reference = asRecord(value)
  if (!reference) return undefined
  return asText(reference.refName ?? reference.name ?? reference.id)
}

function asInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

function itemLines(record: UnknownRecord): UnknownRecord[] {
  const itemSublist = asRecord(record.item)
  return Array.isArray(itemSublist?.items)
    ? itemSublist.items.flatMap((item) => (asRecord(item) ? [asRecord(item)!] : []))
    : []
}

function replacementReference(value: unknown): ReplacementReference | undefined {
  const reference = asRecord(value)
  if (!reference) {
    const name = asText(value)
    return name ? { name } : undefined
  }
  const id = asText(reference.id)
  const name = asText(reference.refName ?? reference.name)
  if (!id && !name) return undefined
  return {
    ...(id && /^[0-9]+$/.test(id) ? { id } : {}),
    ...(name ? { name } : {})
  }
}

function pendingLineDetail(line: UnknownRecord): PendingLineDetail | undefined {
  const lineId = asText(line.lineuniquekey ?? line.lineUniqueKey ?? line.id)
  const lineSequence = asInteger(
    line.lineSequenceNumber ?? line.linesequencenumber ?? line.line ?? line.lineNumber
  )
  if (!lineId && lineSequence === undefined) return undefined

  const replacements = {
    paint: replacementReference(line.custcol_nscs_paintreplacementsku),
    fabric: replacementReference(line.custcol_nscs_fabricreplacementsku)
  }

  return {
    detail: {
      ...(lineId ? { lineId } : {}),
      ...(lineSequence !== undefined ? { lineSequence } : {}),
      ...(replacements.paint?.name ? { paintName: replacements.paint.name } : {}),
      ...(replacements.fabric?.name ? { fabricName: replacements.fabric.name } : {})
    },
    replacements
  }
}

function numericIdList(ids: readonly string[]): string {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.some((id) => !/^[0-9]+$/.test(id))) {
    throw new Error('Replacement Item IDs must be numeric NetSuite internal IDs.')
  }
  return uniqueIds.join(', ')
}

export class NetSuiteSalesOrderDetailProvider {
  private readonly successfulCache = new Map<string, SalesOrderDetailsResult>()
  private readonly logger: DiagnosticLogger

  constructor(
    private readonly httpClient: NetSuiteHttpClient,
    private readonly suiteQlClient: SuiteQlClient,
    logger: DiagnosticLogger = netSuiteDiagnosticLogger
  ) {
    this.logger = logger
  }

  async getDetails(salesOrderInternalId: string): Promise<SalesOrderDetailsResult> {
    if (!/^[0-9]+$/.test(salesOrderInternalId)) {
      return { success: false, message: 'The Sales Order internal ID is invalid.' }
    }
    const cached = this.successfulCache.get(salesOrderInternalId)
    if (cached) return structuredClone(cached)

    try {
      const record = await this.httpClient.getRestRecord(
        `/services/rest/record/v1/salesOrder/${salesOrderInternalId}?expandSubResources=true`,
        restRecordSchema
      )
      const pendingItems = itemLines(record).flatMap((line) => {
        const pending = pendingLineDetail(line)
        return pending ? [pending] : []
      })
      const itemIds = pendingItems.flatMap(({ replacements }) =>
        Object.values(replacements).flatMap((reference) => (reference?.id ? [reference.id] : []))
      )
      const replacementItems = await this.lookupReplacementItems(itemIds)
      const items = pendingItems.map((pending) =>
        this.mergeReplacementItems(pending, replacementItems)
      )
      const result: SalesOrderDetailsResult = { success: true, items }
      this.successfulCache.set(salesOrderInternalId, result)
      return structuredClone(result)
    } catch {
      return {
        success: false,
        message: 'Optional Paint and Fabric details are unavailable for this Sales Order.'
      }
    }
  }

  invalidate(): void {
    this.successfulCache.clear()
  }

  private async lookupReplacementItems(
    itemIds: readonly string[]
  ): Promise<ReadonlyMap<string, ReplacementItemSummary>> {
    const uniqueIds = [...new Set(itemIds)]
    if (uniqueIds.length === 0) return new Map()

    try {
      const result = await this.suiteQlClient.queryAll({
        name: 'replacement-item-details',
        sql: `SELECT
    id AS item_internal_id,
    itemid AS item_name,
    description AS item_description
FROM item
WHERE id IN (${numericIdList(uniqueIds)})`
      })
      return new Map(
        result.items.flatMap((raw) => {
          const row = lowercaseRecord(raw)
          const id = asText(row.item_internal_id)
          if (!id) return []
          const name = asText(row.item_name)
          const description = asText(row.item_description)
          return [
            [
              id,
              {
                ...(name ? { name } : {}),
                ...(description ? { description } : {})
              }
            ] as const
          ]
        })
      )
    } catch {
      this.logger.warn('Replacement Item description lookup failed.', {
        endpointCategory: 'replacement-item-lookup',
        itemCount: uniqueIds.length
      })
      return new Map()
    }
  }

  private mergeReplacementItems(
    pending: PendingLineDetail,
    replacementItems: ReadonlyMap<string, ReplacementItemSummary>
  ): SalesOrderItemDetail {
    const result: SalesOrderItemDetail = { ...pending.detail }
    const merge = (kind: ReplacementKind): void => {
      const reference = pending.replacements[kind]
      const resolved = reference?.id ? replacementItems.get(reference.id) : undefined
      const name = reference?.name ?? resolved?.name
      if (kind === 'paint') {
        if (name) result.paintName = name
        if (resolved?.description) result.paintDescription = resolved.description
      } else if (kind === 'fabric') {
        if (name) result.fabricName = name
        if (resolved?.description) result.fabricDescription = resolved.description
      } else {
        if (name) result.fabricName = name
        if (resolved?.description) result.fabricDescription = resolved.description
      }
    }

    merge('paint')
    merge('fabric')
    return result
  }
}
