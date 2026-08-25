import type {
  NetSuiteRestConnectionErrorCode,
  NetSuiteRestConnectionOutcome
} from '@shared/types/backlog'
import type { NetSuiteAuthProvider } from '../auth/authProvider'
import type { NetSuiteConfig } from '../config/netsuiteConfig'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../errors'

const CUSTOMER_METADATA_CATALOG_PATH = '/services/rest/record/v1/metadata-catalog/customer'
const DEFAULT_CONNECTION_TEST_TIMEOUT_MS = 20_000
const SUCCESS_MESSAGE = 'NetSuite REST connection successful.'

export interface NetSuiteRestConnectionTesterOptions {
  config: NetSuiteConfig
  authProvider: NetSuiteAuthProvider
  fetchImplementation?: typeof fetch
  logger?: DiagnosticLogger
  timeoutMs?: number
}

function failure(
  code: NetSuiteRestConnectionErrorCode,
  httpStatus: number | null,
  message: string
): NetSuiteRestConnectionOutcome {
  return { ok: false, error: { code, httpStatus, message } }
}

function mapHttpFailure(httpStatus: number): NetSuiteRestConnectionOutcome {
  switch (httpStatus) {
    case 401:
      return failure(
        'authentication',
        httpStatus,
        'NetSuite rejected the access token. Sign in again or retry with a refreshed token.'
      )
    case 403:
      return failure(
        'permission',
        httpStatus,
        'The selected NetSuite role does not have permission to access REST Web Services metadata.'
      )
    case 404:
      return failure(
        'endpoint',
        httpStatus,
        'The NetSuite REST metadata endpoint was not found. Verify the SuiteTalk URL and REST Web Services configuration.'
      )
    case 429:
      return failure(
        'rate-limited',
        httpStatus,
        'NetSuite is limiting REST requests because of a rate or concurrency limit. Wait and try again.'
      )
    default:
      if (httpStatus >= 500 && httpStatus <= 599) {
        return failure(
          'service',
          httpStatus,
          'NetSuite REST Web Services is temporarily unavailable. Try again later.'
        )
      }
      return failure(
        'unexpected-response',
        httpStatus,
        'NetSuite returned an unexpected response to the REST connection test.'
      )
  }
}

/** Executes the narrow REST metadata connectivity probe in Electron main. */
export class NetSuiteRestConnectionTester {
  private readonly targetUrl: string
  private readonly authProvider: NetSuiteAuthProvider
  private readonly fetchImplementation: typeof fetch
  private readonly logger: DiagnosticLogger
  private readonly timeoutMs: number

  constructor(options: NetSuiteRestConnectionTesterOptions) {
    this.targetUrl = new URL(CUSTOMER_METADATA_CATALOG_PATH, options.config.suiteTalkUrl).toString()
    this.authProvider = options.authProvider
    this.fetchImplementation = options.fetchImplementation ?? fetch
    this.logger = options.logger ?? netSuiteDiagnosticLogger
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CONNECTION_TEST_TIMEOUT_MS
  }

  async testConnection(): Promise<NetSuiteRestConnectionOutcome> {
    const startedAt = Date.now()
    let accessToken: string

    try {
      accessToken = await this.authProvider.getAccessToken()
    } catch (error) {
      const isNetworkFailure =
        error instanceof NetSuiteIntegrationError &&
        (error.code === 'network-error' || error.code === 'request-timeout')
      this.logger.warn('Unable to obtain an access token for the REST connection test.', {
        endpointCategory: 'rest-connectivity-test',
        failureKind:
          error instanceof NetSuiteIntegrationError ? error.code : 'unknown-authentication-failure'
      })
      return isNetworkFailure
        ? failure(
            'network',
            null,
            'Unable to reach NetSuite while obtaining a valid access token. Try again.'
          )
        : failure(
            'authentication',
            null,
            'A valid NetSuite access token is unavailable. Sign in to NetSuite and try again.'
          )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImplementation(this.targetUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/schema+json'
        },
        redirect: 'error',
        signal: controller.signal
      })

      this.logger.info('NetSuite REST connection test completed.', {
        endpointCategory: 'rest-connectivity-test',
        status: response.status,
        durationMs: Date.now() - startedAt
      })

      try {
        await response.body?.cancel()
      } catch {
        // The response body is deliberately ignored and never crosses IPC.
      }

      if (response.status === 200) {
        return { ok: true, httpStatus: 200, message: SUCCESS_MESSAGE }
      }

      if (response.status === 401) this.authProvider.invalidateAccessToken()
      return mapHttpFailure(response.status)
    } catch {
      this.logger.warn('NetSuite REST connection test could not reach the endpoint.', {
        endpointCategory: 'rest-connectivity-test',
        failureKind: controller.signal.aborted ? 'timeout' : 'network',
        durationMs: Date.now() - startedAt
      })
      return failure(
        'network',
        null,
        controller.signal.aborted
          ? 'The NetSuite REST connection test timed out. Try again.'
          : 'Unable to reach the NetSuite REST endpoint. Check the network connection and try again.'
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}
