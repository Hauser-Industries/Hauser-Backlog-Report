import { describe, expect, it } from 'vitest'

import type { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import { NetSuiteSuiteQlTester } from '../src/main/netsuite/connection/netSuiteSuiteQlTester'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError, type NetSuiteErrorCode } from '../src/main/netsuite/errors'
import type { SuiteQLResponse } from '../src/main/netsuite/types/netsuiteTypes'

const ACCESS_TOKEN = 'sentinel-access-token-must-not-cross-ipc'
const REFRESH_TOKEN = 'sentinel-refresh-token-must-not-cross-ipc'
const QUERY = 'SELECT id, entityid FROM customer ORDER BY id'

class FakeSuiteQlClient {
  calls: Array<{ query: string; options: unknown }> = []
  response: SuiteQLResponse<unknown> = {
    count: 2,
    offset: 0,
    totalResults: 49,
    hasMore: true,
    items: [
      { id: '123', entityid: 'Customer A', rawSecret: ACCESS_TOKEN },
      { id: 456, entityid: 'Customer B', rawSecret: REFRESH_TOKEN }
    ]
  }
  error: unknown

  async executeSuiteQL<T>(query: string, options?: unknown): Promise<SuiteQLResponse<T>> {
    this.calls.push({ query, options })
    if (this.error) throw this.error
    return this.response as SuiteQLResponse<T>
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

function createTester(client: FakeSuiteQlClient, logger?: DiagnosticLogger): NetSuiteSuiteQlTester {
  return new NetSuiteSuiteQlTester({
    suiteQlClient: client as unknown as SuiteQlClient,
    ...(logger ? { logger } : {})
  })
}

function integrationError(
  code: NetSuiteErrorCode,
  status?: number,
  extra: { netSuiteErrorCode?: string; netSuiteErrorMessage?: string } = {}
): NetSuiteIntegrationError {
  return new NetSuiteIntegrationError(`internal ${code}: Bearer ${ACCESS_TOKEN}`, {
    code,
    ...(status === undefined ? {} : { status }),
    ...extra
  })
}

describe('NetSuiteSuiteQlTester', () => {
  it('executes only the five-row customer diagnostic and returns typed, sanitized fields', async () => {
    const client = new FakeSuiteQlClient()
    const { logger, output } = createCapturingLogger()
    const tester = createTester(client, logger)

    const result = await tester.testSuiteQl()

    expect(client.calls).toEqual([{ query: QUERY, options: { limit: 5, offset: 0 } }])
    expect(result).toEqual({
      success: true,
      httpStatus: 200,
      message: 'SuiteQL connection successful.',
      count: 2,
      totalResults: 49,
      hasMore: true,
      items: [
        { id: '123', entityid: 'Customer A' },
        { id: '456', entityid: 'Customer B' }
      ]
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(result)).not.toContain(REFRESH_TOKEN)
    expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(output)).not.toContain(REFRESH_TOKEN)
  })

  it.each([
    {
      status: 401,
      code: 'authentication-required' as const,
      resultCode: 'authentication',
      message: 'SuiteQL authentication failed. Sign in to NetSuite again.'
    },
    {
      status: 403,
      code: 'permission-denied' as const,
      resultCode: 'permission',
      message:
        'The NetSuite role does not have permission to execute or access the requested SuiteQL data.'
    },
    {
      status: 429,
      code: 'rate-limited' as const,
      resultCode: 'rate-limited',
      message: 'NetSuite rate/concurrency limit reached.'
    },
    {
      status: 500,
      code: 'api-error' as const,
      resultCode: 'service',
      message: 'NetSuite returned a service error.'
    },
    {
      status: 503,
      code: 'api-error' as const,
      resultCode: 'service',
      message: 'NetSuite returned a service error.'
    }
  ])(
    'maps HTTP $status without leaking the underlying error ($resultCode)',
    async ({ status, code, resultCode, message }) => {
      const client = new FakeSuiteQlClient()
      client.error = integrationError(code, status)
      const { logger, output } = createCapturingLogger()

      const result = await createTester(client, logger).testSuiteQl()

      expect(result).toEqual({
        success: false,
        httpStatus: status,
        error: { code: resultCode, message }
      })
      expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
      expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
    }
  )

  it('returns only bounded, redacted NetSuite details for HTTP 400 diagnostics', async () => {
    const client = new FakeSuiteQlClient()
    client.error = integrationError('api-error', 400, {
      netSuiteErrorCode: 'INVALID_QUERY\u0000',
      netSuiteErrorMessage: `Invalid field. Authorization: Bearer ${ACCESS_TOKEN}`
    })
    const { logger, output } = createCapturingLogger()

    const result = await createTester(client, logger).testSuiteQl()

    expect(result).toEqual({
      success: false,
      httpStatus: 400,
      error: {
        code: 'bad-request',
        message: 'The SuiteQL request was rejected by NetSuite.',
        diagnostics: {
          netSuiteCode: 'INVALID_QUERY',
          netSuiteMessage: 'Invalid field. [REDACTED]'
        }
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
  })

  it.each(['network-error', 'request-timeout', 'request-cancelled'] as const)(
    'maps %s to a sanitized network failure',
    async (code) => {
      const client = new FakeSuiteQlClient()
      client.error = integrationError(code)

      const result = await createTester(client).testSuiteQl()

      expect(result).toEqual({
        success: false,
        httpStatus: null,
        error: {
          code: 'network',
          message: 'Unable to reach NetSuite for the SuiteQL connection test.'
        }
      })
      expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
    }
  )

  it('rejects invalid HTTP 200 customer rows without returning the raw response', async () => {
    const client = new FakeSuiteQlClient()
    client.response = {
      count: 1,
      offset: 0,
      totalResults: 1,
      hasMore: false,
      items: [{ id: '123', entityid: '', rawSecret: REFRESH_TOKEN }]
    }

    const result = await createTester(client).testSuiteQl()

    expect(result).toEqual({
      success: false,
      httpStatus: 200,
      error: {
        code: 'unexpected-response',
        message: 'NetSuite returned an unexpected response to the SuiteQL connection test.'
      }
    })
    expect(JSON.stringify(result)).not.toContain(REFRESH_TOKEN)
  })

  it('sanitizes an unexpected thrown error before it reaches the typed boundary', async () => {
    const client = new FakeSuiteQlClient()
    client.error = new Error(`Authorization: Bearer ${ACCESS_TOKEN}`)

    const result = await createTester(client).testSuiteQl()

    expect(result).toEqual({
      success: false,
      httpStatus: null,
      error: {
        code: 'unexpected-response',
        message: 'The SuiteQL connection test could not be completed.'
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
  })
})
