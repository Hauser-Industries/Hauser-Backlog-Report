import { describe, expect, it } from 'vitest'

import type {
  NetSuiteRestConnectionOutcome,
  NetSuiteSuiteQlOutcome,
  InspectSalesOrderOutcome,
  ResolveCustomerIdsOutcome
} from '../src/shared/types/backlog'
import type { NetSuiteAuthProvider } from '../src/main/netsuite/auth/authProvider'
import {
  NetSuiteConnectionAdapter,
  type NetSuiteCustomerIdResolutionProbe,
  type NetSuiteRestConnectionProbe,
  type NetSuiteSalesOrderInspectionProbe,
  type NetSuiteSuiteQlProbe
} from '../src/main/netsuite/connection/netSuiteConnectionAdapter'
import { PACKAGED_NETSUITE_CONFIG } from '../src/main/netsuite/config/netsuiteConfig'

class FakeAuthProvider implements NetSuiteAuthProvider {
  authenticated = false

  async getAccessToken(): Promise<string> {
    this.authenticated = true
    return 'memory-only-access-token'
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authenticated
  }

  async signIn(): Promise<void> {}

  async signOut(): Promise<void> {
    this.authenticated = false
  }

  async handleOAuthCallback(): Promise<void> {
    this.authenticated = true
  }

  invalidateAccessToken(): void {}
}

class FakeRestConnectionProbe implements NetSuiteRestConnectionProbe {
  calls = 0

  constructor(
    public outcome: NetSuiteRestConnectionOutcome = {
      ok: true,
      httpStatus: 200,
      message: 'NetSuite REST connection successful.'
    }
  ) {}

  async testConnection(): Promise<NetSuiteRestConnectionOutcome> {
    this.calls += 1
    return this.outcome
  }
}

class FakeSuiteQlProbe implements NetSuiteSuiteQlProbe {
  calls = 0

  constructor(
    public outcome: NetSuiteSuiteQlOutcome = {
      success: true,
      httpStatus: 200,
      message: 'SuiteQL connection successful.',
      count: 2,
      totalResults: 15,
      hasMore: true,
      items: [
        { id: '123', entityid: 'Customer A' },
        { id: '456', entityid: 'Customer B' }
      ]
    }
  ) {}

  async testSuiteQl(): Promise<NetSuiteSuiteQlOutcome> {
    this.calls += 1
    return this.outcome
  }
}

class FakeCustomerIdResolutionProbe implements NetSuiteCustomerIdResolutionProbe {
  calls = 0

  constructor(
    public outcome: ResolveCustomerIdsOutcome = {
      success: true,
      httpStatus: 200,
      message: 'Only 0 of 6 configured customers were resolved.',
      resolutionStatus: 'incomplete',
      configuredCustomerCount: 6,
      resolvedCustomerCount: 0,
      candidateCount: 0,
      additionalCandidateCount: 0,
      rows: []
    }
  ) {}

  async resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome> {
    this.calls += 1
    return this.outcome
  }
}

class FakeSalesOrderInspectionProbe implements NetSuiteSalesOrderInspectionProbe {
  calls = 0

  async inspectSalesOrder(salesOrderNumber: string): Promise<InspectSalesOrderOutcome> {
    this.calls += 1
    return {
      success: true,
      httpStatus: 200,
      found: false,
      message: `Sales Order ${salesOrderNumber} was not found.`,
      salesOrderNumber
    }
  }
}

describe('NetSuiteConnectionAdapter', () => {
  it('returns authentication-required with only the five public packaged values', async () => {
    const adapter = new NetSuiteConnectionAdapter(
      new FakeAuthProvider(),
      { ...PACKAGED_NETSUITE_CONFIG },
      new FakeRestConnectionProbe(),
      new FakeSuiteQlProbe(),
      new FakeCustomerIdResolutionProbe(),
      new FakeSalesOrderInspectionProbe()
    )

    const status = await adapter.getStatus()

    expect(status.indicator).toBe('authentication-required')
    expect(status.authenticated).toBe(false)
    expect(status.configuration).toEqual(PACKAGED_NETSUITE_CONFIG)
    expect(JSON.stringify(status)).not.toMatch(/accessToken|refreshToken|clientSecret/i)
  })

  it('preserves the authenticated callback state without running the REST probe', async () => {
    const authProvider = new FakeAuthProvider()
    const restProbe = new FakeRestConnectionProbe()
    const adapter = new NetSuiteConnectionAdapter(
      authProvider,
      { ...PACKAGED_NETSUITE_CONFIG },
      restProbe,
      new FakeSuiteQlProbe(),
      new FakeCustomerIdResolutionProbe(),
      new FakeSalesOrderInspectionProbe()
    )

    await adapter.handleOAuthCallback('hauser-backlog://oauth/callback?code=redacted')
    const status = await adapter.getStatus()

    expect(status).toMatchObject({
      dataSource: 'live',
      configured: true,
      authenticated: true,
      indicator: 'connected',
      accountLabel: '3850367_SB1',
      configuration: PACKAGED_NETSUITE_CONFIG
    })
    expect(status.message).toContain('Use Test Connection')
    expect(restProbe.calls).toBe(0)
  })

  it('requires an approved launch authorization before production report access is allowed', async () => {
    const authProvider = new FakeAuthProvider()
    authProvider.authenticated = true
    const adapter = new NetSuiteConnectionAdapter(
      authProvider,
      { ...PACKAGED_NETSUITE_CONFIG },
      new FakeRestConnectionProbe(),
      new FakeSuiteQlProbe(),
      new FakeCustomerIdResolutionProbe(),
      new FakeSalesOrderInspectionProbe(),
      { requireStartupAuthorization: true, requiredRoleName: 'Hauser Backlog Report API' }
    )

    await expect(() => adapter.assertReportAccessAuthorized()).toThrow('Hauser Backlog Report API')
    expect(await adapter.getStatus()).toMatchObject({
      authenticated: true,
      indicator: 'authentication-required',
      startupAuthorization: 'required'
    })

    await adapter.handleOAuthCallback('hauser-backlog://oauth/callback?code=redacted')

    expect(() => adapter.assertReportAccessAuthorized()).not.toThrow()
    expect(await adapter.getStatus()).toMatchObject({
      indicator: 'connected',
      startupAuthorization: 'approved'
    })
  })

  it('marks the connection successful only after the REST probe returns HTTP 200', async () => {
    const authProvider = new FakeAuthProvider()
    authProvider.authenticated = true
    const restProbe = new FakeRestConnectionProbe()
    const adapter = new NetSuiteConnectionAdapter(
      authProvider,
      { ...PACKAGED_NETSUITE_CONFIG },
      restProbe,
      new FakeSuiteQlProbe(),
      new FakeCustomerIdResolutionProbe(),
      new FakeSalesOrderInspectionProbe()
    )

    const outcome = await adapter.testConnection()
    const status = await adapter.getStatus()

    expect(outcome).toEqual({
      ok: true,
      httpStatus: 200,
      message: 'NetSuite REST connection successful.'
    })
    expect(restProbe.calls).toBe(1)
    expect(status).toMatchObject({
      authenticated: true,
      indicator: 'connected',
      message: 'NetSuite REST connection successful.'
    })
  })

  it('retains only a sanitized REST failure and can recover on a later test', async () => {
    const authProvider = new FakeAuthProvider()
    authProvider.authenticated = true
    const restProbe = new FakeRestConnectionProbe({
      ok: false,
      error: {
        code: 'permission',
        httpStatus: 403,
        message: 'The selected NetSuite role does not have permission.'
      }
    })
    const adapter = new NetSuiteConnectionAdapter(
      authProvider,
      { ...PACKAGED_NETSUITE_CONFIG },
      restProbe,
      new FakeSuiteQlProbe(),
      new FakeCustomerIdResolutionProbe(),
      new FakeSalesOrderInspectionProbe()
    )

    const failedOutcome = await adapter.testConnection()
    expect(failedOutcome).toMatchObject({
      ok: false,
      error: { code: 'permission', httpStatus: 403 }
    })
    expect(await adapter.getStatus()).toMatchObject({
      indicator: 'connection-error',
      message: 'HTTP 403: The selected NetSuite role does not have permission.'
    })

    restProbe.outcome = {
      ok: true,
      httpStatus: 200,
      message: 'NetSuite REST connection successful.'
    }
    await adapter.testConnection()

    expect(restProbe.calls).toBe(2)
    expect(await adapter.getStatus()).toMatchObject({
      indicator: 'connected',
      message: 'NetSuite REST connection successful.'
    })
  })

  it('runs SuiteQL independently without replacing the working REST test status', async () => {
    const authProvider = new FakeAuthProvider()
    authProvider.authenticated = true
    const restProbe = new FakeRestConnectionProbe()
    const suiteQlProbe = new FakeSuiteQlProbe()
    const adapter = new NetSuiteConnectionAdapter(
      authProvider,
      { ...PACKAGED_NETSUITE_CONFIG },
      restProbe,
      suiteQlProbe,
      new FakeCustomerIdResolutionProbe(),
      new FakeSalesOrderInspectionProbe()
    )
    await adapter.testConnection()

    const result = await adapter.testSuiteQl()

    expect(result).toEqual(suiteQlProbe.outcome)
    expect(restProbe.calls).toBe(1)
    expect(suiteQlProbe.calls).toBe(1)
    expect(await adapter.getStatus()).toMatchObject({
      indicator: 'connected',
      message: 'NetSuite REST connection successful.'
    })
  })

  it('resolves customer IDs independently without replacing either working diagnostic', async () => {
    const authProvider = new FakeAuthProvider()
    authProvider.authenticated = true
    const restProbe = new FakeRestConnectionProbe()
    const suiteQlProbe = new FakeSuiteQlProbe()
    const customerIdProbe = new FakeCustomerIdResolutionProbe()
    const adapter = new NetSuiteConnectionAdapter(
      authProvider,
      { ...PACKAGED_NETSUITE_CONFIG },
      restProbe,
      suiteQlProbe,
      customerIdProbe,
      new FakeSalesOrderInspectionProbe()
    )
    await adapter.testConnection()
    await adapter.testSuiteQl()

    const result = await adapter.resolveCustomerIds()

    expect(result).toEqual(customerIdProbe.outcome)
    expect(restProbe.calls).toBe(1)
    expect(suiteQlProbe.calls).toBe(1)
    expect(customerIdProbe.calls).toBe(1)
    expect(await adapter.getStatus()).toMatchObject({
      indicator: 'connected',
      message: 'NetSuite REST connection successful.'
    })
  })

  it('inspects a Sales Order independently through the existing connection adapter', async () => {
    const authProvider = new FakeAuthProvider()
    authProvider.authenticated = true
    const restProbe = new FakeRestConnectionProbe()
    const salesOrderProbe = new FakeSalesOrderInspectionProbe()
    const adapter = new NetSuiteConnectionAdapter(
      authProvider,
      { ...PACKAGED_NETSUITE_CONFIG },
      restProbe,
      new FakeSuiteQlProbe(),
      new FakeCustomerIdResolutionProbe(),
      salesOrderProbe
    )
    await adapter.testConnection()

    await expect(adapter.inspectSalesOrder('SO1234')).resolves.toMatchObject({
      success: true,
      found: false,
      salesOrderNumber: 'SO1234'
    })
    expect(salesOrderProbe.calls).toBe(1)
    expect(await adapter.getStatus()).toMatchObject({
      indicator: 'connected',
      message: 'NetSuite REST connection successful.'
    })
  })
})
