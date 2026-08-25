import { describe, expect, it, vi } from 'vitest'

import { OAuthPkceProvider } from '../src/main/netsuite/auth/oauthPkceProvider'
import {
  createNetSuiteOAuthEndpoints,
  PACKAGED_NETSUITE_CONFIG
} from '../src/main/netsuite/config/netsuiteConfig'
import type { RefreshTokenStore } from '../src/main/storage/encryptedTokenStore'

class MemoryRefreshTokenStore implements RefreshTokenStore {
  value: string | undefined
  readonly taken: string[] = []
  readonly saved: string[] = []
  clearCount = 0

  constructor(initialValue?: string) {
    this.value = initialValue
  }

  async hasRefreshToken(): Promise<boolean> {
    return Boolean(this.value)
  }

  async takeRefreshToken(): Promise<string | undefined> {
    const token = this.value
    this.value = undefined
    if (token) this.taken.push(token)
    return token
  }

  async setRefreshToken(refreshToken: string): Promise<void> {
    this.saved.push(refreshToken)
    this.value = refreshToken
  }

  async clearRefreshToken(): Promise<void> {
    this.clearCount += 1
    this.value = undefined
  }
}

function successfulTokenResponse(accessToken: string, refreshToken: string): Response {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'Bearer'
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function createProvider(options: {
  tokenStore: MemoryRefreshTokenStore
  fetchImplementation: typeof fetch
  openedUrls?: string[]
}) {
  return new OAuthPkceProvider({
    config: { ...PACKAGED_NETSUITE_CONFIG },
    endpoints: createNetSuiteOAuthEndpoints(PACKAGED_NETSUITE_CONFIG),
    tokenStore: options.tokenStore,
    browser: {
      async open(url) {
        options.openedUrls?.push(url)
      }
    },
    fetchImplementation: options.fetchImplementation,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined
    }
  })
}

describe('OAuthPkceProvider', () => {
  it('opens the system authorization flow with PKCE and exchanges the callback once', async () => {
    const openedUrls: string[] = []
    const requests: RequestInit[] = []
    const tokenStore = new MemoryRefreshTokenStore()
    const fetchImplementation: typeof fetch = async (_input, init) => {
      requests.push(init ?? {})
      return successfulTokenResponse('memory-access-token', 'encrypted-by-store-refresh-token')
    }
    const provider = createProvider({ tokenStore, fetchImplementation, openedUrls })

    await provider.signIn()

    expect(openedUrls).toHaveLength(1)
    const authorizationUrl = new URL(openedUrls[0]!)
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      'https://3850367-sb1.app.netsuite.com/app/login/oauth2/authorize.nl'
    )
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code')
    expect(authorizationUrl.searchParams.get('client_id')).toBe(PACKAGED_NETSUITE_CONFIG.clientId)
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'hauser-backlog://oauth/callback'
    )
    expect(authorizationUrl.searchParams.get('scope')).toBe('rest_webservices')
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizationUrl.searchParams.get('code_challenge')).toBeTruthy()
    expect(authorizationUrl.searchParams.get('state')).toBeTruthy()

    await provider.handleOAuthCallback(
      `hauser-backlog://oauth/callback?code=one-time-code&state=${encodeURIComponent(
        authorizationUrl.searchParams.get('state')!
      )}`
    )

    expect(requests).toHaveLength(1)
    const body = new URLSearchParams(String(requests[0]?.body))
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('one-time-code')
    expect(body.get('code_verifier')).toBeTruthy()
    expect(body.has('client_secret')).toBe(false)
    expect(tokenStore.saved).toEqual(['encrypted-by-store-refresh-token'])
    expect(await provider.getAccessToken()).toBe('memory-access-token')
  })

  it('consumes each one-time refresh token and persists only its replacement', async () => {
    const requestBodies: URLSearchParams[] = []
    const tokenStore = new MemoryRefreshTokenStore('first-one-time-token')
    let requestNumber = 0
    const fetchImplementation: typeof fetch = async (_input, init) => {
      requestBodies.push(new URLSearchParams(String(init?.body)))
      requestNumber += 1
      return successfulTokenResponse(
        `access-${requestNumber}`,
        requestNumber === 1 ? 'second-one-time-token' : 'third-one-time-token'
      )
    }
    const provider = createProvider({ tokenStore, fetchImplementation })

    expect(await provider.getAccessToken()).toBe('access-1')
    provider.invalidateAccessToken()
    expect(await provider.getAccessToken()).toBe('access-2')

    expect(requestBodies.map((body) => body.get('refresh_token'))).toEqual([
      'first-one-time-token',
      'second-one-time-token'
    ])
    expect(tokenStore.taken).toEqual(['first-one-time-token', 'second-one-time-token'])
    expect(tokenStore.saved).toEqual(['second-one-time-token', 'third-one-time-token'])
    expect(tokenStore.value).toBe('third-one-time-token')
  })

  it('fails closed when NetSuite omits the replacement refresh token', async () => {
    const tokenStore = new MemoryRefreshTokenStore('token-that-will-be-consumed')
    const fetchImplementation: typeof fetch = async () =>
      new Response(JSON.stringify({ access_token: 'access-only', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    const provider = createProvider({ tokenStore, fetchImplementation })

    await expect(provider.getAccessToken()).rejects.toThrow(
      'NetSuite returned an invalid OAuth token response'
    )
    expect(tokenStore.taken).toEqual(['token-that-will-be-consumed'])
    expect(tokenStore.value).toBeUndefined()
    expect(await provider.isAuthenticated()).toBe(false)
  })

  it('cannot restore tokens when sign-out races an in-flight refresh', async () => {
    const tokenStore = new MemoryRefreshTokenStore('old-one-time-token')
    let resolveFetch!: (response: Response) => void
    const fetchImplementation: typeof fetch = async () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    const provider = createProvider({ tokenStore, fetchImplementation })

    const refresh = provider.getAccessToken()
    await vi.waitFor(() => expect(tokenStore.taken).toEqual(['old-one-time-token']))
    await provider.signOut()
    resolveFetch(successfulTokenResponse('late-access-token', 'late-refresh-token'))

    await expect(refresh).rejects.toThrow('NetSuite authentication is required')
    expect(tokenStore.value).toBeUndefined()
    expect(tokenStore.saved).toEqual([])
  })

  it('rejects duplicate callbacks while the first code exchange is in flight', async () => {
    const tokenStore = new MemoryRefreshTokenStore()
    const openedUrls: string[] = []
    let requestCount = 0
    let resolveFetch!: (response: Response) => void
    const fetchImplementation: typeof fetch = async () => {
      requestCount += 1
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    }
    const provider = createProvider({ tokenStore, fetchImplementation, openedUrls })
    await provider.signIn()
    const state = new URL(openedUrls[0]!).searchParams.get('state')!
    const callback = `hauser-backlog://oauth/callback?code=single-code&state=${state}`

    const firstCallback = provider.handleOAuthCallback(callback)
    await vi.waitFor(() => expect(requestCount).toBe(1))
    await expect(provider.handleOAuthCallback(callback)).rejects.toThrow(
      'No NetSuite sign-in attempt is waiting for a callback'
    )
    resolveFetch(successfulTokenResponse('access-token', 'refresh-token'))
    await firstCallback

    expect(requestCount).toBe(1)
  })

  it('clears the in-memory access token without deleting the environment refresh token', async () => {
    const tokenStore = new MemoryRefreshTokenStore('sandbox-one-time-token')
    let requestCount = 0
    const provider = createProvider({
      tokenStore,
      fetchImplementation: async () => {
        requestCount += 1
        return successfulTokenResponse(
          `access-${requestCount}`,
          `replacement-refresh-${requestCount}`
        )
      }
    })

    expect(await provider.getAccessToken()).toBe('access-1')
    provider.clearVolatileState()
    expect(tokenStore.clearCount).toBe(0)
    expect(await provider.getAccessToken()).toBe('access-2')
    expect(requestCount).toBe(2)
  })

  it('clears pending PKCE state when the environment session is abandoned', async () => {
    const tokenStore = new MemoryRefreshTokenStore()
    const openedUrls: string[] = []
    const provider = createProvider({
      tokenStore,
      fetchImplementation: async () => successfulTokenResponse('access', 'refresh'),
      openedUrls
    })
    await provider.signIn()
    const state = new URL(openedUrls[0]!).searchParams.get('state')!

    provider.clearVolatileState()

    await expect(
      provider.handleOAuthCallback(`hauser-backlog://oauth/callback?code=old-code&state=${state}`)
    ).rejects.toThrow('No NetSuite sign-in attempt is waiting for a callback')
  })
})
