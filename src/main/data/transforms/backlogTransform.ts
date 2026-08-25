import { z } from 'zod'

import type { BacklogRow } from '@shared/types/backlog'
import { normalizeQuantity } from '@shared/utils/quantity'

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
    itemInternalId: externalScalarSchema,
    item: requiredExternalScalarSchema,
    itemDescription: externalScalarSchema,
    paintItemInternalId: externalScalarSchema,
    paintSku: externalScalarSchema,
    paintName: externalScalarSchema,
    fabricItemInternalId: externalScalarSchema,
    fabricSku: externalScalarSchema,
    fabricName: externalScalarSchema,
    weltItemInternalId: externalScalarSchema,
    weltSku: externalScalarSchema,
    weltName: externalScalarSchema,
    buttonItemInternalId: externalScalarSchema,
    buttonSku: externalScalarSchema,
    buttonName: externalScalarSchema,
    quantity: externalScalarSchema,
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
  const paintItemInternalId = optionalText(value.paintItemInternalId)
  const paintSku = optionalText(value.paintSku)
  const fabricItemInternalId = optionalText(value.fabricItemInternalId)
  const fabricSku = optionalText(value.fabricSku)
  const weltItemInternalId = optionalText(value.weltItemInternalId)
  const weltSku = optionalText(value.weltSku)
  const buttonItemInternalId = optionalText(value.buttonItemInternalId)
  const buttonSku = optionalText(value.buttonSku)
  const createdDate = optionalText(value.createdDate)
  const dueDate = optionalText(value.dueDate)
  const workOrderStatusCode = optionalText(value.workOrderStatusCode)
  const workOrderStatusLabel = optionalText(value.workOrderStatusLabel)

  const quantity = normalizeQuantity(value.quantity)
  const customerName = toText(value.customerName)

  return {
    rowKey: toText(value.rowKey),
    ...(customerInternalId ? { customerInternalId } : {}),
    customerName,
    poNumber: toText(value.poNumber),
    ...(workOrderInternalId ? { workOrderInternalId } : {}),
    ...(workOrderNumber ? { workOrderNumber } : {}),
    ...(salesOrderInternalId ? { salesOrderInternalId } : {}),
    salesOrderNumber: toText(value.salesOrderNumber).toUpperCase(),
    shipTo: customerName,
    ...(itemInternalId ? { itemInternalId } : {}),
    item: toText(value.item),
    itemDescription: toText(value.itemDescription),
    ...(paintItemInternalId ? { paintItemInternalId } : {}),
    ...(paintSku ? { paintSku } : {}),
    paintName: toText(value.paintName),
    ...(fabricItemInternalId ? { fabricItemInternalId } : {}),
    ...(fabricSku ? { fabricSku } : {}),
    fabricName: toText(value.fabricName),
    ...(weltItemInternalId ? { weltItemInternalId } : {}),
    ...(weltSku ? { weltSku } : {}),
    weltName: toText(value.weltName),
    ...(buttonItemInternalId ? { buttonItemInternalId } : {}),
    ...(buttonSku ? { buttonSku } : {}),
    buttonName: toText(value.buttonName),
    quantity,
    ...(createdDate ? { createdDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(workOrderStatusCode ? { workOrderStatusCode } : {}),
    ...(workOrderStatusLabel ? { workOrderStatusLabel } : {})
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
