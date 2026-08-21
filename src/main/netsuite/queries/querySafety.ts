import { normalizeSalesOrderNumber } from '@shared/utils/salesOrder'

import { NetSuiteIntegrationError } from '../errors'

const DISALLOWED_STATEMENT =
  /\b(?:ALTER|CREATE|DELETE|DROP|GRANT|INSERT|MERGE|REVOKE|TRUNCATE|UPDATE)\b/i
const COMMENT_OR_SEPARATOR = /;|--|\/\*/

export function assertReadOnlySuiteQl(query: string): void {
  const normalized = query.trim()
  if (!/^SELECT\b/i.test(normalized)) {
    throw new NetSuiteIntegrationError('Only application-controlled SELECT queries are allowed.', {
      code: 'invalid-query'
    })
  }
  if (COMMENT_OR_SEPARATOR.test(normalized) || DISALLOWED_STATEMENT.test(normalized)) {
    throw new NetSuiteIntegrationError('The SuiteQL query failed the read-only safety check.', {
      code: 'invalid-query'
    })
  }
}

export function quoteSuiteQlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function normalizeAndQuoteSalesOrder(input: string): string {
  return quoteSuiteQlString(normalizeSalesOrderNumber(input))
}

export function createSuiteQlStringList(values: readonly string[]): string {
  if (values.length === 0) {
    throw new NetSuiteIntegrationError('A SuiteQL IN list cannot be empty.', {
      code: 'invalid-query'
    })
  }
  return values.map(quoteSuiteQlString).join(', ')
}
