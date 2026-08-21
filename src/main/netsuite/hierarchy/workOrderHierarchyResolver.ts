import type { WorkOrderNode } from '@shared/types/backlog'

import type { SuiteQlOptions } from '../client/suiteQlClient'
import type { WorkOrderRepository } from '../repositories/workOrderRepository'
import type { WorkOrderRecord } from '../types/netsuiteTypes'

export interface WorkOrderHierarchyResolver {
  getHierarchy(
    rootWorkOrderInternalId: string,
    options?: SuiteQlOptions
  ): Promise<WorkOrderNode | undefined>
  getHierarchies(
    rootWorkOrderInternalIds: readonly string[],
    options?: SuiteQlOptions
  ): Promise<ReadonlyMap<string, WorkOrderNode>>
}

function normalizeRecord(record: WorkOrderRecord): WorkOrderRecord | undefined {
  const internalId = record.internalId.trim()
  const workOrderNumber = record.workOrderNumber.trim()
  if (!internalId || !workOrderNumber) return undefined
  return { ...record, internalId, workOrderNumber }
}

/**
 * Builds recursive trees strictly from internal-ID relationships. Duplicate IDs
 * use the first validated record; cycles and repeated descendants are omitted.
 * Records with missing parents remain harmless orphans rather than being attached
 * to a guessed parent.
 */
export function buildWorkOrderHierarchyMap(
  records: readonly WorkOrderRecord[],
  requestedRootIds: readonly string[]
): ReadonlyMap<string, WorkOrderNode> {
  const recordsById = new Map<string, WorkOrderRecord>()
  for (const candidate of records) {
    const record = normalizeRecord(candidate)
    if (!record || recordsById.has(record.internalId)) continue
    recordsById.set(record.internalId, record)
  }

  const childIdsByParent = new Map<string, string[]>()
  for (const record of recordsById.values()) {
    const parentId = record.parentWorkOrderInternalId?.trim()
    if (!parentId || !recordsById.has(parentId)) continue
    const childIds = childIdsByParent.get(parentId) ?? []
    if (!childIds.includes(record.internalId)) childIds.push(record.internalId)
    childIdsByParent.set(parentId, childIds)
  }

  const hierarchies = new Map<string, WorkOrderNode>()
  for (const requestedRootId of new Set(requestedRootIds.map((id) => id.trim()).filter(Boolean))) {
    if (!recordsById.has(requestedRootId)) continue
    const included = new Set<string>()

    const visit = (
      internalId: string,
      activePath: ReadonlySet<string>
    ): WorkOrderNode | undefined => {
      if (activePath.has(internalId) || included.has(internalId)) return undefined
      const record = recordsById.get(internalId)
      if (!record) return undefined

      included.add(internalId)
      const nextPath = new Set(activePath)
      nextPath.add(internalId)
      const children = (childIdsByParent.get(internalId) ?? [])
        .map((childId) => visit(childId, nextPath))
        .filter((child): child is WorkOrderNode => child !== undefined)

      return {
        ...record,
        rootWorkOrderInternalId: record.rootWorkOrderInternalId ?? requestedRootId,
        children
      }
    }

    const hierarchy = visit(requestedRootId, new Set())
    if (hierarchy) hierarchies.set(requestedRootId, hierarchy)
  }

  return hierarchies
}

export class RepositoryWorkOrderHierarchyResolver implements WorkOrderHierarchyResolver {
  private readonly repository: WorkOrderRepository

  constructor(repository: WorkOrderRepository) {
    this.repository = repository
  }

  async getHierarchy(
    rootWorkOrderInternalId: string,
    options?: SuiteQlOptions
  ): Promise<WorkOrderNode | undefined> {
    const hierarchies = await this.getHierarchies([rootWorkOrderInternalId], options)
    return hierarchies.get(rootWorkOrderInternalId.trim())
  }

  async getHierarchies(
    rootWorkOrderInternalIds: readonly string[],
    options?: SuiteQlOptions
  ): Promise<ReadonlyMap<string, WorkOrderNode>> {
    const rootIds = [...new Set(rootWorkOrderInternalIds.map((id) => id.trim()).filter(Boolean))]
    if (rootIds.length === 0) return new Map()
    const records = await this.repository.getRelatedWorkOrders(rootIds, options)
    return buildWorkOrderHierarchyMap(records, rootIds)
  }
}
