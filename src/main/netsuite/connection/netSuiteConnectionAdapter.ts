import type {
  ConnectionStatus,
  InspectSalesOrderOutcome,
  NetSuitePublicConfiguration,
  NetSuiteRestConnectionOutcome,
  NetSuiteSuiteQlOutcome,
  ResolveCustomerIdsOutcome
} from '@shared/types/backlog'
import type { NetSuiteAuthProvider } from '../auth/authProvider'
import type { NetSuiteConfig } from '../config/netsuiteConfig'

export interface NetSuiteRestConnectionProbe {
  testConnection(): Promise<NetSuiteRestConnectionOutcome>
}

export interface NetSuiteSuiteQlProbe {
  testSuiteQl(): Promise<NetSuiteSuiteQlOutcome>
}

export interface NetSuiteCustomerIdResolutionProbe {
  resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome>
}

export interface NetSuiteSalesOrderInspectionProbe {
  inspectSalesOrder(salesOrderNumber: string): Promise<InspectSalesOrderOutcome>
}

export class NetSuiteConnectionAdapter {
  private connectionVerified = false
  private connectionFailed = false
  private lastConnectionMessage: string | undefined

  private readonly configuration: NetSuitePublicConfiguration

  constructor(
    private readonly authProvider: NetSuiteAuthProvider,
    config: NetSuiteConfig,
    private readonly restConnectionProbe: NetSuiteRestConnectionProbe,
    private readonly suiteQlConnectionProbe: NetSuiteSuiteQlProbe,
    private readonly customerIdResolutionProbe: NetSuiteCustomerIdResolutionProbe,
    private readonly salesOrderInspectionProbe: NetSuiteSalesOrderInspectionProbe
  ) {
    this.configuration = {
      accountId: config.accountId,
      suiteTalkUrl: config.suiteTalkUrl,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope
    }
  }

  async getStatus(): Promise<ConnectionStatus> {
    const authenticated = await this.authProvider.isAuthenticated()

    if (this.connectionFailed) {
      return {
        dataSource: 'live',
        configured: true,
        authenticated,
        indicator: 'connection-error',
        accountLabel: this.configuration.accountId,
        configuration: this.configuration,
        message: this.lastConnectionMessage ?? 'The most recent NetSuite connection test failed.'
      }
    }

    if (!authenticated) {
      return {
        dataSource: 'live',
        configured: true,
        authenticated: false,
        indicator: 'authentication-required',
        accountLabel: this.configuration.accountId,
        configuration: this.configuration,
        message: 'Sign in to NetSuite to authenticate this installation.'
      }
    }

    return {
      dataSource: 'live',
      configured: true,
      authenticated: true,
      indicator: this.connectionVerified ? 'connected' : 'disconnected',
      accountLabel: this.configuration.accountId,
      configuration: this.configuration,
      message:
        this.lastConnectionMessage ??
        (this.connectionVerified
          ? 'NetSuite REST connection successful.'
          : 'Authentication is stored but REST Web Services has not been tested in this session.')
    }
  }

  async signIn(): Promise<void> {
    this.connectionVerified = false
    this.connectionFailed = false
    this.lastConnectionMessage = undefined
    await this.authProvider.signIn()
  }

  async signOut(): Promise<void> {
    await this.authProvider.signOut()
    this.connectionVerified = false
    this.connectionFailed = false
    this.lastConnectionMessage = undefined
  }

  async testConnection(): Promise<NetSuiteRestConnectionOutcome> {
    try {
      const outcome = await this.restConnectionProbe.testConnection()
      this.connectionVerified = outcome.ok
      this.connectionFailed = !outcome.ok
      this.lastConnectionMessage = outcome.ok
        ? outcome.message
        : outcome.error.httpStatus === null
          ? outcome.error.message
          : `HTTP ${outcome.error.httpStatus}: ${outcome.error.message}`
      return outcome
    } catch (error) {
      this.connectionVerified = false
      this.connectionFailed = true
      this.lastConnectionMessage = 'The NetSuite REST connection test could not be completed.'
      throw error
    }
  }

  async testSuiteQl(): Promise<NetSuiteSuiteQlOutcome> {
    return this.suiteQlConnectionProbe.testSuiteQl()
  }

  async resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome> {
    return this.customerIdResolutionProbe.resolveCustomerIds()
  }

  async inspectSalesOrder(salesOrderNumber: string): Promise<InspectSalesOrderOutcome> {
    return this.salesOrderInspectionProbe.inspectSalesOrder(salesOrderNumber)
  }

  async handleOAuthCallback(callbackUrl: string): Promise<void> {
    try {
      await this.authProvider.handleOAuthCallback(callbackUrl)
      this.connectionVerified = true
      this.connectionFailed = false
      this.lastConnectionMessage =
        'NetSuite authentication completed. Use Test Connection to verify REST Web Services.'
    } catch (error) {
      this.connectionVerified = false
      this.connectionFailed = true
      this.lastConnectionMessage = 'The NetSuite OAuth callback could not be completed.'
      throw error
    }
  }
}
