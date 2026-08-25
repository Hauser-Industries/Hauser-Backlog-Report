import { z } from 'zod'

import type {
  InspectSalesOrderOutcome,
  SalesOrderInspectionHeader,
  SalesOrderInspectionLine,
  SalesOrderInspectionRawType
} from '@shared/types/backlog'
import { InvalidSalesOrderNumberError, normalizeSalesOrderNumber } from '@shared/utils/salesOrder'
import type { SuiteQlClient } from '../client/suiteQlClient'
import type { NetSuiteEnvironmentProfile } from '../config/environmentProfiles'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../errors'
import { normalizeSalesOrderReportQuantity } from '../transforms/quantityNormalization'
import { mapSuiteQlDiagnosticFailure } from './netSuiteSuiteQlTester'

const SALES_ORDER_INSPECTION_QUERY_PREFIX = `SELECT
    t.id AS sales_order_internal_id,
    t.tranid AS sales_order_number,

    t.entity AS customer_internal_id,
    BUILTIN.DF(t.entity) AS customer_name,

    t.otherrefnum AS po_number,

    t.trandate AS transaction_date,
    t.createddate AS created_date,
    t.duedate AS standard_due_date,
    t.custbody_nscs_duedatebal AS hauser_due_date,

    tl.id AS transaction_line_id,
    tl.linesequencenumber AS line_sequence,

    tl.item AS item_internal_id,
    BUILTIN.DF(tl.item) AS item_display,

    tl.memo AS line_description_candidate,

    tl.quantity AS quantity_api_value,

    tl.isclosed AS is_closed,
    tl.itemtype AS item_type

FROM
    transaction t
    INNER JOIN transactionline tl
        ON tl.transaction = t.id

WHERE
    t.type = 'SalesOrd'
    AND UPPER(t.tranid) = `

const SALES_ORDER_INSPECTION_QUERY_SUFFIX = `
    AND NVL(tl.mainline, 'F') = 'F'
    AND NVL(tl.taxline, 'F') = 'F'
    AND tl.item IS NOT NULL

ORDER BY
    tl.linesequencenumber,
    tl.id`

/** Builds only the narrowly validated Sales Order diagnostic query. */
export function createSalesOrderInspectionQuery(normalizedSalesOrderNumber: string): string {
  if (!/^SO[0-9]+$/.test(normalizedSalesOrderNumber)) {
    throw new InvalidSalesOrderNumberError()
  }

  return `${SALES_ORDER_INSPECTION_QUERY_PREFIX}'${normalizedSalesOrderNumber}'${SALES_ORDER_INSPECTION_QUERY_SUFFIX}`
}

const nullableTextSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((value) => (value === null || value === undefined ? null : String(value)))

const requiredIdSchema = z
  .union([z.string().trim().min(1), z.number().int().nonnegative()])
  .transform(String)

const rawValueSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((value) => value ?? null)

const rawBooleanValueSchema = z
  .union([z.string(), z.boolean(), z.number()])
  .nullable()
  .optional()
  .transform((value) => value ?? null)

function normalizeSuiteQlAliasCasing(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key.toLowerCase(),
      entry
    ])
  )
}

const salesOrderRowSchema = z.preprocess(
  normalizeSuiteQlAliasCasing,
  z.object({
    sales_order_internal_id: requiredIdSchema,
    sales_order_number: z.string().trim().min(1),
    customer_internal_id: requiredIdSchema,
    customer_name: nullableTextSchema,
    po_number: nullableTextSchema,
    transaction_date: nullableTextSchema,
    created_date: nullableTextSchema,
    standard_due_date: nullableTextSchema,
    hauser_due_date: nullableTextSchema,
    transaction_line_id: requiredIdSchema,
    line_sequence: rawValueSchema,
    item_internal_id: requiredIdSchema,
    item_display: nullableTextSchema,
    line_description_candidate: nullableTextSchema,
    quantity_api_value: rawValueSchema,
    is_closed: rawBooleanValueSchema,
    item_type: nullableTextSchema
  })
)

type ParsedSalesOrderRow = z.infer<typeof salesOrderRowSchema>

export interface NetSuiteSalesOrderInspectorOptions {
  suiteQlClient: SuiteQlClient
  environmentProfile?: NetSuiteEnvironmentProfile
  logger?: DiagnosticLogger
}

function headerFrom(row: ParsedSalesOrderRow): SalesOrderInspectionHeader {
  return {
    salesOrderInternalId: row.sales_order_internal_id,
    salesOrderNumber: row.sales_order_number,
    customerInternalId: row.customer_internal_id,
    customerName: row.customer_name,
    poNumber: row.po_number,
    transactionDate: row.transaction_date,
    createdDate: row.created_date,
    standardDueDate: row.standard_due_date,
    hauserDueDate: row.hauser_due_date
  }
}

function rawApiType(value: unknown): SalesOrderInspectionRawType {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  return 'null'
}

function lineFrom(row: ParsedSalesOrderRow): SalesOrderInspectionLine {
  const normalizedQuantity = normalizeSalesOrderReportQuantity(row.quantity_api_value, {
    verified: true,
    orderedSign: 'as-returned'
  })
  const reportQuantity = normalizeSalesOrderReportQuantity(row.quantity_api_value, {
    verified: true,
    orderedSign: 'invert'
  })
  return {
    lineId: row.transaction_line_id,
    lineSequence: row.line_sequence,
    itemInternalId: row.item_internal_id,
    item: row.item_display,
    descriptionCandidate: row.line_description_candidate,
    rawQuantityApiValue: row.quantity_api_value,
    rawQuantityApiType: rawApiType(row.quantity_api_value),
    normalizedQuantity,
    reportQuantity,
    closed: row.is_closed,
    itemType: row.item_type
  }
}

function sameHeader(left: SalesOrderInspectionHeader, right: SalesOrderInspectionHeader): boolean {
  return Object.keys(left).every(
    (key) =>
      left[key as keyof SalesOrderInspectionHeader] ===
      right[key as keyof SalesOrderInspectionHeader]
  )
}

function addFailureStage(
  outcome: Extract<InspectSalesOrderOutcome, { success: false }>
): Extract<InspectSalesOrderOutcome, { success: false }> {
  return {
    ...outcome,
    error: {
      ...outcome.error,
      diagnostics: {
        ...outcome.error.diagnostics,
        stage: 'SALES_ORDER_QUERY'
      }
    }
  }
}

/** Inspects one Sales Order at transaction-line grain without applying report transformations. */
export class NetSuiteSalesOrderInspector {
  private readonly suiteQlClient: SuiteQlClient
  private readonly environmentProfile?: NetSuiteEnvironmentProfile
  private readonly logger: DiagnosticLogger

  constructor(options: NetSuiteSalesOrderInspectorOptions) {
    this.suiteQlClient = options.suiteQlClient
    if (options.environmentProfile) this.environmentProfile = options.environmentProfile
    this.logger = options.logger ?? netSuiteDiagnosticLogger
  }

  async inspectSalesOrder(input: string): Promise<InspectSalesOrderOutcome> {
    let salesOrderNumber: string
    try {
      salesOrderNumber = normalizeSalesOrderNumber(input)
    } catch (error) {
      if (error instanceof InvalidSalesOrderNumberError) {
        return {
          success: false,
          httpStatus: null,
          error: { code: 'invalid-input', message: error.message }
        }
      }
      throw error
    }

    try {
      const response = await this.suiteQlClient.queryAll({
        name: 'inspect-sales-order',
        sql: createSalesOrderInspectionQuery(salesOrderNumber)
      })
      if (response.items.length === 0) {
        return {
          success: true,
          httpStatus: 200,
          found: false,
          message: `Sales Order ${salesOrderNumber} was not found.`,
          salesOrderNumber
        }
      }

      const parsedRows = z.array(salesOrderRowSchema).safeParse(response.items)
      if (!parsedRows.success) {
        throw new NetSuiteIntegrationError('NetSuite returned invalid Sales Order rows.', {
          code: 'response-validation',
          status: 200,
          cause: parsedRows.error
        })
      }

      const header = headerFrom(parsedRows.data[0]!)
      if (parsedRows.data.some((row) => !sameHeader(header, headerFrom(row)))) {
        throw new NetSuiteIntegrationError(
          'NetSuite returned inconsistent Sales Order header values.',
          { code: 'response-validation', status: 200 }
        )
      }

      const lines = parsedRows.data.map(lineFrom)
      const configuredHauserCustomer =
        this.environmentProfile?.customers.some(
          (customer) => customer.internalId === header.customerInternalId
        ) ?? false

      this.logger.info('Sales Order inspection diagnostic completed.', {
        endpointCategory: 'sales-order-inspection',
        status: 200,
        recordFound: true,
        lineCount: lines.length,
        configuredHauserCustomer,
        environment: this.environmentProfile?.environment ?? 'unconfigured'
      })

      return {
        success: true,
        httpStatus: 200,
        found: true,
        message: `Sales Order ${salesOrderNumber} returned ${lines.length} transaction ${
          lines.length === 1 ? 'line' : 'lines'
        }.`,
        configuredHauserCustomer,
        header,
        lines
      }
    } catch (error) {
      const outcome = addFailureStage(mapSuiteQlDiagnosticFailure(error))
      this.logger.warn('Sales Order inspection diagnostic failed.', {
        endpointCategory: 'sales-order-inspection',
        stage: 'SALES_ORDER_QUERY',
        status: outcome.httpStatus,
        failureKind:
          error instanceof NetSuiteIntegrationError ? error.code : 'unexpected-inspection-failure'
      })
      return outcome
    }
  }
}
