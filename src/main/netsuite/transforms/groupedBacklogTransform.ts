import { z } from 'zod'

import type { BacklogItemRow, SalesOrderGroup } from '@shared/types/backlog'
import type { SuiteQlRecord } from '../types/netsuiteTypes'
import type { VerifiedQuantityNormalization } from './quantityNormalization'
import { NetSuiteIntegrationError } from '../errors'
import { normalizeSalesOrderReportQuantity } from './quantityNormalization'

const scalar = z.union([z.string(), z.number(), z.null()])

function normalizeSuiteQlAliasCasing(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key.toLowerCase(),
      entry
    ])
  )
}

const salesOrderHeaderSchema = z.preprocess(
  normalizeSuiteQlAliasCasing,
  z.object({
    sales_order_internal_id: scalar,
    sales_order_number: scalar,
    customer_internal_id: scalar,
    customer_name: scalar,
    po_number: scalar.optional(),
    created_date: scalar.optional(),
    due_date: scalar.optional()
  })
  .passthrough()
)

const salesOrderLineSchema = z.preprocess(
  normalizeSuiteQlAliasCasing,
  z.object({
    sales_order_internal_id: scalar,
    line_id: scalar,
    line_sequence: scalar.optional(),
    item_internal_id: scalar,
    item: scalar,
    item_description: scalar.optional(),
    quantity_api_value: scalar.optional()
  })
  .passthrough()
)

function text(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function requiredText(value: string | number | null | undefined, field: string): string {
  const normalized = text(value)
  if (!normalized) {
    throw new NetSuiteIntegrationError(`A required Sales Order ${field} field was empty.`, {
      code: 'response-validation'
    })
  }
  return normalized
}

function nullableText(value: string | number | null | undefined): string | null {
  const normalized = text(value)
  return normalized || null
}

function nullableInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

export function transformSalesOrderHeader(record: SuiteQlRecord): SalesOrderGroup {
  const parsed = salesOrderHeaderSchema.safeParse(record)
  if (!parsed.success) {
    throw new NetSuiteIntegrationError('A SuiteQL Sales Order header failed validation.', {
      code: 'response-validation',
      cause: parsed.error
    })
  }

  const value = parsed.data
  return {
    salesOrderInternalId: requiredText(value.sales_order_internal_id, 'internal ID'),
    salesOrderNumber: requiredText(value.sales_order_number, 'number'),
    customerInternalId: requiredText(value.customer_internal_id, 'customer internal ID'),
    customerName: requiredText(value.customer_name, 'customer name'),
    poNumber: text(value.po_number),
    createdDate: nullableText(value.created_date),
    dueDate: nullableText(value.due_date),
    items: []
  }
}

export function transformSalesOrderLine(
  record: SuiteQlRecord,
  quantityRules: VerifiedQuantityNormalization
): { salesOrderInternalId: string; item: BacklogItemRow } {
  const parsed = salesOrderLineSchema.safeParse(record)
  if (!parsed.success) {
    throw new NetSuiteIntegrationError('A SuiteQL Sales Order line failed validation.', {
      code: 'response-validation',
      cause: parsed.error
    })
  }

  const value = parsed.data
  const salesOrderInternalId = requiredText(
    value.sales_order_internal_id,
    'line transaction ID'
  )
  const lineId = requiredText(value.line_id, 'line ID')
  const itemInternalId = requiredText(value.item_internal_id, 'item internal ID')

  return {
    salesOrderInternalId,
    item: {
      rowKey: `${salesOrderInternalId}-${lineId}`,
      lineId,
      lineSequence: nullableInteger(value.line_sequence),
      itemInternalId,
      item: requiredText(value.item, 'item'),
      itemDescription: text(value.item_description),
      quantity: normalizeSalesOrderReportQuantity(value.quantity_api_value, quantityRules)
    }
  }
}
