import { describe, expect, it, vi } from 'vitest'

import type { NetSuiteAuthProvider } from '../src/main/netsuite/auth/authProvider'
import { NetSuiteHttpClient } from '../src/main/netsuite/client/netsuiteHttpClient'
import { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import { PACKAGED_NETSUITE_CONFIG } from '../src/main/netsuite/config/netsuiteConfig'
import type { NetSuiteConfig } from '../src/main/netsuite/config/netsuiteConfig'
import { getNetSuiteEnvironmentProfile } from '../src/main/netsuite/config/environmentProfiles'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../src/main/netsuite/errors'

const ACCESS_TOKEN = 'sentinel-suiteql-access-token'
const QUERY = 'SELECT id, entityid FROM customer ORDER BY id'

class FakeAuthProvider implements NetSuiteAuthProvider {
  invalidateCalls = 0

  async getAccessToken(): Promise<string> {
    return ACCESS_TOKEN
  }

  async isAuthenticated(): Promise<boolean> {
    return true
  }

  async signIn(): Promise<void> {}
  async signOut(): Promise<void> {}
  async handleOAuthCallback(): Promise<void> {}

  invalidateAccessToken(): void {
    this.invalidateCalls += 1
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

function createClient(
  fetchImplementation: typeof fetch,
  options: {
    authProvider?: FakeAuthProvider
    logger?: DiagnosticLogger
    config?: NetSuiteConfig
  } = {}
): SuiteQlClient {
  const httpClient = new NetSuiteHttpClient({
    config: options.config ?? { ...PACKAGED_NETSUITE_CONFIG },
    authProvider: options.authProvider ?? new FakeAuthProvider(),
    fetchImplementation,
    retryPolicy: { maxAttempts: 1 },
    ...(options.logger ? { logger: options.logger } : {})
  })
  return new SuiteQlClient(httpClient, options.logger)
}

describe('SuiteQlClient.executeSuiteQL', () => {
  it('makes the exact authenticated SuiteQL POST and returns the reusable page contract', async () => {
    const requests: Array<{ input: URL | RequestInfo; init?: RequestInit }> = []
    const fetchImplementation: typeof fetch = async (input, init) => {
      requests.push({ input, ...(init ? { init } : {}) })
      return Response.json({
        count: 2,
        offset: 0,
        totalResults: 27,
        hasMore: true,
        items: [
          { id: '123', entityid: 'Customer A' },
          { id: '456', entityid: 'Customer B' }
        ]
      })
    }
    const client = createClient(fetchImplementation)

    const result = await client.executeSuiteQL<{ id: string; entityid: string }>(QUERY, {
      limit: 5,
      offset: 0
    })

    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(String(request?.input)).toBe(
      `${PACKAGED_NETSUITE_CONFIG.suiteTalkUrl}/services/rest/query/v1/suiteql?limit=5&offset=0`
    )
    expect(request?.init?.method).toBe('POST')
    const headers = new Headers(request?.init?.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Prefer')).toBe('transient')
    expect(request?.init?.body).toBe(JSON.stringify({ q: QUERY }))
    expect(result).toEqual({
      count: 2,
      offset: 0,
      totalResults: 27,
      hasMore: true,
      items: [
        { id: '123', entityid: 'Customer A' },
        { id: '456', entityid: 'Customer B' }
      ]
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
  })

  it('targets the production SuiteQL origin when the production profile is active', async () => {
    const production = getNetSuiteEnvironmentProfile('3850367')
    if (!production) throw new Error('Expected the production profile.')
    const requests: Array<URL | RequestInfo> = []
    const client = createClient(
      async (input) => {
        requests.push(input)
        return Response.json({
          count: 0,
          offset: 0,
          totalResults: 0,
          hasMore: false,
          items: []
        })
      },
      { config: production }
    )

    await client.executeSuiteQL(QUERY, { limit: 5, offset: 0 })

    expect(requests.map(String)).toEqual([
      'https://3850367.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=5&offset=0'
    ])
  })

  it('includes bind parameters only when supplied by the caller', async () => {
    const bodies: unknown[] = []
    const client = createClient(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return Response.json({ count: 0, offset: 10, totalResults: 0, hasMore: false, items: [] })
    })

    await client.executeSuiteQL('SELECT id FROM customer WHERE id = ?', {
      limit: 10,
      offset: 10,
      params: ['123']
    })

    expect(bodies).toEqual([{ q: 'SELECT id FROM customer WHERE id = ?', params: ['123'] }])
  })

  it('retains the same bind parameters across paginated queryAll requests', async () => {
    const bodies: unknown[] = []
    const client = createClient(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      const offset = bodies.length === 1 ? 0 : 1
      return Response.json({
        count: 1,
        offset,
        totalResults: 2,
        hasMore: bodies.length === 1,
        items: [{ id: String(offset + 1) }]
      })
    })

    await client.queryAll(
      { name: 'parameterized-query', sql: 'SELECT id FROM customer WHERE entityid = ?' },
      { pageSize: 1, params: ['SO1234'] }
    )

    expect(bodies).toEqual([
      { q: 'SELECT id FROM customer WHERE entityid = ?', params: ['SO1234'] },
      { q: 'SELECT id FROM customer WHERE entityid = ?', params: ['SO1234'] }
    ])
  })

  it('does not treat a non-200 2xx response as a successful SuiteQL request', async () => {
    const client = createClient(async () =>
      Response.json(
        { count: 0, offset: 0, totalResults: 0, hasMore: false, items: [] },
        { status: 201 }
      )
    )

    await expect(client.executeSuiteQL(QUERY, { limit: 5, offset: 0 })).rejects.toMatchObject({
      code: 'api-error',
      status: 201
    })
  })

  it('extracts only sanitized NetSuite problem details from a rejected request', async () => {
    const client = createClient(async () =>
      Response.json(
        {
          type: 'https://www.rfc-editor.org/rfc/rfc9110.html#name-400-bad-request',
          title: 'Bad Request',
          status: 400,
          'o:errorDetails': [
            {
              detail: `Unknown field. ${ACCESS_TOKEN}; Authorization: Bearer ${ACCESS_TOKEN}`,
              'o:errorCode': 'INVALID_QUERY\u0000'
            }
          ],
          rawInternalResponse: 'must-not-be-copied'
        },
        { status: 400 }
      )
    )

    let thrown: unknown
    try {
      await client.executeSuiteQL(QUERY, { limit: 5, offset: 0 })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(NetSuiteIntegrationError)
    expect(thrown).toMatchObject({
      code: 'api-error',
      status: 400,
      netSuiteErrorCode: 'INVALID_QUERY',
      netSuiteErrorMessage: 'Unknown field. [REDACTED]; [REDACTED]'
    })
    expect(JSON.stringify(thrown)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(thrown)).not.toMatch(/authorization/i)
    expect(JSON.stringify(thrown)).not.toContain('must-not-be-copied')
  })

  it('invalidates only the in-memory access token on an HTTP 401', async () => {
    const authProvider = new FakeAuthProvider()
    const client = createClient(async () => new Response(null, { status: 401 }), {
      authProvider
    })

    await expect(client.executeSuiteQL(QUERY, { limit: 5, offset: 0 })).rejects.toMatchObject({
      code: 'authentication-required',
      status: 401
    })
    expect(authProvider.invalidateCalls).toBe(1)
  })

  it.each([
    { payload: { count: -1, offset: 0, totalResults: 0, hasMore: false, items: [] } },
    { payload: { count: 1, offset: 0, totalResults: 1, hasMore: false, items: 'invalid' } },
    { payload: { count: 1, offset: 0, hasMore: false, items: [{}] } },
    { payload: { count: 2, offset: 0, totalResults: 2, hasMore: false, items: [{}] } }
  ])('rejects a malformed SuiteQL page envelope: $payload', async ({ payload }) => {
    const client = createClient(async () => Response.json(payload))

    await expect(client.executeSuiteQL(QUERY, { limit: 5, offset: 0 })).rejects.toMatchObject({
      code: 'response-validation'
    })
  })

  it('rejects unsafe SQL and invalid paging options before making a request', async () => {
    const fetchImplementation = vi.fn<typeof fetch>()
    const client = createClient(fetchImplementation)

    await expect(client.executeSuiteQL('DELETE FROM customer')).rejects.toBeInstanceOf(
      NetSuiteIntegrationError
    )
    await expect(client.executeSuiteQL(QUERY, { limit: 0 })).rejects.toMatchObject({
      code: 'invalid-query'
    })
    await expect(client.executeSuiteQL(QUERY, { limit: 5, offset: -1 })).rejects.toMatchObject({
      code: 'invalid-query'
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('never writes the access token into diagnostics', async () => {
    const { logger, output } = createCapturingLogger()
    const client = createClient(
      async () =>
        Response.json({ count: 0, offset: 0, totalResults: 0, hasMore: false, items: [] }),
      { logger }
    )

    await client.executeSuiteQL(QUERY, { limit: 5, offset: 0 })

    expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(output)).not.toMatch(/authorization/i)
  })
})
