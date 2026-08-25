import { z } from 'zod'

import { ALLOWED_CUSTOMERS } from '@shared/constants/customers'
import type {
  ResolveCustomerIdsOutcome,
  ResolvedCustomerDiagnosticRow
} from '@shared/types/backlog'
import type { SuiteQlClient } from '../client/suiteQlClient'
import type { DiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { netSuiteDiagnosticLogger } from '../diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../errors'
import { mapSuiteQlDiagnosticFailure } from './netSuiteSuiteQlTester'

export const CUSTOMER_ID_RESOLUTION_QUERY = `SELECT
id,
entityid,
companyname
FROM customer
WHERE
UPPER(entityid) LIKE '%HAUSER COMPANY STORES%'
OR UPPER(companyname) LIKE '%HAUSER COMPANY STORES%'
ORDER BY id`

const nullableCustomerFieldSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? null)

const candidateSchema = z.object({
  id: z.union([z.string().trim().min(1), z.number().int().nonnegative()]).transform(String),
  entityid: nullableCustomerFieldSchema,
  companyname: nullableCustomerFieldSchema
})

export interface NetSuiteCustomerIdResolverOptions {
  suiteQlClient: SuiteQlClient
  logger?: DiagnosticLogger
}

function normalizedCustomerName(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase()
  return normalized || null
}

function resolvedConfiguredCustomerCount(rows: readonly ResolvedCustomerDiagnosticRow[]): number {
  const returnedNames = new Set<string>()
  for (const row of rows) {
    const entityId = normalizedCustomerName(row.entityId)
    const companyName = normalizedCustomerName(row.companyName)
    if (entityId) returnedNames.add(entityId)
    if (companyName) returnedNames.add(companyName)
  }

  return ALLOWED_CUSTOMERS.filter((name) => returnedNames.has(name)).length
}

function resolutionMessage(resolvedCount: number, additionalCandidateCount: number): string {
  const configuredCount = ALLOWED_CUSTOMERS.length
  const resolvedMessage =
    resolvedCount === configuredCount
      ? `${configuredCount} configured customers resolved.`
      : `Only ${resolvedCount} of ${configuredCount} configured customers were resolved.`

  if (additionalCandidateCount === 0) return resolvedMessage
  const noun = additionalCandidateCount === 1 ? 'candidate was' : 'candidates were'
  return `${resolvedMessage} ${additionalCandidateCount} additional matching customer ${noun} found.`
}

/** Resolves candidate NetSuite customer IDs without changing application configuration. */
export class NetSuiteCustomerIdResolver {
  private readonly suiteQlClient: SuiteQlClient
  private readonly logger: DiagnosticLogger

  constructor(options: NetSuiteCustomerIdResolverOptions) {
    this.suiteQlClient = options.suiteQlClient
    this.logger = options.logger ?? netSuiteDiagnosticLogger
  }

  async resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome> {
    try {
      const response = await this.suiteQlClient.queryAll({
        name: 'resolve-customer-ids',
        sql: CUSTOMER_ID_RESOLUTION_QUERY
      })
      const parsedCandidates = z.array(candidateSchema).safeParse(response.items)
      if (!parsedCandidates.success) {
        throw new NetSuiteIntegrationError('NetSuite returned invalid customer resolution rows.', {
          code: 'response-validation',
          status: 200,
          cause: parsedCandidates.error
        })
      }

      const rows = parsedCandidates.data.map<ResolvedCustomerDiagnosticRow>((candidate) => ({
        internalId: candidate.id,
        entityId: candidate.entityid,
        companyName: candidate.companyname
      }))
      const configuredCustomerCount = ALLOWED_CUSTOMERS.length
      const resolvedCustomerCount = resolvedConfiguredCustomerCount(rows)
      const additionalCandidateCount = Math.max(0, rows.length - configuredCustomerCount)
      const resolutionStatus =
        additionalCandidateCount > 0
          ? ('additional-candidates' as const)
          : resolvedCustomerCount === configuredCustomerCount
            ? ('complete' as const)
            : ('incomplete' as const)

      this.logger.info('Customer ID resolution diagnostic completed.', {
        endpointCategory: 'customer-id-resolution',
        status: 200,
        configuredCustomerCount,
        resolvedCustomerCount,
        candidateCount: rows.length,
        additionalCandidateCount
      })

      return {
        success: true,
        httpStatus: 200,
        message: resolutionMessage(resolvedCustomerCount, additionalCandidateCount),
        resolutionStatus,
        configuredCustomerCount,
        resolvedCustomerCount,
        candidateCount: rows.length,
        additionalCandidateCount,
        rows
      }
    } catch (error) {
      const outcome = mapSuiteQlDiagnosticFailure(error)
      this.logger.warn('Customer ID resolution diagnostic failed.', {
        endpointCategory: 'customer-id-resolution',
        status: outcome.httpStatus,
        failureKind:
          error instanceof NetSuiteIntegrationError ? error.code : 'unexpected-resolution-failure'
      })
      return outcome
    }
  }
}
