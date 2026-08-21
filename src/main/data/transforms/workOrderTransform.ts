import { z } from 'zod'

import type { WorkOrderRecord } from '../workOrderRecord'
import { calculateQuantityRemaining, normalizeQuantity } from '@shared/utils/quantity'

const externalScalarSchema = z.union([z.string(), z.number(), z.null()]).optional()
const requiredExternalScalarSchema = z
  .union([z.string(), z.number()])
  .refine((value) => String(value).trim().length > 0, 'Required value cannot be blank')

/** Normalized aliases populated only after the account relationship fields are verified. */
export const rawWorkOrderRecordSchema = z
  .object({
    internalId: requiredExternalScalarSchema,
    workOrderNumber: requiredExternalScalarSchema,
    parentWorkOrderInternalId: externalScalarSchema,
    rootWorkOrderInternalId: externalScalarSchema,
    itemInternalId: externalScalarSchema,
    item: requiredExternalScalarSchema,
    itemDescription: externalScalarSchema,
    statusCode: externalScalarSchema,
    statusLabel: externalScalarSchema,
    quantity: externalScalarSchema,
    quantityCompleted: externalScalarSchema,
    quantityRemaining: externalScalarSchema,
    createdDate: externalScalarSchema,
    dueDate: externalScalarSchema
  })
  .passthrough()

export const rawWorkOrderPayloadSchema = z
  .object({
    items: z.array(z.unknown()),
    count: z.number().optional(),
    hasMore: z.boolean().optional(),
    offset: z.number().optional(),
    totalResults: z.number().optional()
  })
  .passthrough()

export type RawWorkOrderRecord = z.input<typeof rawWorkOrderRecordSchema>
export type RawWorkOrderPayload = z.input<typeof rawWorkOrderPayloadSchema>

export class WorkOrderTransformError extends Error {
  readonly recordIndex?: number

  constructor(message: string, recordIndex?: number) {
    super(message)
    this.name = 'WorkOrderTransformError'
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

export function transformWorkOrderRecord(raw: unknown, recordIndex?: number): WorkOrderRecord {
  const parsed = rawWorkOrderRecordSchema.safeParse(raw)
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ')
    throw new WorkOrderTransformError(`Invalid work order record: ${details}`, recordIndex)
  }

  const value = parsed.data
  const parentWorkOrderInternalId = optionalText(value.parentWorkOrderInternalId)
  const rootWorkOrderInternalId = optionalText(value.rootWorkOrderInternalId)
  const itemInternalId = optionalText(value.itemInternalId)
  const itemDescription = optionalText(value.itemDescription)
  const statusCode = optionalText(value.statusCode)
  const quantity = hasValue(value.quantity) ? normalizeQuantity(value.quantity) : undefined
  const quantityCompleted = hasValue(value.quantityCompleted)
    ? normalizeQuantity(value.quantityCompleted)
    : undefined
  const quantityRemaining = hasValue(value.quantityRemaining)
    ? normalizeQuantity(value.quantityRemaining)
    : quantity !== undefined && quantityCompleted !== undefined
      ? calculateQuantityRemaining(quantity, quantityCompleted)
      : undefined
  const createdDate = optionalText(value.createdDate)
  const dueDate = optionalText(value.dueDate)

  return {
    internalId: toText(value.internalId),
    workOrderNumber: toText(value.workOrderNumber),
    ...(parentWorkOrderInternalId ? { parentWorkOrderInternalId } : {}),
    ...(rootWorkOrderInternalId ? { rootWorkOrderInternalId } : {}),
    ...(itemInternalId ? { itemInternalId } : {}),
    item: toText(value.item),
    ...(itemDescription ? { itemDescription } : {}),
    ...(statusCode ? { statusCode } : {}),
    statusLabel: toText(value.statusLabel),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(quantityCompleted !== undefined ? { quantityCompleted } : {}),
    ...(quantityRemaining !== undefined ? { quantityRemaining } : {}),
    ...(createdDate ? { createdDate } : {}),
    ...(dueDate ? { dueDate } : {})
  }
}

export function transformWorkOrderPayload(payload: unknown): WorkOrderRecord[] {
  const parsed = rawWorkOrderPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join('; ')
    throw new WorkOrderTransformError(`Invalid work order payload: ${details}`)
  }

  return parsed.data.items.map((record, index) => transformWorkOrderRecord(record, index))
}
