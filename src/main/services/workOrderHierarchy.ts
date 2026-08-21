import type { WorkOrderRecord } from '../data/workOrderRecord'
import type { WorkOrderNode } from '@shared/types/backlog'

function normalizeRecord(record: WorkOrderRecord): WorkOrderRecord | undefined {
  const {
    parentWorkOrderInternalId: rawParentId,
    rootWorkOrderInternalId: rawRootId,
    ...recordWithoutRelationships
  } = record
  const internalId = record.internalId.trim()
  const workOrderNumber = record.workOrderNumber.trim()
  if (!internalId || !workOrderNumber) return undefined

  const parentWorkOrderInternalId = rawParentId?.trim()
  const rootWorkOrderInternalId = rawRootId?.trim()
  return {
    ...recordWithoutRelationships,
    internalId,
    workOrderNumber,
    ...(parentWorkOrderInternalId ? { parentWorkOrderInternalId } : {}),
    ...(rootWorkOrderInternalId ? { rootWorkOrderInternalId } : {})
  }
}

/**
 * Builds a tree exclusively from internal-ID parent relationships. A work order
 * is included at most once, and path tracking prevents malformed cycles.
 */
export function buildWorkOrderHierarchy(
  records: readonly WorkOrderRecord[],
  rootWorkOrderInternalId: string
): WorkOrderNode | undefined {
  const rootId = rootWorkOrderInternalId.trim()
  if (!rootId) return undefined

  const recordsById = new Map<string, WorkOrderRecord>()
  for (const candidate of records) {
    const record = normalizeRecord(candidate)
    if (!record || recordsById.has(record.internalId)) continue
    recordsById.set(record.internalId, record)
  }

  if (!recordsById.has(rootId)) return undefined

  const childrenByParent = new Map<string, WorkOrderRecord[]>()
  for (const record of recordsById.values()) {
    const parentId = record.parentWorkOrderInternalId?.trim()
    if (!parentId || !recordsById.has(parentId)) continue

    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(record)
    childrenByParent.set(parentId, siblings)
  }

  const included = new Set<string>()

  const buildNode = (
    internalId: string,
    activePath: ReadonlySet<string>
  ): WorkOrderNode | undefined => {
    if (activePath.has(internalId) || included.has(internalId)) return undefined

    const record = recordsById.get(internalId)
    if (!record) return undefined

    included.add(internalId)
    const nextPath = new Set(activePath)
    nextPath.add(internalId)

    const children = (childrenByParent.get(internalId) ?? [])
      .map((child) => buildNode(child.internalId, nextPath))
      .filter((child): child is WorkOrderNode => child !== undefined)

    return { ...record, children }
  }

  return buildNode(rootId, new Set())
}

export function buildWorkOrderHierarchyMap(
  records: readonly WorkOrderRecord[],
  rootWorkOrderInternalIds: Iterable<string>
): ReadonlyMap<string, WorkOrderNode> {
  const hierarchyByRoot = new Map<string, WorkOrderNode>()
  const normalizedRootIds = new Set<string>()
  for (const candidate of rootWorkOrderInternalIds) {
    const rootId = candidate.trim()
    if (rootId) normalizedRootIds.add(rootId)
  }

  for (const rootId of normalizedRootIds) {
    const hierarchy = buildWorkOrderHierarchy(records, rootId)
    if (hierarchy) hierarchyByRoot.set(rootId, hierarchy)
  }

  return hierarchyByRoot
}
