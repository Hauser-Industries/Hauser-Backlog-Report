import { z } from 'zod'

import type { NetSuiteRequestOptions } from './netsuiteHttpClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import type {
  SuiteQLResponse,
  SuiteQlQuery,
  SuiteQlQueryResult,
  SuiteQlRecord
} from '../types/netsuiteTypes'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../errors'
import { assertReadOnlySuiteQl } from '../queries/querySafety'
import type { NetSuiteHttpClient } from './netsuiteHttpClient'

const DEFAULT_PAGE_SIZE = 1_000
const MAX_PAGE_SIZE = 1_000
const MAX_PAGES = 10_000

export interface SuiteQlOptions extends NetSuiteRequestOptions {
  pageSize?: number
  params?: readonly unknown[]
}

export interface ExecuteSuiteQLOptions extends NetSuiteRequestOptions {
  limit?: number
  offset?: number
  params?: readonly unknown[]
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new NetSuiteIntegrationError(`SuiteQL limit must be between 1 and ${MAX_PAGE_SIZE}.`, {
      code: 'invalid-query'
    })
  }
}

function validateOffset(offset: number, limit: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset % limit !== 0) {
    throw new NetSuiteIntegrationError(
      'SuiteQL offset must be a non-negative integer divisible by the limit.',
      { code: 'invalid-query' }
    )
  }
}

function createSuiteQlPageSchema(limit: number, expectedOffset: number) {
  return z
    .object({
      count: z.number().int().nonnegative(),
      hasMore: z.boolean(),
      items: z.array(z.record(z.string(), z.unknown())).max(limit),
      offset: z.number().int().nonnegative(),
      totalResults: z.number().int().nonnegative()
    })
    .superRefine((page, context) => {
      if (page.count !== page.items.length) {
        context.addIssue({
          code: 'custom',
          path: ['count'],
          message: 'SuiteQL count does not match the returned item count.'
        })
      }
      if (page.offset !== expectedOffset) {
        context.addIssue({
          code: 'custom',
          path: ['offset'],
          message: 'SuiteQL response offset does not match the requested offset.'
        })
      }
    })
}

export class SuiteQlClient {
  private readonly httpClient: NetSuiteHttpClient
  private readonly logger: DiagnosticLogger

  constructor(httpClient: NetSuiteHttpClient, logger: DiagnosticLogger = netSuiteDiagnosticLogger) {
    this.httpClient = httpClient
    this.logger = logger
  }

  async executeSuiteQL<T = SuiteQlRecord>(
    query: string,
    options?: ExecuteSuiteQLOptions
  ): Promise<SuiteQLResponse<T>> {
    assertReadOnlySuiteQl(query)
    const limit = options?.limit ?? DEFAULT_PAGE_SIZE
    const offset = options?.offset ?? 0
    validateLimit(limit)
    validateOffset(offset, limit)

    const page = await this.httpClient.postSuiteQl(
      query,
      limit,
      offset,
      createSuiteQlPageSchema(limit, offset),
      this.toRequestOptions(options),
      options?.params
    )

    return {
      ...page,
      items: page.items as T[]
    }
  }

  async queryAll(query: SuiteQlQuery, options?: SuiteQlOptions): Promise<SuiteQlQueryResult> {
    assertReadOnlySuiteQl(query.sql)
    const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE
    validateLimit(pageSize)

    const items: SuiteQlRecord[] = []
    let offset = 0
    let pages = 0
    let reportedTotal: number | undefined

    while (pages < MAX_PAGES) {
      const page = await this.executeSuiteQL<SuiteQlRecord>(query.sql, {
        limit: pageSize,
        offset,
        ...this.toRequestOptions(options),
        ...(options?.params !== undefined ? { params: options.params } : {})
      })
      pages += 1
      items.push(...page.items)
      reportedTotal = page.totalResults

      this.logger.debug('SuiteQL page validated.', {
        queryName: query.name,
        page: pages,
        offset: page.offset,
        recordCount: page.items.length,
        hasMore: page.hasMore
      })

      if (!page.hasMore) {
        return {
          items,
          totalResults: reportedTotal ?? items.length,
          pages
        }
      }
      if (page.items.length === 0) {
        throw new NetSuiteIntegrationError(
          'NetSuite indicated more SuiteQL results but returned an empty page.',
          { code: 'response-validation' }
        )
      }

      const nextOffset = page.offset + pageSize
      if (nextOffset <= offset) {
        throw new NetSuiteIntegrationError('SuiteQL pagination did not advance its offset.', {
          code: 'response-validation'
        })
      }
      offset = nextOffset
    }

    throw new NetSuiteIntegrationError('SuiteQL pagination exceeded its safety limit.', {
      code: 'response-validation'
    })
  }

  private toRequestOptions(options?: SuiteQlOptions): NetSuiteRequestOptions | undefined {
    if (!options) return undefined
    return {
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {})
    }
  }
}
