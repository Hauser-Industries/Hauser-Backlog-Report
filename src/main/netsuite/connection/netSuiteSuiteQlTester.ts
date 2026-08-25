import { z } from 'zod'

import type {
  NetSuiteSuiteQlOutcome,
  SuiteQlDiagnosticErrorCode,
  SuiteQlDevelopmentDiagnostics
} from '@shared/types/backlog'
import type { SuiteQlClient } from '../client/suiteQlClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger, sanitizeDiagnosticText } from '../diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../errors'

const CUSTOMER_DIAGNOSTIC_QUERY = 'SELECT id, entityid FROM customer ORDER BY id'
const DIAGNOSTIC_LIMIT = 5
const DIAGNOSTIC_OFFSET = 0
const SUCCESS_MESSAGE = 'SuiteQL connection successful.'

const customerSchema = z.object({
  id: z.union([z.string().trim().min(1), z.number().int().nonnegative()]).transform(String),
  entityid: z.string().trim().min(1)
})

export interface NetSuiteSuiteQlTesterOptions {
  suiteQlClient: SuiteQlClient
  logger?: DiagnosticLogger
}

function failure(
  code: SuiteQlDiagnosticErrorCode,
  httpStatus: number | null,
  message: string,
  diagnostics?: SuiteQlDevelopmentDiagnostics
): Extract<NetSuiteSuiteQlOutcome, { success: false }> {
  return {
    success: false,
    httpStatus,
    error: {
      code,
      message,
      ...(diagnostics && Object.keys(diagnostics).length > 0 ? { diagnostics } : {})
    }
  }
}

function sanitizeDiagnostic(value: string | undefined, maximumLength: number): string | undefined {
  if (!value) return undefined
  const sanitized = sanitizeDiagnosticText(value, maximumLength)
  return sanitized || undefined
}

function diagnosticsFrom(error: NetSuiteIntegrationError): SuiteQlDevelopmentDiagnostics {
  const netSuiteCode = sanitizeDiagnostic(error.netSuiteErrorCode, 100)
  const netSuiteMessage = sanitizeDiagnostic(error.netSuiteErrorMessage, 500)
  return {
    ...(netSuiteCode ? { netSuiteCode } : {}),
    ...(netSuiteMessage ? { netSuiteMessage } : {})
  }
}

export function mapSuiteQlDiagnosticFailure(
  error: unknown
): Extract<NetSuiteSuiteQlOutcome, { success: false }> {
  if (!(error instanceof NetSuiteIntegrationError)) {
    return failure(
      'unexpected-response',
      null,
      'The SuiteQL connection test could not be completed.'
    )
  }

  const httpStatus = error.status ?? null
  if (
    httpStatus === 401 ||
    error.code === 'authentication-required' ||
    error.code === 'authentication-failed'
  ) {
    return failure(
      'authentication',
      httpStatus,
      'SuiteQL authentication failed. Sign in to NetSuite again.'
    )
  }
  if (httpStatus === 403 || error.code === 'permission-denied') {
    return failure(
      'permission',
      httpStatus,
      'The NetSuite role does not have permission to execute or access the requested SuiteQL data.'
    )
  }
  if (httpStatus === 400) {
    return failure(
      'bad-request',
      httpStatus,
      'The SuiteQL request was rejected by NetSuite.',
      diagnosticsFrom(error)
    )
  }
  if (httpStatus === 429 || error.code === 'rate-limited') {
    return failure('rate-limited', httpStatus, 'NetSuite rate/concurrency limit reached.')
  }
  if (httpStatus !== null && httpStatus >= 500 && httpStatus <= 599) {
    return failure(
      'service',
      httpStatus,
      'NetSuite returned a service error.',
      diagnosticsFrom(error)
    )
  }
  if (
    error.code === 'network-error' ||
    error.code === 'request-timeout' ||
    error.code === 'request-cancelled'
  ) {
    return failure(
      'network',
      httpStatus,
      'Unable to reach NetSuite for the SuiteQL connection test.'
    )
  }

  return failure(
    'unexpected-response',
    httpStatus,
    'NetSuite returned an unexpected response to the SuiteQL connection test.'
  )
}

/** Executes the narrow customer SuiteQL diagnostic through the shared main-process client. */
export class NetSuiteSuiteQlTester {
  private readonly suiteQlClient: SuiteQlClient
  private readonly logger: DiagnosticLogger

  constructor(options: NetSuiteSuiteQlTesterOptions) {
    this.suiteQlClient = options.suiteQlClient
    this.logger = options.logger ?? netSuiteDiagnosticLogger
  }

  async testSuiteQl(): Promise<NetSuiteSuiteQlOutcome> {
    try {
      const response = await this.suiteQlClient.executeSuiteQL(CUSTOMER_DIAGNOSTIC_QUERY, {
        limit: DIAGNOSTIC_LIMIT,
        offset: DIAGNOSTIC_OFFSET
      })
      const parsedItems = z.array(customerSchema).max(DIAGNOSTIC_LIMIT).safeParse(response.items)
      if (!parsedItems.success) {
        throw new NetSuiteIntegrationError('NetSuite returned invalid SuiteQL customer rows.', {
          code: 'response-validation',
          status: 200,
          cause: parsedItems.error
        })
      }

      this.logger.info('SuiteQL connection test completed.', {
        endpointCategory: 'suiteql-connectivity-test',
        status: 200,
        count: response.count,
        totalResults: response.totalResults,
        hasMore: response.hasMore
      })

      return {
        success: true,
        httpStatus: 200,
        message: SUCCESS_MESSAGE,
        count: response.count,
        totalResults: response.totalResults,
        hasMore: response.hasMore,
        items: parsedItems.data
      }
    } catch (error) {
      const outcome = mapSuiteQlDiagnosticFailure(error)
      const diagnostics = outcome.error.diagnostics
      this.logger.warn('SuiteQL connection test failed.', {
        endpointCategory: 'suiteql-connectivity-test',
        status: outcome.httpStatus,
        failureKind:
          error instanceof NetSuiteIntegrationError ? error.code : 'unexpected-test-failure',
        ...(diagnostics?.netSuiteCode ? { netSuiteErrorCode: diagnostics.netSuiteCode } : {}),
        ...(diagnostics?.netSuiteMessage
          ? { netSuiteErrorMessage: diagnostics.netSuiteMessage }
          : {})
      })
      return outcome
    }
  }
}
