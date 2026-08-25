import { describe, expect, it } from 'vitest'

import { ALLOWED_CUSTOMERS } from '../src/shared/constants/customers'
import type { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import {
  CUSTOMER_ID_RESOLUTION_QUERY,
  NetSuiteCustomerIdResolver
} from '../src/main/netsuite/connection/netSuiteCustomerIdResolver'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import { NetSuiteIntegrationError } from '../src/main/netsuite/errors'
import type { SuiteQlQueryResult, SuiteQlRecord } from '../src/main/netsuite/types/netsuiteTypes'

const ACCESS_TOKEN = 'sentinel-customer-resolution-access-token'

class FakeSuiteQlClient {
  calls: unknown[] = []
  response: SuiteQlQueryResult = {
    items: [],
    totalResults: 0,
    pages: 1
  }
  error: unknown

  async queryAll(query: unknown): Promise<SuiteQlQueryResult> {
    this.calls.push(query)
    if (this.error) throw this.error
    return this.response
  }
}

function configuredRows(): SuiteQlRecord[] {
  return ALLOWED_CUSTOMERS.map((name, index) => ({
    id: String(100 + index),
    entityid: name,
    companyname: null,
    rawResponseField: `not-returned-${index}`
  }))
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

function createResolver(
  client: FakeSuiteQlClient,
  logger?: DiagnosticLogger
): NetSuiteCustomerIdResolver {
  return new NetSuiteCustomerIdResolver({
    suiteQlClient: client as unknown as SuiteQlClient,
    ...(logger ? { logger } : {})
  })
}

describe('NetSuiteCustomerIdResolver', () => {
  it('resolves exactly six configured customers using the required query', async () => {
    const client = new FakeSuiteQlClient()
    client.response = { items: configuredRows(), totalResults: 6, pages: 1 }

    const result = await createResolver(client).resolveCustomerIds()

    expect(client.calls).toEqual([
      { name: 'resolve-customer-ids', sql: CUSTOMER_ID_RESOLUTION_QUERY }
    ])
    expect(CUSTOMER_ID_RESOLUTION_QUERY).toBe(`SELECT
id,
entityid,
companyname
FROM customer
WHERE
UPPER(entityid) LIKE '%HAUSER COMPANY STORES%'
OR UPPER(companyname) LIKE '%HAUSER COMPANY STORES%'
ORDER BY id`)
    expect(result).toMatchObject({
      success: true,
      httpStatus: 200,
      message: '6 configured customers resolved.',
      resolutionStatus: 'complete',
      configuredCustomerCount: 6,
      resolvedCustomerCount: 6,
      candidateCount: 6,
      additionalCandidateCount: 0
    })
    expect(JSON.stringify(result)).not.toContain('rawResponseField')
  })

  it('reports fewer than six resolved customers without claiming full success', async () => {
    const client = new FakeSuiteQlClient()
    client.response = { items: configuredRows().slice(0, 5), totalResults: 5, pages: 1 }

    const result = await createResolver(client).resolveCustomerIds()

    expect(result).toMatchObject({
      success: true,
      message: 'Only 5 of 6 configured customers were resolved.',
      resolutionStatus: 'incomplete',
      resolvedCustomerCount: 5,
      candidateCount: 5
    })
  })

  it('returns every row and reports additional matching candidates', async () => {
    const client = new FakeSuiteQlClient()
    client.response = {
      items: [
        ...configuredRows(),
        { id: '900', entityid: 'ARCHIVE - HAUSER COMPANY STORES', companyname: null },
        { id: '901', entityid: null, companyname: 'TEST - HAUSER COMPANY STORES' }
      ],
      totalResults: 8,
      pages: 1
    }

    const result = await createResolver(client).resolveCustomerIds()

    expect(result).toMatchObject({
      success: true,
      message:
        '6 configured customers resolved. 2 additional matching customer candidates were found.',
      resolutionStatus: 'additional-candidates',
      resolvedCustomerCount: 6,
      candidateCount: 8,
      additionalCandidateCount: 2
    })
    if (result.success) expect(result.rows).toHaveLength(8)
  })

  it('preserves a null companyname in the sanitized row contract', async () => {
    const client = new FakeSuiteQlClient()
    client.response = {
      items: [{ id: '123', entityid: ALLOWED_CUSTOMERS[0], companyname: null }],
      totalResults: 1,
      pages: 1
    }

    const result = await createResolver(client).resolveCustomerIds()

    expect(result.success && result.rows[0]).toEqual({
      internalId: '123',
      entityId: ALLOWED_CUSTOMERS[0],
      companyName: null
    })
  })

  it('preserves a null entityid and resolves by companyname', async () => {
    const client = new FakeSuiteQlClient()
    client.response = {
      items: [{ id: 456, entityid: null, companyname: ALLOWED_CUSTOMERS[1] }],
      totalResults: 1,
      pages: 1
    }

    const result = await createResolver(client).resolveCustomerIds()

    expect(result).toMatchObject({ success: true, resolvedCustomerCount: 1 })
    expect(result.success && result.rows[0]).toEqual({
      internalId: '456',
      entityId: null,
      companyName: ALLOWED_CUSTOMERS[1]
    })
  })

  it('reuses sanitized SuiteQL failure mapping without leaking credentials', async () => {
    const client = new FakeSuiteQlClient()
    client.error = new NetSuiteIntegrationError(`Bearer ${ACCESS_TOKEN}`, {
      code: 'permission-denied',
      status: 403
    })
    const { logger, output } = createCapturingLogger()

    const result = await createResolver(client, logger).resolveCustomerIds()

    expect(result).toEqual({
      success: false,
      httpStatus: 403,
      error: {
        code: 'permission',
        message:
          'The NetSuite role does not have permission to execute or access the requested SuiteQL data.'
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(output)).not.toContain(ACCESS_TOKEN)
  })

  it('rejects a malformed response without returning raw rows', async () => {
    const client = new FakeSuiteQlClient()
    client.response = {
      items: [{ entityid: ALLOWED_CUSTOMERS[0], companyname: null, secret: ACCESS_TOKEN }],
      totalResults: 1,
      pages: 1
    }

    const result = await createResolver(client).resolveCustomerIds()

    expect(result).toEqual({
      success: false,
      httpStatus: 200,
      error: {
        code: 'unexpected-response',
        message: 'NetSuite returned an unexpected response to the SuiteQL connection test.'
      }
    })
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN)
  })
})
