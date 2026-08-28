import { describe, expect, it } from 'vitest'

import {
  NetSuiteEnvironmentConnectionManager,
  type NetSuiteEnvironmentSession
} from '../src/main/netsuite/connection/netSuiteEnvironmentConnectionManager'
import {
  NETSUITE_ENVIRONMENT_PROFILES,
  type NetSuiteEnvironmentProfile
} from '../src/main/netsuite/config/environmentProfiles'
import type {
  ConnectionStatus,
  InspectSalesOrderOutcome,
  NetSuiteRestConnectionOutcome,
  NetSuiteSuiteQlOutcome,
  ResolveCustomerIdsOutcome
} from '../src/shared/types/backlog'

interface SessionRecord {
  profile: NetSuiteEnvironmentProfile
  clearVolatileCalls: number
  restCalls: number
  suiteQlCalls: number
  resolutionCalls: number
  callbackCalls: number
  signOutCalls: number
}

function createSessionFactory(records: SessionRecord[]) {
  return (profile: NetSuiteEnvironmentProfile): NetSuiteEnvironmentSession => {
    const record: SessionRecord = {
      profile,
      clearVolatileCalls: 0,
      restCalls: 0,
      suiteQlCalls: 0,
      resolutionCalls: 0,
      callbackCalls: 0,
      signOutCalls: 0
    }
    records.push(record)

    return {
      async getBacklog() {
        return {
          salesOrders: [],
          page: 0,
          pageSize: 50,
          totalSalesOrders: 0,
          hasPrevious: false,
          hasNext: false
        }
      },
      async getSalesOrder() {
        return {
          salesOrders: [],
          page: 0,
          pageSize: 1,
          totalSalesOrders: 0,
          hasPrevious: false,
          hasNext: false
        }
      },
      async getPurchaseOrder() {
        return {
          salesOrders: [],
          page: 0,
          pageSize: 50,
          totalSalesOrders: 0,
          hasPrevious: false,
          hasNext: false
        }
      },
      async getSalesOrderDetails() {
        return { success: true, items: [] }
      },
      async getWorkOrderBuilt(request) {
        return {
          success: true,
          values: request.workOrders.map(({ workOrderInternalId }) => ({
            workOrderInternalId,
            built: null
          }))
        }
      },
      async getWorkOrderPainted(request) {
        return {
          success: true,
          values: request.workOrders.map(({ workOrderInternalId }) => ({
            workOrderInternalId,
            painted: null
          }))
        }
      },
      invalidateDetails(): void {},
      async getStatus(): Promise<ConnectionStatus> {
        return {
          dataSource: 'live',
          configured: true,
          authenticated: false,
          indicator: 'authentication-required',
          accountLabel: profile.accountId,
          configuration: {
            accountId: profile.accountId,
            suiteTalkUrl: profile.suiteTalkUrl,
            clientId: profile.clientId,
            redirectUri: profile.redirectUri,
            scope: profile.scope
          }
        }
      },
      async signIn(): Promise<void> {},
      async signOut(): Promise<void> {
        record.signOutCalls += 1
      },
      async testConnection(): Promise<NetSuiteRestConnectionOutcome> {
        record.restCalls += 1
        return { ok: true, httpStatus: 200, message: profile.suiteTalkUrl }
      },
      async testSuiteQl(): Promise<NetSuiteSuiteQlOutcome> {
        record.suiteQlCalls += 1
        return {
          success: true,
          httpStatus: 200,
          message: profile.suiteTalkUrl,
          count: 0,
          totalResults: 0,
          hasMore: false,
          items: []
        }
      },
      async resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome> {
        record.resolutionCalls += 1
        return {
          success: true,
          httpStatus: 200,
          message: profile.accountId,
          resolutionStatus: 'incomplete',
          configuredCustomerCount: 6,
          resolvedCustomerCount: 0,
          candidateCount: 0,
          additionalCandidateCount: 0,
          rows: []
        }
      },
      async inspectSalesOrder(): Promise<InspectSalesOrderOutcome> {
        return {
          success: true,
          httpStatus: 200,
          found: false,
          message: profile.accountId,
          salesOrderNumber: 'SO1234'
        }
      },
      async handleOAuthCallback(): Promise<void> {
        record.callbackCalls += 1
      },
      clearVolatileAuthentication(): void {
        record.clearVolatileCalls += 1
      }
    }
  }
}

describe('NetSuiteEnvironmentConnectionManager', () => {
  it('switches the public status and clears the outgoing volatile authentication state', async () => {
    const records: SessionRecord[] = []
    const manager = new NetSuiteEnvironmentConnectionManager({
      profiles: NETSUITE_ENVIRONMENT_PROFILES,
      initialEnvironment: 'sandbox',
      createSession: createSessionFactory(records)
    })

    expect(await manager.getStatus()).toMatchObject({
      environment: 'sandbox',
      accountLabel: '3850367_SB1',
      configuration: {
        suiteTalkUrl: 'https://3850367-sb1.suitetalk.api.netsuite.com'
      }
    })

    expect(await manager.switchEnvironment('production')).toMatchObject({
      environment: 'production',
      accountLabel: '3850367',
      configuration: {
        suiteTalkUrl: 'https://3850367.suitetalk.api.netsuite.com',
        clientId: '88d0b33f1eba93684c2672ad145b17eec09deb41de3c019ea606bd805c8bd393'
      }
    })
    expect(records).toHaveLength(2)
    expect(records[0]?.clearVolatileCalls).toBe(1)
    expect(records[0]?.signOutCalls).toBe(0)
    expect(records[1]?.clearVolatileCalls).toBe(0)
  })

  it('routes REST, SuiteQL, customer resolution, and OAuth callbacks only to the active profile', async () => {
    const records: SessionRecord[] = []
    const manager = new NetSuiteEnvironmentConnectionManager({
      profiles: NETSUITE_ENVIRONMENT_PROFILES,
      initialEnvironment: 'sandbox',
      createSession: createSessionFactory(records)
    })

    await manager.testConnection()
    await manager.testSuiteQl()
    await manager.resolveCustomerIds()
    await manager.handleOAuthCallback('hauser-backlog://oauth/callback?code=redacted')
    await manager.switchEnvironment('production')
    const rest = await manager.testConnection()
    const suiteQl = await manager.testSuiteQl()
    const resolution = await manager.resolveCustomerIds()
    await manager.handleOAuthCallback('hauser-backlog://oauth/callback?code=redacted')

    expect(records[0]).toMatchObject({
      restCalls: 1,
      suiteQlCalls: 1,
      resolutionCalls: 1,
      callbackCalls: 1,
      clearVolatileCalls: 1
    })
    expect(records[1]).toMatchObject({
      restCalls: 1,
      suiteQlCalls: 1,
      resolutionCalls: 1,
      callbackCalls: 1
    })
    expect(rest.ok && rest.message).toBe('https://3850367.suitetalk.api.netsuite.com')
    expect(suiteQl.success && suiteQl.message).toBe('https://3850367.suitetalk.api.netsuite.com')
    expect(resolution.success && resolution.message).toBe('3850367')
  })

  it('creates a fresh session when returning to a previously used environment', async () => {
    const records: SessionRecord[] = []
    const manager = new NetSuiteEnvironmentConnectionManager({
      profiles: NETSUITE_ENVIRONMENT_PROFILES,
      initialEnvironment: 'sandbox',
      createSession: createSessionFactory(records)
    })

    await manager.switchEnvironment('production')
    await manager.switchEnvironment('sandbox')

    expect(records.map(({ profile }) => profile.environment)).toEqual([
      'sandbox',
      'production',
      'sandbox'
    ])
    expect(records[0]?.clearVolatileCalls).toBe(1)
    expect(records[1]?.clearVolatileCalls).toBe(1)
    expect(records[2]?.clearVolatileCalls).toBe(0)
  })
})
