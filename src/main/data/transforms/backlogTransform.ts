import { z } from 'zod'

import type { BacklogRow, WorkOrderStatus } from '@shared/types/backlog'
import { calculateQuantityRemaining, normalizeQuantity } from '@shared/utils/quantity'

const externalScalarSchema = z.union([z.string(), z.number(), z.null()]).optional()
const requiredExternalScalarSchema = z
  .union([z.string(), z.number()])
  .refine((value) => String(value).trim().length > 0, 'Required value cannot be blank')

/**
 * These names are stable application aliases, not unverified NetSuite field IDs.
 * The live query/mapping layer is responsible for mapping verified fields to them.
 */
export const rawBacklogRecordSchema = z
  .object({
    rowKey: requiredExternalScalarSchema,
    customerInternalId: externalScalarSchema,
    customerName: requiredExternalScalarSchema,
    poNumber: externalScalarSchema,
    workOrderInternalId: externalScalarSchema,
    workOrderNumber: externalScalarSchema,
    salesOrderInternalId: externalScalarSchema,
    salesOrderNumber: requiredExternalScalarSchema,
    shipTo: externalScalarSchema,
    itemInternalId: externalScalarSchema,
    item: requiredExternalScalarSchema,
    itemDescription: externalScalarSchema,
    paintName: externalScalarSchema,
    fabricName: externalScalarSchema,
    quantity: externalScalarSchema,
    quantityShipped: externalScalarSchema,
    quantityRemaining: externalScalarSchema,
    createdDate: externalScalarSchema,
    dueDate: externalScalarSchema,
    workOrderStatusCode: externalScalarSchema,
    workOrderStatusLabel: externalScalarSchema
  })
  .passthrough()

export const rawBacklogPayloadSchema = z
  .object({
    items: z.array(z.unknown()),
    count: z.number().optional(),
    hasMore: z.boolean().optional(),
    offset: z.number().optional(),
    totalResults: z.number().optional()
  })
  .passthrough()

export type RawBacklogRecord = z.input<typeof rawBacklogRecordSchema>
export type RawBacklogPayload = z.input<typeof rawBacklogPayloadSchema>

export class BacklogTransformError extends Error {
  readonly recordIndex?: number

  constructor(message: string, recordIndex?: number) {
    super(message)
    this.name = 'BacklogTransformError'
    if (recordIndex !== undefined) this.recordIndex = recordIndex
  }
}

function toText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function optionalText(value: string | number | null | undefined): string | undefined {
  const text = toText(value)
  return text.length > 0 ? text : undefined
}

function hasValue(value: string | number | null | undefined): boolean {
  return optionalText(value) !== undefined
}

function transformStatus(
  codeValue: string | number | null | undefined,
  labelValue: string | number | null | undefined
): WorkOrderStatus | undefined {
  const label = optionalText(labelValue)
  if (!label) return undefined

  const code = optionalText(codeValue)
  return {
    ...(code ? { code } : {}),
    label
  }
}

export function transformBacklogRecord(raw: unknown, recordIndex?: number): BacklogRow {
  const parsed = rawBacklogRecordSchema.safeParse(raw)
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ')
    throw new BacklogTransformError(`Invalid backlog record: ${details}`, recordIndex)
  }

  const value = parsed.data
  const customerInternalId = optionalText(value.customerInternalId)
  const workOrderInternalId = optionalText(value.workOrderInternalId)
  const workOrderNumber = optionalText(value.workOrderNumber)
  const salesOrderInternalId = optionalText(value.salesOrderInternalId)
  const itemInternalId = optionalText(value.itemInternalId)
  const createdDate = optionalText(value.createdDate)
  const dueDate = optionalText(value.dueDate)
  const workOrderStatus = transformStatus(value.workOrderStatusCode, value.workOrderStatusLabel)

  const quantity = normalizeQuantity(value.quantity)
  const quantityShipped = normalizeQuantity(value.quantityShipped)
  // The verified live mapping should provide quantityRemaining. The fallback is
  // useful for mock/malformed payloads and is intentionally centralized here.
  const quantityRemaining = hasValue(value.quantityRemaining)
    ? normalizeQuantity(value.quantityRemaining)
    : calculateQuantityRemaining(quantity, quantityShipped)

  return {
    rowKey: toText(value.rowKey),
    ...(customerInternalId ? { customerInternalId } : {}),
    customerName: toText(value.customerName),
    poNumber: toText(value.poNumber),
    ...(workOrderInternalId ? { workOrderInternalId } : {}),
    ...(workOrderNumber ? { workOrderNumber } : {}),
    ...(salesOrderInternalId ? { salesOrderInternalId } : {}),
    salesOrderNumber: toText(value.salesOrderNumber).toUpperCase(),
    shipTo: toText(value.shipTo),
    ...(itemInternalId ? { itemInternalId } : {}),
    item: toText(value.item),
    itemDescription: toText(value.itemDescription),
    paintName: toText(value.paintName),
    fabricName: toText(value.fabricName),
    quantity,
    quantityShipped,
    quantityRemaining,
    ...(createdDate ? { createdDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(workOrderStatus ? { workOrderStatus } : {})
  }
}

export function transformBacklogPayload(payload: unknown): BacklogRow[] {
  const parsed = rawBacklogPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ')
    throw new BacklogTransformError(`Invalid backlog payload: ${details}`)
  }

  return parsed.data.items.map((record, index) => transformBacklogRecord(record, index))
}
