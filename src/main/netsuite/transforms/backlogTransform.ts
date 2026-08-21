import { z } from 'zod'

import type { BacklogRow, WorkOrderStatus } from '@shared/types/backlog'
import type { SuiteQlRecord } from '../types/netsuiteTypes'
import type { VerifiedQuantityNormalization } from './quantityNormalization'
import { NetSuiteIntegrationError } from '../errors'
import { normalizeBacklogQuantities } from './quantityNormalization'

const scalar = z.union([z.string(), z.number(), z.null()])

/** Stable application aliases; these are not NetSuite field IDs. */
export const backlogRecordSchema = z
  .object({
    row_key: scalar,
    customer_internal_id: scalar.optional(),
    customer_name: scalar,
    po_number: scalar.optional(),
    work_order_internal_id: scalar.optional(),
    work_order_number: scalar.optional(),
    sales_order_internal_id: scalar.optional(),
    sales_order_number: scalar,
    ship_to: scalar.optional(),
    item_internal_id: scalar.optional(),
    item: scalar,
    item_description: scalar.optional(),
    paint_name: scalar.optional(),
    fabric_name: scalar.optional(),
    quantity: scalar.optional(),
    quantity_shipped: scalar.optional(),
    quantity_remaining: scalar.optional(),
    created_date: scalar.optional(),
    due_date: scalar.optional(),
    work_order_status_code: scalar.optional(),
    work_order_status_label: scalar.optional()
  })
  .passthrough()

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function optionalText(value: string | number | null | undefined): string | undefined {
  const normalized = text(value)
  return normalized ? normalized : undefined
}

function status(
  codeValue: string | number | null | undefined,
  labelValue: string | number | null | undefined
): WorkOrderStatus | undefined {
  const label = optionalText(labelValue)
  if (!label) return undefined
  const code = optionalText(codeValue)
  return { ...(code ? { code } : {}), label }
}

export function transformBacklogRecord(
  record: SuiteQlRecord,
  quantityRules: VerifiedQuantityNormalization
): BacklogRow {
  const parsed = backlogRecordSchema.safeParse(record)
  if (!parsed.success) {
    throw new NetSuiteIntegrationError('A SuiteQL backlog record failed validation.', {
      code: 'response-validation',
      cause: parsed.error
    })
  }

  const value = parsed.data
  const rowKey = text(value.row_key)
  const customerName = text(value.customer_name)
  const salesOrderNumber = text(value.sales_order_number)
  const item = text(value.item)
  if (!rowKey || !customerName || !salesOrderNumber || !item) {
    throw new NetSuiteIntegrationError('A required backlog display field was empty.', {
      code: 'response-validation'
    })
  }

  const quantities = normalizeBacklogQuantities(
    {
      ordered: value.quantity,
      shipped: value.quantity_shipped,
      remaining: value.quantity_remaining
    },
    quantityRules
  )
  const customerInternalId = optionalText(value.customer_internal_id)
  const workOrderInternalId = optionalText(value.work_order_internal_id)
  const workOrderNumber = optionalText(value.work_order_number)
  const salesOrderInternalId = optionalText(value.sales_order_internal_id)
  const itemInternalId = optionalText(value.item_internal_id)
  const createdDate = optionalText(value.created_date)
  const dueDate = optionalText(value.due_date)
  const workOrderStatus = status(value.work_order_status_code, value.work_order_status_label)

  return {
    rowKey,
    ...(customerInternalId ? { customerInternalId } : {}),
    customerName,
    poNumber: text(value.po_number),
    ...(workOrderInternalId ? { workOrderInternalId } : {}),
    ...(workOrderNumber ? { workOrderNumber } : {}),
    ...(salesOrderInternalId ? { salesOrderInternalId } : {}),
    salesOrderNumber,
    shipTo: text(value.ship_to),
    ...(itemInternalId ? { itemInternalId } : {}),
    item,
    itemDescription: text(value.item_description),
    paintName: text(value.paint_name),
    fabricName: text(value.fabric_name),
    ...quantities,
    ...(createdDate ? { createdDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(workOrderStatus ? { workOrderStatus } : {})
  }
}

export function transformBacklogRecords(
  records: readonly SuiteQlRecord[],
  quantityRules: VerifiedQuantityNormalization
): BacklogRow[] {
  return records.map((record) => transformBacklogRecord(record, quantityRules))
}
