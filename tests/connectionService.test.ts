import { describe, expect, it } from 'vitest'

import {
  ConnectionService,
  type LiveConnectionAdapter
} from '../src/main/services/connectionService'
import type {
  ConnectionStatus,
  InspectSalesOrderOutcome,
  NetSuiteEnvironment,
  NetSuiteRestConnectionOutcome,
  NetSuiteSuiteQlOutcome,
  ResolveCustomerIdsOutcome
} from '../src/shared/types/backlog'

class FakeLiveConnectionAdapter implements LiveConnectionAdapter {
  constructor(
    private readonly outcome: NetSuiteRestConnectionOutcome,
    private readonly status: ConnectionStatus,
    private readonly suiteQlOutcome: NetSuiteSuiteQlOutcome = {
      success: true,
      httpStatus: 200,
      message: 'SuiteQL connection successful.',
      count: 0,
      totalResults: 0,
      hasMore: false,
      items: []
    },
    private readonly customerResolutionOutcome: ResolveCustomerIdsOutcome = {
      success: true,
      httpStatus: 200,
      message: 'Only 0 of 6 configured customers were resolved.',
      resolutionStatus: 'incomplete',
      configuredCustomerCount: 6,
      resolvedCustomerCount: 0,
      candidateCount: 0,
      additionalCandidateCount: 0,
      rows: []
    },
    private readonly salesOrderInspectionOutcome: InspectSalesOrderOutcome = {
      success: true,
      httpStatus: 200,
      found: false,
      message: 'Sales Order SO1234 was not found.',
      salesOrderNumber: 'SO1234'
    }
  ) {}

  async getStatus(): Promise<ConnectionStatus> {
    return this.status
  }

  async signIn(): Promise<void> {}
  async signOut(): Promise<void> {}

  async testConnection(): Promise<NetSuiteRestConnectionOutcome> {
    return this.outcome
  }

  async testSuiteQl(): Promise<NetSuiteSuiteQlOutcome> {
    return this.suiteQlOutcome
  }

  async resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome> {
    return this.customerResolutionOutcome
  }

  async inspectSalesOrder(): Promise<InspectSalesOrderOutcome> {
    return this.salesOrderInspectionOutcome
  }

  async switchEnvironment(environment: NetSuiteEnvironment): Promise<ConnectionStatus> {
    return { ...this.status, environment }
  }
}

describe('ConnectionService REST test IPC contract', () => {
  it('returns the typed HTTP 200 result with current connection status', async () => {
    const connectionStatus: ConnectionStatus = {
      dataSource: 'live',
      configured: true,
      authenticated: true,
      indicator: 'connected',
      message: 'NetSuite REST connection successful.'
    }
    const service = new ConnectionService(
      'live',
      new FakeLiveConnectionAdapter(
        {
          ok: true,
          httpStatus: 200,
          message: 'NetSuite REST connection successful.'
        },
        connectionStatus
      )
    )

    await expect(service.testConnection()).resolves.toEqual({
      ok: true,
      httpStatus: 200,
      message: 'NetSuite REST connection successful.',
      connectionStatus
    })
  })

  it('preserves only the sanitized status failure across the typed boundary', async () => {
    const connectionStatus: ConnectionStatus = {
      dataSource: 'live',
      configured: true,
      authenticated: true,
      indicator: 'connection-error',
      message: 'The selected NetSuite role does not have permission.'
    }
    const service = new ConnectionService(
      'live',
      new FakeLiveConnectionAdapter(
        {
          ok: false,
          error: {
            code: 'permission',
            httpStatus: 403,
            message: 'The selected NetSuite role does not have permission.'
          }
        },
        connectionStatus
      )
    )

    const result = await service.testConnection()

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'permission',
        httpStatus: 403,
        message: 'The selected NetSuite role does not have permission.'
      },
      connectionStatus
    })
    expect(JSON.stringify(result)).not.toMatch(/token|authorization|responseBody/i)
  })

  it('returns a typed SuiteQL success without adding connection or credential state', async () => {
    const connectionStatus: ConnectionStatus = {
      dataSource: 'live',
      configured: true,
      authenticated: true,
      indicator: 'connected'
    }
    const suiteQlOutcome: NetSuiteSuiteQlOutcome = {
      success: true,
      httpStatus: 200,
      message: 'SuiteQL connection successful.',
      count: 2,
      totalResults: 50,
      hasMore: true,
      items: [
        { id: '123', entityid: 'Customer A' },
        { id: '456', entityid: 'Customer B' }
      ]
    }
    const service = new ConnectionService(
      'live',
      new FakeLiveConnectionAdapter(
        {
          ok: true,
          httpStatus: 200,
          message: 'NetSuite REST connection successful.'
        },
        connectionStatus,
        suiteQlOutcome
      )
    )

    const result = await service.testSuiteQl()

    expect(result).toEqual(suiteQlOutcome)
    expect(JSON.stringify(result)).not.toMatch(/accessToken|refreshToken|authorization/i)
    expect(result).not.toHaveProperty('connectionStatus')
  })

  it('preserves only the sanitized SuiteQL failure across the service boundary', async () => {
    const suiteQlOutcome: NetSuiteSuiteQlOutcome = {
      success: false,
      httpStatus: 403,
      error: {
        code: 'permission',
        message:
          'The NetSuite role does not have permission to execute or access the requested SuiteQL data.'
      }
    }
    const service = new ConnectionService(
      'live',
      new FakeLiveConnectionAdapter(
        {
          ok: true,
          httpStatus: 200,
          message: 'NetSuite REST connection successful.'
        },
        {
          dataSource: 'live',
          configured: true,
          authenticated: true,
          indicator: 'connected'
        },
        suiteQlOutcome
      )
    )

    await expect(service.testSuiteQl()).resolves.toEqual(suiteQlOutcome)
  })

  it('returns only the typed customer resolution diagnostic across the service boundary', async () => {
    const customerResolutionOutcome: ResolveCustomerIdsOutcome = {
      success: true,
      httpStatus: 200,
      message: '6 configured customers resolved.',
      resolutionStatus: 'complete',
      configuredCustomerCount: 6,
      resolvedCustomerCount: 6,
      candidateCount: 6,
      additionalCandidateCount: 0,
      rows: [{ internalId: '123', entityId: 'Customer A', companyName: null }]
    }
    const service = new ConnectionService(
      'live',
      new FakeLiveConnectionAdapter(
        {
          ok: true,
          httpStatus: 200,
          message: 'NetSuite REST connection successful.'
        },
        {
          dataSource: 'live',
          configured: true,
          authenticated: true,
          indicator: 'connected'
        },
        undefined,
        customerResolutionOutcome
      )
    )

    await expect(service.resolveCustomerIds()).resolves.toEqual(customerResolutionOutcome)
  })

  it('passes only the Sales Order number from the typed IPC request to the live adapter', async () => {
    const adapter = new FakeLiveConnectionAdapter(
      { ok: true, httpStatus: 200, message: 'NetSuite REST connection successful.' },
      {
        dataSource: 'live',
        configured: true,
        authenticated: true,
        indicator: 'connected'
      }
    )
    const service = new ConnectionService('live', adapter)

    await expect(service.inspectSalesOrder({ salesOrderNumber: 'SO1234' })).resolves.toEqual({
      success: true,
      httpStatus: 200,
      found: false,
      message: 'Sales Order SO1234 was not found.',
      salesOrderNumber: 'SO1234'
    })
  })

  it('returns the newly active environment status across the typed service boundary', async () => {
    const adapter = new FakeLiveConnectionAdapter(
      { ok: true, httpStatus: 200, message: 'NetSuite REST connection successful.' },
      {
        dataSource: 'live',
        environment: 'sandbox',
        configured: true,
        authenticated: true,
        indicator: 'connected'
      }
    )
    const service = new ConnectionService('live', adapter)

    await expect(service.switchEnvironment({ environment: 'production' })).resolves.toMatchObject({
      dataSource: 'live',
      environment: 'production',
      configured: true
    })
  })
})
