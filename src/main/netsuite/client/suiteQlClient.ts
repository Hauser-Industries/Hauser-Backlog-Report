import { z } from 'zod'

import type { NetSuiteRequestOptions } from './netsuiteHttpClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import type { SuiteQlQuery, SuiteQlQueryResult, SuiteQlRecord } from '../types/netsuiteTypes'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../errors'
import { assertReadOnlySuiteQl } from '../queries/querySafety'
import type { NetSuiteHttpClient } from './netsuiteHttpClient'

const DEFAULT_PAGE_SIZE = 1_000
const MAX_PAGE_SIZE = 1_000
const MAX_PAGES = 10_000

const suiteQlPageSchema = z.object({
  count: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  items: z.array(z.record(z.string(), z.unknown())),
  offset: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative().optional()
})

export interface SuiteQlOptions extends NetSuiteRequestOptions {
  pageSize?: number
}

export class SuiteQlClient {
  private readonly httpClient: NetSuiteHttpClient
  private readonly logger: DiagnosticLogger

  constructor(httpClient: NetSuiteHttpClient, logger: DiagnosticLogger = netSuiteDiagnosticLogger) {
    this.httpClient = httpClient
    this.logger = logger
  }

  async queryAll(query: SuiteQlQuery, options?: SuiteQlOptions): Promise<SuiteQlQueryResult> {
    assertReadOnlySuiteQl(query.sql)
    const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new NetSuiteIntegrationError(
        `SuiteQL page size must be between 1 and ${MAX_PAGE_SIZE}.`,
        {
          code: 'invalid-query'
        }
      )
    }

    const items: SuiteQlRecord[] = []
    let offset = 0
    let pages = 0
    let reportedTotal: number | undefined

    while (pages < MAX_PAGES) {
      const requestOptions = this.toRequestOptions(options)
      const page = await this.httpClient.postSuiteQl(
        query.sql,
        pageSize,
        offset,
        suiteQlPageSchema,
        requestOptions
      )
      pages += 1
      items.push(...page.items)
      if (page.totalResults !== undefined) reportedTotal = page.totalResults

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

      const nextOffset = page.offset + page.count
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
