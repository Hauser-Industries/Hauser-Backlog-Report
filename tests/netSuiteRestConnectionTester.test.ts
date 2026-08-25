import { describe, expect, it, vi } from 'vitest'

import type { NetSuiteAuthProvider } from '../src/main/netsuite/auth/authProvider'
import { PACKAGED_NETSUITE_CONFIG } from '../src/main/netsuite/config/netsuiteConfig'
import type { NetSuiteConfig } from '../src/main/netsuite/config/netsuiteConfig'
import { getNetSuiteEnvironmentProfile } from '../src/main/netsuite/config/environmentProfiles'
import { NetSuiteRestConnectionTester } from '../src/main/netsuite/connection/netSuiteRestConnectionTester'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'

const ACCESS_TOKEN = 'sentinel-memory-only-access-token'
const RAW_RESPONSE_SECRET = 'sentinel-raw-response-must-not-cross-ipc'

class FakeAuthProvider implements NetSuiteAuthProvider {
  getAccessTokenCalls = 0
  invalidateCalls = 0
  accessTokenError: Error | undefined

  async getAccessToken(): Promise<string> {
    this.getAccessTokenCalls += 1
    if (this.accessTokenError) throw this.accessTokenError
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

function createTester(options: {
  authProvider: FakeAuthProvider
  fetchImplementation: typeof fetch
  logger?: DiagnosticLogger
  config?: NetSuiteConfig
}) {
  return new NetSuiteRestConnectionTester({
    config: options.config ?? { ...PACKAGED_NETSUITE_CONFIG },
    authProvider: options.authProvider,
    fetchImplementation: options.fetchImplementation,
    ...(options.logger ? { logger: options.logger } : {})
  })
}

describe('NetSuiteRestConnectionTester', () => {
  it('performs the exact customer metadata request and returns only a typed success result', async () => {
    const authProvider = new FakeAuthProvider()
    const requests: Array<{ input: URL | RequestInfo; init?: RequestInit }> = []
    const { logger, output } = createCapturingLogger()
    const fetchImplementation: typeof fetch = async (input, init) => {
      requests.push({ input, ...(init ? { init } : {}) })
      return new Response(JSON.stringify({ secret: RAW_RESPONSE_SECRET }), {
        status: 200,
        headers: { 'Content-Type': 'application/schema+json' }
      })
    }
    const tester = createTester({ authProvider, fetchImplementation, logger })

    const result = await tester.testConnection()

    expect(authProvider.getAccessTokenCalls).toBe(1)
    expect(requests).toHaveLength(1)
    expect(String(requests[0]?.input)).toBe(
      'https://3850367-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/metadata-catalog/customer'
    )
    expect(requests[0]?.init?.method).toBe('GET')
    expect(requests[0]?.init?.body).toBeUndefined()
    expect(requests[0]?.init?.redirect).toBe('error')
    const headers = new Headers(requests[0]?.init?.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(headers.get('Accept')).toBe('application/schema+json')
    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      message: 'NetSuite REST connection successful.'
    })

    const rendererFacingData = JSON.stringify(result)
    expect(rendererFacingData).not.toContain(ACCESS_TOKEN)
    expect(rendererFacingData).not.toContain('Authorization')
    expect(rendererFacingData).not.toContain('Bearer')
    expect(rendererFacingData).not.toContain(RAW_RESPONSE_SECRET)
    expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(output)).not.toContain(RAW_RESPONSE_SECRET)
  })

  it('targets the production metadata origin when the production profile is active', async () => {
    const production = getNetSuiteEnvironmentProfile('3850367')
    if (!production) throw new Error('Expected the production profile.')
    const requests: Array<URL | RequestInfo> = []
    const tester = createTester({
      authProvider: new FakeAuthProvider(),
      config: production,
      fetchImplementation: async (input) => {
        requests.push(input)
        return new Response(null, { status: 200 })
      }
    })

    await tester.testConnection()

    expect(requests.map(String)).toEqual([
      'https://3850367.suitetalk.api.netsuite.com/services/rest/record/v1/metadata-catalog/customer'
    ])
  })

  it.each([
    [401, 'authentication', 'access token'],
    [403, 'permission', 'role'],
    [404, 'endpoint', 'SuiteTalk URL'],
    [429, 'rate-limited', 'rate or concurrency'],
    [500, 'service', 'temporarily unavailable'],
    [502, 'service', 'temporarily unavailable'],
    [503, 'service', 'temporarily unavailable']
  ] as const)(
    'maps HTTP %i to a sanitized %s failure',
    async (httpStatus, expectedCode, expectedMessageText) => {
      const authProvider = new FakeAuthProvider()
      const fetchImplementation: typeof fetch = async () =>
        new Response(JSON.stringify({ secret: RAW_RESPONSE_SECRET }), { status: httpStatus })
      const tester = createTester({ authProvider, fetchImplementation })

      const result = await tester.testConnection()

      expect(result).toMatchObject({
        ok: false,
        error: { code: expectedCode, httpStatus }
      })
      if (!result.ok) expect(result.error.message).toContain(expectedMessageText)
      expect(authProvider.invalidateCalls).toBe(httpStatus === 401 ? 1 : 0)
      expect(JSON.stringify(result)).not.toContain(RAW_RESPONSE_SECRET)
      expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
    }
  )

  it.each([201, 204, 302, 400])(
    'does not treat HTTP %i as a successful connection',
    async (status) => {
      const authProvider = new FakeAuthProvider()
      const tester = createTester({
        authProvider,
        fetchImplementation: async () => new Response(null, { status })
      })

      const result = await tester.testConnection()

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'unexpected-response', httpStatus: status }
      })
    }
  )

  it('returns a sanitized authentication failure without making a REST request', async () => {
    const authProvider = new FakeAuthProvider()
    authProvider.accessTokenError = new Error(`Bearer ${ACCESS_TOKEN}`)
    const fetchImplementation = vi.fn<typeof fetch>()
    const tester = createTester({ authProvider, fetchImplementation })

    const result = await tester.testConnection()

    expect(fetchImplementation).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'authentication',
        httpStatus: null,
        message: 'A valid NetSuite access token is unavailable. Sign in to NetSuite and try again.'
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
  })

  it('sanitizes network errors even when the thrown message contains credential data', async () => {
    const authProvider = new FakeAuthProvider()
    const { logger, output } = createCapturingLogger()
    const tester = createTester({
      authProvider,
      logger,
      fetchImplementation: async () => {
        throw new Error(`Authorization: Bearer ${ACCESS_TOKEN}`)
      }
    })

    const result = await tester.testConnection()

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'network',
        httpStatus: null,
        message:
          'Unable to reach the NetSuite REST endpoint. Check the network connection and try again.'
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
  })
})
