import { z } from 'zod'

import type { WorkOrderRecord, SuiteQlRecord } from '../types/netsuiteTypes'
import type { QuantitySignRule } from './quantityNormalization'
import { NetSuiteIntegrationError } from '../errors'
import { normalizeOptionalQuantity } from './quantityNormalization'

const scalar = z.union([z.string(), z.number(), z.null()])

/** Stable result aliases populated only by a verified relationship query. */
export const workOrderRecordSchema = z
  .object({
    internal_id: scalar,
    work_order_number: scalar,
    parent_work_order_internal_id: scalar.optional(),
    root_work_order_internal_id: scalar.optional(),
    item_internal_id: scalar.optional(),
    item: scalar,
    item_description: scalar.optional(),
    status_code: scalar.optional(),
    status_label: scalar,
    quantity: scalar.optional(),
    quantity_completed: scalar.optional(),
    quantity_remaining: scalar.optional(),
    created_date: scalar.optional(),
    due_date: scalar.optional()
  })
  .passthrough()

export interface WorkOrderQuantityRules {
  quantity: QuantitySignRule
  completed: QuantitySignRule
  remaining: QuantitySignRule
}

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function optionalText(value: string | number | null | undefined): string | undefined {
  const normalized = text(value)
  return normalized ? normalized : undefined
}

export function transformWorkOrderRecord(
  record: SuiteQlRecord,
  quantityRules: WorkOrderQuantityRules
): WorkOrderRecord {
  const parsed = workOrderRecordSchema.safeParse(record)
  if (!parsed.success) {
    throw new NetSuiteIntegrationError('A SuiteQL Work Order record failed validation.', {
      code: 'response-validation',
      cause: parsed.error
    })
  }

  const value = parsed.data
  const internalId = text(value.internal_id)
  const workOrderNumber = text(value.work_order_number)
  const item = text(value.item)
  const statusLabel = text(value.status_label)
  if (!internalId || !workOrderNumber || !item || !statusLabel) {
    throw new NetSuiteIntegrationError('A required Work Order display field was empty.', {
      code: 'response-validation'
    })
  }

  const parentWorkOrderInternalId = optionalText(value.parent_work_order_internal_id)
  const rootWorkOrderInternalId = optionalText(value.root_work_order_internal_id)
  const itemInternalId = optionalText(value.item_internal_id)
  const itemDescription = optionalText(value.item_description)
  const statusCode = optionalText(value.status_code)
  const quantity = normalizeOptionalQuantity(value.quantity, quantityRules.quantity)
  const quantityCompleted = normalizeOptionalQuantity(
    value.quantity_completed,
    quantityRules.completed
  )
  const quantityRemaining = normalizeOptionalQuantity(
    value.quantity_remaining,
    quantityRules.remaining
  )
  const createdDate = optionalText(value.created_date)
  const dueDate = optionalText(value.due_date)

  return {
    internalId,
    workOrderNumber,
    ...(parentWorkOrderInternalId ? { parentWorkOrderInternalId } : {}),
    ...(rootWorkOrderInternalId ? { rootWorkOrderInternalId } : {}),
    ...(itemInternalId ? { itemInternalId } : {}),
    item,
    ...(itemDescription ? { itemDescription } : {}),
    ...(statusCode ? { statusCode } : {}),
    statusLabel,
    ...(quantity !== undefined ? { quantity } : {}),
    ...(quantityCompleted !== undefined ? { quantityCompleted } : {}),
    ...(quantityRemaining !== undefined ? { quantityRemaining } : {}),
    ...(createdDate ? { createdDate } : {}),
    ...(dueDate ? { dueDate } : {})
  }
}

export function transformWorkOrderRecords(
  records: readonly SuiteQlRecord[],
  quantityRules: WorkOrderQuantityRules
): WorkOrderRecord[] {
  return records.map((record) => transformWorkOrderRecord(record, quantityRules))
}
