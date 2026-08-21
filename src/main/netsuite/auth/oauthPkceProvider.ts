import electron from 'electron'
import { z } from 'zod'

import type { RefreshTokenStore } from '../../storage/encryptedTokenStore'
import type { NetSuiteAuthProvider } from './authProvider'
import type { NetSuiteConfig, NetSuiteOAuthEndpoints } from '../config/netsuiteConfig'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { validateOAuthEndpoints } from '../config/netsuiteConfig'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { NetSuiteAuthenticationRequiredError, NetSuiteIntegrationError } from '../errors'
import { createPkceValues, oauthStateMatches } from './pkce'

const { shell } = electron

const DEFAULT_AUTH_ATTEMPT_MAX_AGE_MS = 10 * 60 * 1000
const DEFAULT_TOKEN_TIMEOUT_MS = 15_000
const TOKEN_EXPIRY_SKEW_MS = 60_000

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.union([z.number().positive(), z.string().regex(/^\d+$/)]),
  token_type: z.string().optional()
})

interface PendingAuthorization {
  state: string
  codeVerifier: string
  createdAt: number
}

interface MemoryAccessToken {
  value: string
  expiresAt: number
}

export interface OAuthBrowser {
  open(url: string): Promise<void>
}

export interface OAuthPkceProviderOptions {
  config: NetSuiteConfig
  endpoints: NetSuiteOAuthEndpoints
  tokenStore: RefreshTokenStore
  browser?: OAuthBrowser
  fetchImplementation?: typeof fetch
  logger?: DiagnosticLogger
  now?: () => number
  authorizationAttemptMaxAgeMs?: number
  tokenTimeoutMs?: number
}

const systemBrowser: OAuthBrowser = {
  async open(url) {
    await shell.openExternal(url)
  }
}

export class OAuthPkceProvider implements NetSuiteAuthProvider {
  private readonly config: NetSuiteConfig
  private readonly endpoints: NetSuiteOAuthEndpoints
  private readonly tokenStore: RefreshTokenStore
  private readonly browser: OAuthBrowser
  private readonly fetchImplementation: typeof fetch
  private readonly logger: DiagnosticLogger
  private readonly now: () => number
  private readonly authorizationAttemptMaxAgeMs: number
  private readonly tokenTimeoutMs: number
  private pendingAuthorization: PendingAuthorization | undefined
  private accessToken: MemoryAccessToken | undefined
  private refreshPromise: Promise<string> | undefined

  constructor(options: OAuthPkceProviderOptions) {
    validateOAuthEndpoints(options.endpoints)
    this.config = options.config
    this.endpoints = options.endpoints
    this.tokenStore = options.tokenStore
    this.browser = options.browser ?? systemBrowser
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.logger = options.logger ?? netSuiteDiagnosticLogger
    this.now = options.now ?? Date.now
    this.authorizationAttemptMaxAgeMs =
      options.authorizationAttemptMaxAgeMs ?? DEFAULT_AUTH_ATTEMPT_MAX_AGE_MS
    this.tokenTimeoutMs = options.tokenTimeoutMs ?? DEFAULT_TOKEN_TIMEOUT_MS
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt - TOKEN_EXPIRY_SKEW_MS > this.now()) {
      return this.accessToken.value
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken().finally(() => {
        this.refreshPromise = undefined
      })
    }
    return this.refreshPromise
  }

  async isAuthenticated(): Promise<boolean> {
    if (this.accessToken && this.accessToken.expiresAt - TOKEN_EXPIRY_SKEW_MS > this.now()) {
      return true
    }
    return Boolean(await this.tokenStore.getRefreshToken())
  }

  async signIn(): Promise<void> {
    const pkce = createPkceValues()
    this.pendingAuthorization = {
      state: pkce.state,
      codeVerifier: pkce.codeVerifier,
      createdAt: this.now()
    }

    const authorizationUrl = new URL(this.endpoints.authorizationEndpoint)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('client_id', this.config.clientId)
    authorizationUrl.searchParams.set('redirect_uri', this.config.redirectUri)
    authorizationUrl.searchParams.set('scope', this.config.scope)
    authorizationUrl.searchParams.set('state', pkce.state)
    authorizationUrl.searchParams.set('code_challenge', pkce.codeChallenge)
    authorizationUrl.searchParams.set('code_challenge_method', 'S256')

    try {
      await this.browser.open(authorizationUrl.toString())
      this.logger.info('Opened OAuth authorization in the system browser.', {
        endpointCategory: 'oauth'
      })
    } catch (error) {
      this.pendingAuthorization = undefined
      throw new NetSuiteIntegrationError('Unable to open the NetSuite sign-in page.', {
        code: 'authentication-failed',
        cause: error
      })
    }
  }

  async signOut(): Promise<void> {
    this.pendingAuthorization = undefined
    this.accessToken = undefined
    await this.tokenStore.clearRefreshToken()
    this.logger.info('Cleared locally stored NetSuite authentication.', {
      endpointCategory: 'oauth'
    })
  }

  invalidateAccessToken(): void {
    this.accessToken = undefined
  }

  async handleOAuthCallback(callbackUri: string): Promise<void> {
    const pending = this.pendingAuthorization
    if (!pending) {
      throw new NetSuiteIntegrationError('No NetSuite sign-in attempt is waiting for a callback.', {
        code: 'authentication-failed'
      })
    }

    try {
      if (this.now() - pending.createdAt > this.authorizationAttemptMaxAgeMs) {
        throw new NetSuiteIntegrationError(
          'The NetSuite sign-in attempt expired. Please try again.',
          {
            code: 'authentication-failed'
          }
        )
      }

      const callback = this.parseAndValidateCallback(callbackUri)
      const returnedState = callback.searchParams.get('state')
      if (!returnedState || !oauthStateMatches(pending.state, returnedState)) {
        throw new NetSuiteIntegrationError('The NetSuite sign-in callback state was invalid.', {
          code: 'authentication-failed'
        })
      }

      const authorizationError = callback.searchParams.get('error')
      if (authorizationError) {
        throw new NetSuiteIntegrationError('NetSuite did not authorize the application.', {
          code: 'authentication-failed'
        })
      }

      const authorizationCode = callback.searchParams.get('code')
      if (!authorizationCode) {
        throw new NetSuiteIntegrationError(
          'The NetSuite sign-in callback did not contain a code.',
          {
            code: 'authentication-failed'
          }
        )
      }

      await this.exchangeAuthorizationCode(authorizationCode, pending.codeVerifier)
      this.logger.info('NetSuite OAuth authorization completed.', { endpointCategory: 'oauth' })
    } finally {
      // Authorization codes, verifier values, and state are one-time values.
      this.pendingAuthorization = undefined
    }
  }

  private parseAndValidateCallback(callbackUri: string): URL {
    let callback: URL
    let configuredRedirect: URL
    try {
      callback = new URL(callbackUri)
      configuredRedirect = new URL(this.config.redirectUri)
    } catch (error) {
      throw new NetSuiteIntegrationError('The NetSuite sign-in callback was malformed.', {
        code: 'authentication-failed',
        cause: error
      })
    }

    const sameTarget =
      callback.protocol === configuredRedirect.protocol &&
      callback.hostname === configuredRedirect.hostname &&
      callback.pathname.replace(/\/$/, '') === configuredRedirect.pathname.replace(/\/$/, '')

    if (!sameTarget) {
      throw new NetSuiteIntegrationError('The NetSuite sign-in callback target was unexpected.', {
        code: 'authentication-failed'
      })
    }
    return callback
  }

  private async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<void> {
    const token = await this.requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        code_verifier: codeVerifier
      })
    )

    if (token.refreshToken) await this.tokenStore.setRefreshToken(token.refreshToken)
    this.accessToken = { value: token.accessToken, expiresAt: token.expiresAt }
  }

  private async refreshAccessToken(): Promise<string> {
    const refreshToken = await this.tokenStore.getRefreshToken()
    if (!refreshToken) throw new NetSuiteAuthenticationRequiredError()

    const token = await this.requestToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId
      })
    )

    // NetSuite may rotate refresh tokens. Always retain the newest token.
    if (token.refreshToken) await this.tokenStore.setRefreshToken(token.refreshToken)
    this.accessToken = { value: token.accessToken, expiresAt: token.expiresAt }
    return token.accessToken
  }

  private async requestToken(body: URLSearchParams): Promise<{
    accessToken: string
    refreshToken?: string
    expiresAt: number
  }> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.tokenTimeoutMs)
    const startedAt = this.now()

    try {
      const response = await this.fetchImplementation(this.endpoints.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal
      })

      if (!response.ok) {
        throw new NetSuiteIntegrationError('NetSuite rejected the OAuth token request.', {
          code: response.status === 401 ? 'authentication-required' : 'authentication-failed',
          status: response.status
        })
      }

      const parsed = tokenResponseSchema.safeParse(await response.json())
      if (!parsed.success) {
        throw new NetSuiteIntegrationError('NetSuite returned an invalid OAuth token response.', {
          code: 'response-validation'
        })
      }

      const expiresInSeconds = Number(parsed.data.expires_in)
      return {
        accessToken: parsed.data.access_token,
        ...(parsed.data.refresh_token ? { refreshToken: parsed.data.refresh_token } : {}),
        expiresAt: this.now() + expiresInSeconds * 1000
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new NetSuiteIntegrationError('The NetSuite OAuth request timed out.', {
          code: 'request-timeout',
          retryable: true,
          cause: error
        })
      }
      if (error instanceof NetSuiteIntegrationError) throw error
      throw new NetSuiteIntegrationError('Unable to reach NetSuite for authentication.', {
        code: 'network-error',
        retryable: true,
        cause: error
      })
    } finally {
      clearTimeout(timeout)
      this.logger.debug('OAuth token operation finished.', {
        endpointCategory: 'oauth',
        durationMs: this.now() - startedAt
      })
    }
  }
}
