import { z } from 'zod'

import type { BacklogRow } from '@shared/types/backlog'
import type { SuiteQlRecord } from '../types/netsuiteTypes'
import type { VerifiedQuantityNormalization } from './quantityNormalization'
import { NetSuiteIntegrationError } from '../errors'
import { normalizeBacklogQuantity } from './quantityNormalization'

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
    item_internal_id: scalar.optional(),
    item: scalar,
    item_description: scalar.optional(),
    paint_item_internal_id: scalar.optional(),
    paint_sku: scalar.optional(),
    paint_name: scalar.optional(),
    fabric_item_internal_id: scalar.optional(),
    fabric_sku: scalar.optional(),
    fabric_name: scalar.optional(),
    welt_item_internal_id: scalar.optional(),
    welt_sku: scalar.optional(),
    welt_name: scalar.optional(),
    button_item_internal_id: scalar.optional(),
    button_sku: scalar.optional(),
    button_name: scalar.optional(),
    quantity: scalar.optional(),
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

  const quantity = normalizeBacklogQuantity(value.quantity, quantityRules)
  const customerInternalId = optionalText(value.customer_internal_id)
  const workOrderInternalId = optionalText(value.work_order_internal_id)
  const workOrderNumber = optionalText(value.work_order_number)
  const salesOrderInternalId = optionalText(value.sales_order_internal_id)
  const itemInternalId = optionalText(value.item_internal_id)
  const paintItemInternalId = optionalText(value.paint_item_internal_id)
  const paintSku = optionalText(value.paint_sku)
  const fabricItemInternalId = optionalText(value.fabric_item_internal_id)
  const fabricSku = optionalText(value.fabric_sku)
  const weltItemInternalId = optionalText(value.welt_item_internal_id)
  const weltSku = optionalText(value.welt_sku)
  const buttonItemInternalId = optionalText(value.button_item_internal_id)
  const buttonSku = optionalText(value.button_sku)
  const createdDate = optionalText(value.created_date)
  const dueDate = optionalText(value.due_date)
  const workOrderStatusCode = optionalText(value.work_order_status_code)
  const workOrderStatusLabel = optionalText(value.work_order_status_label)

  return {
    rowKey,
    ...(customerInternalId ? { customerInternalId } : {}),
    customerName,
    poNumber: text(value.po_number),
    ...(workOrderInternalId ? { workOrderInternalId } : {}),
    ...(workOrderNumber ? { workOrderNumber } : {}),
    ...(salesOrderInternalId ? { salesOrderInternalId } : {}),
    salesOrderNumber,
    shipTo: customerName,
    ...(itemInternalId ? { itemInternalId } : {}),
    item,
    itemDescription: text(value.item_description),
    ...(paintItemInternalId ? { paintItemInternalId } : {}),
    ...(paintSku ? { paintSku } : {}),
    paintName: text(value.paint_name),
    ...(fabricItemInternalId ? { fabricItemInternalId } : {}),
    ...(fabricSku ? { fabricSku } : {}),
    fabricName: text(value.fabric_name),
    ...(weltItemInternalId ? { weltItemInternalId } : {}),
    ...(weltSku ? { weltSku } : {}),
    weltName: text(value.welt_name),
    ...(buttonItemInternalId ? { buttonItemInternalId } : {}),
    ...(buttonSku ? { buttonSku } : {}),
    buttonName: text(value.button_name),
    quantity,
    ...(createdDate ? { createdDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(workOrderStatusCode ? { workOrderStatusCode } : {}),
    ...(workOrderStatusLabel ? { workOrderStatusLabel } : {})
  }
}

export function transformBacklogRecords(
  records: readonly SuiteQlRecord[],
  quantityRules: VerifiedQuantityNormalization
): BacklogRow[] {
  return records.map((record) => transformBacklogRecord(record, quantityRules))
}
