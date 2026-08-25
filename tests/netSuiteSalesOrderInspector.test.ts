import { describe, expect, it } from 'vitest'

import type { NetSuiteAuthProvider } from '../src/main/netsuite/auth/authProvider'
import { NetSuiteHttpClient } from '../src/main/netsuite/client/netsuiteHttpClient'
import { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import type { SuiteQlOptions } from '../src/main/netsuite/client/suiteQlClient'
import { getNetSuiteEnvironmentProfile } from '../src/main/netsuite/config/environmentProfiles'
import {
  createSalesOrderInspectionQuery,
  NetSuiteSalesOrderInspector
} from '../src/main/netsuite/connection/netSuiteSalesOrderInspector'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../src/main/netsuite/errors'
import type {
  SuiteQlQuery,
  SuiteQlQueryResult,
  SuiteQlRecord
} from '../src/main/netsuite/types/netsuiteTypes'
import { InvalidSalesOrderNumberError } from '../src/shared/utils/salesOrder'

const ACCESS_TOKEN = 'sentinel-sales-order-access-token'

class FakeSuiteQlClient {
  calls: Array<{ query: SuiteQlQuery; options?: SuiteQlOptions }> = []
  response: SuiteQlQueryResult = { items: [], totalResults: 0, pages: 1 }
  error: unknown

  async queryAll(query: SuiteQlQuery, options?: SuiteQlOptions): Promise<SuiteQlQueryResult> {
    this.calls.push({ query, ...(options ? { options } : {}) })
    if (this.error) throw this.error
    return this.response
  }
}

class FakeAuthProvider implements NetSuiteAuthProvider {
  async getAccessToken(): Promise<string> {
    return ACCESS_TOKEN
  }

  async isAuthenticated(): Promise<boolean> {
    return true
  }

  async signIn(): Promise<void> {}
  async signOut(): Promise<void> {}
  async handleOAuthCallback(): Promise<void> {}
  invalidateAccessToken(): void {}
}

function row(overrides: SuiteQlRecord = {}): SuiteQlRecord {
  return {
    sales_order_internal_id: '9001',
    sales_order_number: 'SO1234',
    customer_internal_id: '5151',
    customer_name: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
    po_number: 'PO-88',
    transaction_date: '8/21/2026',
    created_date: '8/20/2026 10:15 am',
    standard_due_date: null,
    hauser_due_date: '9/5/2026',
    transaction_line_id: '10',
    line_sequence: 1,
    item_internal_id: '301',
    item_display: 'CHAIR-01',
    line_description_candidate: 'Diagnostic description',
    quantity_api_value: -4,
    is_closed: 'F',
    item_type: 'InvtPart',
    raw_secret: 'must-not-cross-the-boundary',
    ...overrides
  }
}

function createCapturingLogger(): { logger: DiagnosticLogger; output: unknown[] } {
  const output: unknown[] = []
  return {
    output,
    logger: {
      debug: (message, details) => output.push({ level: 'debug', message, details }),
      info: (message, details) => output.push({ level: 'info', message, details }),
      warn: (message, details) => output.push({ level: 'warn', message, details }),
      error: (message, details) => output.push({ level: 'error', message, details })
    }
  }
}

function createInspector(
  client: FakeSuiteQlClient,
  logger?: DiagnosticLogger,
  accountId = '3850367_SB1'
) {
  const environmentProfile = getNetSuiteEnvironmentProfile(accountId)
  if (!environmentProfile) throw new Error(`Expected the ${accountId} test profile.`)

  return new NetSuiteSalesOrderInspector({
    suiteQlClient: client as unknown as SuiteQlClient,
    environmentProfile,
    ...(logger ? { logger } : {})
  })
}

function createHttpBackedInspector(fetchImplementation: typeof fetch): NetSuiteSalesOrderInspector {
  const environmentProfile = getNetSuiteEnvironmentProfile('3850367')
  if (!environmentProfile) throw new Error('Expected the production test profile.')

  const { logger } = createCapturingLogger()
  const httpClient = new NetSuiteHttpClient({
    config: environmentProfile,
    authProvider: new FakeAuthProvider(),
    fetchImplementation,
    logger,
    retryPolicy: { maxAttempts: 1 }
  })

  return new NetSuiteSalesOrderInspector({
    suiteQlClient: new SuiteQlClient(httpClient, logger),
    environmentProfile,
    logger
  })
}

describe('NetSuiteSalesOrderInspector', () => {
  it('uses the restored known-good Sales Order query without experimental fields', async () => {
    const client = new FakeSuiteQlClient()
    client.response = { items: [row()], totalResults: 1, pages: 1 }

    await createInspector(client).inspectSalesOrder(' so10144 ')

    const expectedQuery = createSalesOrderInspectionQuery('SO10144')
    expect(client.calls).toEqual([{ query: { name: 'inspect-sales-order', sql: expectedQuery } }])
    expect(expectedQuery).toContain("UPPER(t.tranid) = 'SO10144'")
    expect(expectedQuery).toContain('t.custbody_nscs_duedatebal AS hauser_due_date')
    expect(expectedQuery).toContain('t.duedate AS standard_due_date')
    expect(expectedQuery).not.toMatch(/custcol_nscs_|createwo/i)
    expect(expectedQuery).not.toContain('?')
    expect(expectedQuery).not.toMatch(/FROM item|type = 'WorkOrd'|itemfulfillment|bom/i)
  })

  it.each(["SO10'144", 'SO10144 OR 1=1', 'ABC123', 'SO 10144', ''])(
    'rejects invalid input %j before making a SuiteQL request',
    async (input) => {
      const client = new FakeSuiteQlClient()

      await expect(createInspector(client).inspectSalesOrder(input)).resolves.toEqual({
        success: false,
        httpStatus: null,
        error: {
          code: 'invalid-input',
          message: 'Enter a Sales Order number such as 1234 or SO1234.'
        }
      })
      expect(client.calls).toHaveLength(0)
    }
  )

  it('refuses unsafe values at the Sales Order query-builder boundary', () => {
    expect(() => createSalesOrderInspectionQuery("SO10'144")).toThrow(InvalidSalesOrderNumberError)
  })

  it('sends a q-only REST SuiteQL body on the compatibility path', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const inspector = createHttpBackedInspector(async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json({
        count: 0,
        offset: 0,
        totalResults: 0,
        hasMore: false,
        items: []
      })
    })

    await inspector.inspectSalesOrder('10144')

    expect(requestBodies).toEqual([{ q: createSalesOrderInspectionQuery('SO10144') }])
    expect(requestBodies[0]).not.toHaveProperty('params')
  })

  it('makes zero NetSuite HTTP requests for invalid Sales Order input', async () => {
    let requestCount = 0
    const inspector = createHttpBackedInspector(async () => {
      requestCount += 1
      return Response.json({})
    })

    await inspector.inspectSalesOrder('SO10144 OR 1=1')

    expect(requestCount).toBe(0)
  })

  it.each([
    { status: 400, netSuiteCode: 'INVALID_SEARCH', netSuiteMessage: 'Unknown identifier.' },
    { status: 500, netSuiteCode: 'UNEXPECTED_ERROR', netSuiteMessage: 'Query processing failed.' }
  ])(
    'preserves sanitized NetSuite diagnostics and the Sales Order failure stage for HTTP $status',
    async ({ status, netSuiteCode, netSuiteMessage }) => {
      const inspector = createHttpBackedInspector(async () =>
        Response.json(
          {
            'o:errorDetails': [
              {
                detail: netSuiteMessage,
                'o:errorCode': netSuiteCode
              }
            ]
          },
          { status }
        )
      )

      const result = await inspector.inspectSalesOrder('10144')

      expect(result).toMatchObject({
        success: false,
        httpStatus: status,
        error: {
          diagnostics: {
            stage: 'SALES_ORDER_QUERY',
            netSuiteCode,
            netSuiteMessage
          }
        }
      })
    }
  )

  it('returns the known-good header and line values without secondary requests', async () => {
    const client = new FakeSuiteQlClient()
    client.response = {
      items: [
        row()
      ],
      totalResults: 1,
      pages: 1
    }

    const result = await createInspector(client).inspectSalesOrder('1234')

    expect(result).toMatchObject({
      success: true,
      httpStatus: 200,
      found: true,
      configuredHauserCustomer: true,
      header: {
        salesOrderInternalId: '9001',
        salesOrderNumber: 'SO1234',
        customerInternalId: '5151',
        customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
        poNumber: 'PO-88',
        createdDate: '8/20/2026 10:15 am',
        standardDueDate: null,
        hauserDueDate: '9/5/2026'
      },
      lines: [
        {
          lineId: '10',
          rawQuantityApiValue: -4,
          rawQuantityApiType: 'number',
          normalizedQuantity: -4,
          reportQuantity: 4
        }
      ]
    })
    expect(client.calls).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('raw_secret')
    expect(JSON.stringify(result)).not.toContain('must-not-cross-the-boundary')
  })

  it('preserves numeric strings and applies the verified SO10144 quantity inversion', async () => {
    const client = new FakeSuiteQlClient()
    const fixture = [
      { item: 'HSPR0290C', rawQuantity: '-1' },
      { item: 'HSPR0233C', rawQuantity: '-2' },
      { item: 'HSPR0232C', rawQuantity: '-2' },
      { item: 'HSPR0227C', rawQuantity: '-2' }
    ]
    client.response = {
      items: fixture.map(({ item, rawQuantity }, index) =>
        row({
          transaction_line_id: String(index + 1),
          line_sequence: index + 1,
          item_internal_id: String(300 + index),
          item_display: item,
          quantity_api_value: rawQuantity
        })
      ),
      totalResults: fixture.length,
      pages: 1
    }

    const result = await createInspector(client).inspectSalesOrder('10144')

    if (!result.success || !result.found) throw new Error('Expected a found Sales Order.')
    expect(
      result.lines.map((line) => ({
        item: line.item,
        rawValue: line.rawQuantityApiValue,
        rawType: line.rawQuantityApiType,
        normalized: line.normalizedQuantity,
        reportQuantity: line.reportQuantity
      }))
    ).toEqual([
      { item: 'HSPR0290C', rawValue: '-1', rawType: 'string', normalized: -1, reportQuantity: 1 },
      { item: 'HSPR0233C', rawValue: '-2', rawType: 'string', normalized: -2, reportQuantity: 2 },
      { item: 'HSPR0232C', rawValue: '-2', rawType: 'string', normalized: -2, reportQuantity: 2 },
      { item: 'HSPR0227C', rawValue: '-2', rawType: 'string', normalized: -2, reportQuantity: 2 }
    ])
  })

  it('accepts case-insensitive SuiteQL aliases and preserves null raw fields', async () => {
    const client = new FakeSuiteQlClient()
    const uppercaseAliases = Object.fromEntries(
      Object.entries(
        row({ quantity_api_value: '2' })
      ).map(([key, value]) => [key.toUpperCase(), value])
    )
    client.response = { items: [uppercaseAliases], totalResults: 1, pages: 1 }

    const result = await createInspector(client).inspectSalesOrder('1234')

    if (!result.success || !result.found) throw new Error('Expected a found Sales Order.')
    expect(result.lines[0]).toMatchObject({
      rawQuantityApiValue: '2',
      rawQuantityApiType: 'string',
      normalizedQuantity: 2,
      reportQuantity: -2
    })
  })

  it.each(['1432', '1446', '1578', '5602', '5625', '6344'])(
    'marks resolved production customer %s as configured',
    async (customerInternalId) => {
      const client = new FakeSuiteQlClient()
      client.response = {
        items: [row({ customer_internal_id: customerInternalId })],
        totalResults: 1,
        pages: 1
      }

      const result = await createInspector(client, undefined, '3850367').inspectSalesOrder('1234')

      expect(result.success && result.found && result.configuredHauserCustomer).toBe(true)
    }
  )

  it.each(['226', '5601'])(
    'keeps excluded production candidate %s outside the configured customers',
    async (customerInternalId) => {
      const client = new FakeSuiteQlClient()
      client.response = {
        items: [row({ customer_internal_id: customerInternalId })],
        totalResults: 1,
        pages: 1
      }

      const result = await createInspector(client, undefined, '3850367').inspectSalesOrder('1234')

      expect(result.success && result.found && result.configuredHauserCustomer).toBe(false)
    }
  )

  it('returns an explicit not-found result for an empty SuiteQL result', async () => {
    const client = new FakeSuiteQlClient()

    await expect(createInspector(client).inspectSalesOrder('1234')).resolves.toEqual({
      success: true,
      httpStatus: 200,
      found: false,
      message: 'Sales Order SO1234 was not found.',
      salesOrderNumber: 'SO1234'
    })
  })

  it('reuses sanitized SuiteQL failures, adds the stage, and does not log credentials', async () => {
    const client = new FakeSuiteQlClient()
    client.error = new NetSuiteIntegrationError(`Bearer ${ACCESS_TOKEN}`, {
      code: 'api-error',
      status: 400,
      netSuiteErrorCode: 'INVALID_SEARCH',
      netSuiteErrorMessage: `Authorization: Bearer ${ACCESS_TOKEN}`
    })
    const { logger, output } = createCapturingLogger()

    const result = await createInspector(client, logger).inspectSalesOrder('1234')

    expect(result).toEqual({
      success: false,
      httpStatus: 400,
      error: {
        code: 'bad-request',
        message: 'The SuiteQL request was rejected by NetSuite.',
        diagnostics: {
          stage: 'SALES_ORDER_QUERY',
          netSuiteCode: 'INVALID_SEARCH',
          netSuiteMessage: '[REDACTED]'
        }
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
  })

  it('sanitizes malformed Sales Order rows instead of returning raw data', async () => {
    const client = new FakeSuiteQlClient()
    client.response = {
      items: [{ sales_order_internal_id: '9001', raw_secret: ACCESS_TOKEN }],
      totalResults: 1,
      pages: 1
    }

    const result = await createInspector(client).inspectSalesOrder('1234')

    expect(result).toEqual({
      success: false,
      httpStatus: 200,
      error: {
        code: 'unexpected-response',
        message: 'NetSuite returned an unexpected response to the SuiteQL connection test.',
        diagnostics: { stage: 'SALES_ORDER_QUERY' }
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
  })
})
