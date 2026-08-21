import { randomInt } from 'node:crypto'
import type { z } from 'zod'

import type { NetSuiteAuthProvider } from '../auth/authProvider'
import type { NetSuiteConfig } from '../config/netsuiteConfig'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import type { NetSuiteEndpointCategory } from '../types/netsuiteTypes'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../errors'

const SUITEQL_PATH = '/services/rest/query/v1/suiteql'

export interface NetSuiteRetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export interface NetSuiteRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface NetSuiteHttpClientOptions {
  config: NetSuiteConfig
  authProvider: NetSuiteAuthProvider
  fetchImplementation?: typeof fetch
  logger?: DiagnosticLogger
  retryPolicy?: Partial<NetSuiteRetryPolicy>
  defaultTimeoutMs?: number
}

const DEFAULT_RETRY_POLICY: NetSuiteRetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 30_000
}

interface InternalRequest<T> {
  method: 'GET' | 'POST'
  relativePath: string
  endpointCategory: NetSuiteEndpointCategory
  schema: z.ZodType<T>
  body?: string
  headers?: Readonly<Record<string, string>>
  options?: NetSuiteRequestOptions
}

export class NetSuiteHttpClient {
  private readonly baseUrl: URL
  private readonly authProvider: NetSuiteAuthProvider
  private readonly fetchImplementation: typeof fetch
  private readonly logger: DiagnosticLogger
  private readonly retryPolicy: NetSuiteRetryPolicy
  private readonly defaultTimeoutMs: number

  constructor(options: NetSuiteHttpClientOptions) {
    this.baseUrl = new URL(options.config.accountDomain)
    this.authProvider = options.authProvider
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.logger = options.logger ?? netSuiteDiagnosticLogger
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...options.retryPolicy }
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000

    if (this.retryPolicy.maxAttempts < 1) {
      throw new NetSuiteIntegrationError('Retry maxAttempts must be at least one.', {
        code: 'api-error'
      })
    }
  }

  async postSuiteQl<T>(
    query: string,
    limit: number,
    offset: number,
    schema: z.ZodType<T>,
    options?: NetSuiteRequestOptions
  ): Promise<T> {
    const search = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    return this.request({
      method: 'POST',
      relativePath: `${SUITEQL_PATH}?${search.toString()}`,
      endpointCategory: 'suiteql',
      schema,
      body: JSON.stringify({ q: query }),
      headers: { Prefer: 'transient', 'Content-Type': 'application/json' },
      ...(options ? { options } : {})
    })
  }

  async getRestRecord<T>(
    relativePath: string,
    schema: z.ZodType<T>,
    options?: NetSuiteRequestOptions
  ): Promise<T> {
    if (!relativePath.startsWith('/services/rest/record/')) {
      throw new NetSuiteIntegrationError('Only NetSuite REST record paths are allowed.', {
        code: 'invalid-query'
      })
    }
    return this.request({
      method: 'GET',
      relativePath,
      endpointCategory: 'rest-record',
      schema,
      ...(options ? { options } : {})
    })
  }

  private async request<T>(request: InternalRequest<T>): Promise<T> {
    const target = this.resolveAllowedUrl(request.relativePath)
    const timeoutMs = request.options?.timeoutMs ?? this.defaultTimeoutMs

    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      if (request.options?.signal?.aborted) {
        throw new NetSuiteIntegrationError('The NetSuite request was cancelled.', {
          code: 'request-cancelled'
        })
      }

      const attemptController = new AbortController()
      let didTimeout = false
      const cancelAttempt = (): void => attemptController.abort(request.options?.signal?.reason)
      request.options?.signal?.addEventListener('abort', cancelAttempt, { once: true })
      const timeout = setTimeout(() => {
        didTimeout = true
        attemptController.abort()
      }, timeoutMs)
      const startedAt = Date.now()

      try {
        const accessToken = await this.authProvider.getAccessToken()
        const headers: Record<string, string> = {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...request.headers
        }
        const requestInit: RequestInit = {
          method: request.method,
          headers,
          signal: attemptController.signal
        }
        if (request.body !== undefined) requestInit.body = request.body

        const response = await this.fetchImplementation(target, requestInit)
        const durationMs = Date.now() - startedAt
        this.logger.debug('NetSuite request completed.', {
          endpointCategory: request.endpointCategory,
          status: response.status,
          durationMs,
          attempt
        })

        if (response.ok) {
          let payload: unknown
          try {
            payload = await response.json()
          } catch (error) {
            throw new NetSuiteIntegrationError('NetSuite returned malformed JSON.', {
              code: 'response-validation',
              cause: error
            })
          }
          const parsed = request.schema.safeParse(payload)
          if (!parsed.success) {
            throw new NetSuiteIntegrationError('NetSuite returned an unexpected response shape.', {
              code: 'response-validation',
              cause: parsed.error
            })
          }
          return parsed.data
        }

        if (response.status === 401) {
          this.authProvider.invalidateAccessToken()
          throw new NetSuiteIntegrationError('NetSuite authentication expired. Sign in again.', {
            code: 'authentication-required',
            status: response.status
          })
        }
        if (response.status === 403) {
          throw new NetSuiteIntegrationError(
            'The NetSuite integration role does not have permission to retrieve the required data.',
            { code: 'permission-denied', status: response.status }
          )
        }

        const retryableStatus =
          response.status === 408 || response.status === 429 || response.status >= 500
        if (retryableStatus && attempt < this.retryPolicy.maxAttempts) {
          const delayMs = this.getRetryDelayMs(response, attempt)
          this.logger.warn('Retrying a retryable NetSuite response.', {
            endpointCategory: request.endpointCategory,
            status: response.status,
            retryCount: attempt,
            delayMs
          })
          await this.waitForRetry(delayMs, request.options?.signal)
          continue
        }

        if (response.status === 429) {
          throw new NetSuiteIntegrationError('NetSuite rate limiting prevented the request.', {
            code: 'rate-limited',
            status: response.status,
            retryable: true
          })
        }
        throw new NetSuiteIntegrationError('NetSuite rejected the read-only request.', {
          code: 'api-error',
          status: response.status,
          retryable: response.status >= 500
        })
      } catch (error) {
        if (error instanceof NetSuiteIntegrationError) throw error

        if (request.options?.signal?.aborted) {
          throw new NetSuiteIntegrationError('The NetSuite request was cancelled.', {
            code: 'request-cancelled',
            cause: error
          })
        }
        if (didTimeout) {
          if (attempt < this.retryPolicy.maxAttempts) {
            const delayMs = this.getExponentialDelayMs(attempt)
            this.logger.warn('Retrying a timed-out NetSuite request.', {
              endpointCategory: request.endpointCategory,
              retryCount: attempt,
              delayMs
            })
            await this.waitForRetry(delayMs, request.options?.signal)
            continue
          }
          throw new NetSuiteIntegrationError('The NetSuite request timed out.', {
            code: 'request-timeout',
            retryable: true,
            cause: error
          })
        }

        if (attempt < this.retryPolicy.maxAttempts) {
          const delayMs = this.getExponentialDelayMs(attempt)
          this.logger.warn('Retrying a NetSuite network failure.', {
            endpointCategory: request.endpointCategory,
            retryCount: attempt,
            delayMs
          })
          await this.waitForRetry(delayMs, request.options?.signal)
          continue
        }
        throw new NetSuiteIntegrationError(
          'Unable to reach NetSuite. Check your network connection and try again.',
          { code: 'network-error', retryable: true, cause: error }
        )
      } finally {
        clearTimeout(timeout)
        request.options?.signal?.removeEventListener('abort', cancelAttempt)
      }
    }

    throw new NetSuiteIntegrationError('NetSuite request attempts were exhausted.', {
      code: 'api-error'
    })
  }

  private resolveAllowedUrl(relativePath: string): URL {
    const target = new URL(relativePath, `${this.baseUrl.origin}/`)
    if (target.origin !== this.baseUrl.origin || !target.pathname.startsWith('/services/rest/')) {
      throw new NetSuiteIntegrationError('The NetSuite request target is not allowed.', {
        code: 'invalid-query'
      })
    }
    return target
  }

  private getRetryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers.get('Retry-After')
    if (retryAfter) {
      const seconds = Number(retryAfter)
      const milliseconds = Number.isFinite(seconds)
        ? seconds * 1000
        : Math.max(0, Date.parse(retryAfter) - Date.now())
      if (Number.isFinite(milliseconds)) {
        return Math.min(this.retryPolicy.maxDelayMs, Math.max(0, milliseconds))
      }
    }
    return this.getExponentialDelayMs(attempt)
  }

  private getExponentialDelayMs(attempt: number): number {
    const exponential = this.retryPolicy.baseDelayMs * 2 ** Math.max(0, attempt - 1)
    const jitterUpperBound = Math.max(1, Math.min(251, this.retryPolicy.baseDelayMs + 1))
    const jitter = randomInt(jitterUpperBound)
    return Math.min(this.retryPolicy.maxDelayMs, exponential + jitter)
  }

  private async waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new NetSuiteIntegrationError('The NetSuite request was cancelled.', {
        code: 'request-cancelled'
      })
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', cancel)
        resolve()
      }, delayMs)
      const cancel = (): void => {
        clearTimeout(timeout)
        reject(
          new NetSuiteIntegrationError('The NetSuite request was cancelled.', {
            code: 'request-cancelled'
          })
        )
      }
      signal?.addEventListener('abort', cancel, { once: true })
    })
  }
}
