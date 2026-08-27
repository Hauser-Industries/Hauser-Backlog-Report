import { z } from 'zod'

import type { WorkOrderBuiltReference, WorkOrderBuiltResult } from '@shared/types/backlog'
import type { NetSuiteHttpClient } from '../client/netsuiteHttpClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { parseNetSuiteNumber } from '../transforms/netSuiteNumber'

const workOrderBuiltSchema = z
  .object({
    built: z.union([z.string(), z.number(), z.null()]).optional()
  })
  .passthrough()

const workOrderMetadataSchema = z.unknown()
const REST_BUILT_LOOKUP_CONCURRENCY = 4

function metadataContainsBuilt(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((entry) => metadataContainsBuilt(entry, depth + 1))

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'built') return true
    if (
      ['id', 'name', 'fieldid'].includes(key.toLowerCase()) &&
      typeof entry === 'string' &&
      entry.toLowerCase() === 'built'
    ) {
      return true
    }
    if (metadataContainsBuilt(entry, depth + 1)) return true
  }
  return false
}

export interface WorkOrderBuiltProvider {
  getBuilt(workOrderInternalId: string, workOrderNumber: string): Promise<number | null>
  invalidate(): void
}

export class NetSuiteRestWorkOrderBuiltProvider implements WorkOrderBuiltProvider {
  private readonly cache = new Map<string, Promise<number | null>>()
  private metadataInspection?: Promise<boolean | null>

  constructor(
    private readonly httpClient: NetSuiteHttpClient,
    private readonly logger: DiagnosticLogger = netSuiteDiagnosticLogger
  ) {}

  getBuilt(workOrderInternalId: string, workOrderNumber: string): Promise<number | null> {
    const cached = this.cache.get(workOrderInternalId)
    if (cached) return cached

    const lookup = this.fetchBuilt(workOrderInternalId, workOrderNumber)
    this.cache.set(workOrderInternalId, lookup)
    return lookup
  }

  invalidate(): void {
    this.cache.clear()
  }

  async getBuiltValues(workOrders: readonly WorkOrderBuiltReference[]): Promise<WorkOrderBuiltResult> {
    const uniqueWorkOrders = [
      ...new Map(
        workOrders.map((workOrder) => [workOrder.workOrderInternalId, workOrder] as const)
      ).values()
    ]
    const values: WorkOrderBuiltResult['values'] = []

    for (let index = 0; index < uniqueWorkOrders.length; index += REST_BUILT_LOOKUP_CONCURRENCY) {
      const batch = uniqueWorkOrders.slice(index, index + REST_BUILT_LOOKUP_CONCURRENCY)
      const builtValues = await Promise.all(
        batch.map(({ workOrderInternalId, workOrderNumber }) =>
          this.getBuilt(workOrderInternalId, workOrderNumber)
        )
      )
      values.push(
        ...batch.map(({ workOrderInternalId }, batchIndex) => ({
          workOrderInternalId,
          built: builtValues[batchIndex] ?? null
        }))
      )
    }

    return { success: true, values }
  }

  private async fetchBuilt(
    workOrderInternalId: string,
    workOrderNumber: string
  ): Promise<number | null> {
    if (!/^[0-9]+$/.test(workOrderInternalId)) {
      this.logBuilt(workOrderInternalId, workOrderNumber, null, null)
      return null
    }

    try {
      const record = await this.httpClient.getRestRecord(
        `/services/rest/record/v1/workOrder/${workOrderInternalId}?fields=built`,
        workOrderBuiltSchema
      )
      const raw = record.built ?? null
      const normalized = parseNetSuiteNumber(raw)
      this.logBuilt(workOrderInternalId, workOrderNumber, raw, normalized)
      if (record.built === undefined) await this.inspectMetadata()
      return normalized
    } catch {
      this.logBuilt(workOrderInternalId, workOrderNumber, null, null)
      return null
    }
  }

  private inspectMetadata(): Promise<boolean | null> {
    if (this.metadataInspection) return this.metadataInspection
    this.metadataInspection = this.fetchMetadataExposure()
    return this.metadataInspection
  }

  private async fetchMetadataExposure(): Promise<boolean | null> {
    try {
      const metadata = await this.httpClient.getRestRecord(
        '/services/rest/record/v1/metadata-catalog/workOrder',
        workOrderMetadataSchema
      )
      const builtExposed = metadataContainsBuilt(metadata)
      this.logger.info('Work Order REST metadata inspected.', { builtExposed })
      return builtExposed
    } catch {
      this.logger.info('Work Order REST metadata inspection failed.', {
        builtExposed: 'unknown'
      })
      return null
    }
  }

  private logBuilt(
    workOrderInternalId: string,
    workOrderNumber: string,
    raw: string | number | null,
    normalized: number | null
  ): void {
    this.logger.info('Work Order REST Built value inspected.', {
      workOrderInternalId,
      workOrderNumber,
      builtRawValue: raw,
      builtNormalizedValue: normalized
    })
  }
}
