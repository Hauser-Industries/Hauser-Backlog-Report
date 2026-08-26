import type {
  ConnectionStatus,
  InspectSalesOrderOutcome,
  NetSuitePublicConfiguration,
  NetSuiteRestConnectionOutcome,
  NetSuiteSuiteQlOutcome,
  ResolveCustomerIdsOutcome,
  StartupAuthorizationState
} from '@shared/types/backlog'
import type { NetSuiteAuthProvider } from '../auth/authProvider'
import type { NetSuiteConfig } from '../config/netsuiteConfig'
import { NetSuiteAuthenticationRequiredError } from '../errors'

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

export interface NetSuiteConnectionAdapterOptions {
  requireStartupAuthorization?: boolean
  requiredRoleName?: string
}

export class NetSuiteConnectionAdapter {
  private connectionVerified = false
  private connectionFailed = false
  private lastConnectionMessage: string | undefined
  private startupAuthorization: StartupAuthorizationState

  private readonly requireStartupAuthorization: boolean
  private readonly requiredRoleName: string

  private readonly configuration: NetSuitePublicConfiguration

  constructor(
    private readonly authProvider: NetSuiteAuthProvider,
    config: NetSuiteConfig,
    private readonly restConnectionProbe: NetSuiteRestConnectionProbe,
    private readonly suiteQlConnectionProbe: NetSuiteSuiteQlProbe,
    private readonly customerIdResolutionProbe: NetSuiteCustomerIdResolutionProbe,
    private readonly salesOrderInspectionProbe: NetSuiteSalesOrderInspectionProbe,
    options: NetSuiteConnectionAdapterOptions = {}
  ) {
    this.requireStartupAuthorization = options.requireStartupAuthorization ?? false
    this.requiredRoleName = options.requiredRoleName ?? 'Hauser Backlog Report API'
    this.startupAuthorization = this.requireStartupAuthorization ? 'required' : 'not-required'
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

    if (this.requireStartupAuthorization && this.startupAuthorization !== 'approved') {
      return {
        dataSource: 'live',
        configured: true,
        authenticated,
        indicator: 'authentication-required',
        startupAuthorization: this.startupAuthorization,
        accountLabel: this.configuration.accountId,
        configuration: this.configuration,
        message: this.startupAuthorizationMessage()
      }
    }

    if (this.connectionFailed) {
      return {
        dataSource: 'live',
        configured: true,
        authenticated,
        indicator: 'connection-error',
        startupAuthorization: this.startupAuthorization,
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
        startupAuthorization: this.startupAuthorization,
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
      startupAuthorization: this.startupAuthorization,
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
    if (this.requireStartupAuthorization) this.startupAuthorization = 'pending'
    try {
      await this.authProvider.signIn()
    } catch (error) {
      if (this.requireStartupAuthorization) this.startupAuthorization = 'failed'
      this.lastConnectionMessage =
        error instanceof Error ? error.message : 'Unable to open the NetSuite sign-in page.'
      throw error
    }
  }

  async signOut(): Promise<void> {
    await this.authProvider.signOut()
    this.connectionVerified = false
    this.connectionFailed = false
    this.lastConnectionMessage = undefined
    this.startupAuthorization = this.requireStartupAuthorization ? 'required' : 'not-required'
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
      this.startupAuthorization = this.requireStartupAuthorization ? 'approved' : 'not-required'
      this.connectionVerified = true
      this.connectionFailed = false
      this.lastConnectionMessage =
        'NetSuite authentication completed. Use Test Connection to verify REST Web Services.'
    } catch (error) {
      if (this.requireStartupAuthorization) {
        this.startupAuthorization = this.callbackWasDenied(callbackUrl) ? 'denied' : 'failed'
      }
      this.connectionVerified = false
      this.connectionFailed = !this.requireStartupAuthorization
      this.lastConnectionMessage =
        error instanceof Error
          ? error.message
          : 'The NetSuite OAuth callback could not be completed.'
      throw error
    }
  }

  assertReportAccessAuthorized(): void {
    if (this.requireStartupAuthorization && this.startupAuthorization !== 'approved') {
      throw new NetSuiteAuthenticationRequiredError(
        `Authorize this launch with the ${this.requiredRoleName} role before opening the report.`
      )
    }
  }

  private startupAuthorizationMessage(): string {
    switch (this.startupAuthorization) {
      case 'pending':
        return `Complete NetSuite sign-in in your browser and choose ${this.requiredRoleName}.`
      case 'denied':
        return 'NetSuite authorization was denied. The report remains locked until you approve access.'
      case 'failed':
        return this.lastConnectionMessage ?? 'NetSuite authorization could not be completed.'
      case 'required':
        return `Authorize this launch with the ${this.requiredRoleName} role to open the report.`
      case 'approved':
      case 'not-required':
        return this.lastConnectionMessage ?? 'NetSuite authentication is ready.'
    }
  }

  private callbackWasDenied(callbackUrl: string): boolean {
    try {
      return new URL(callbackUrl).searchParams.get('error') === 'access_denied'
    } catch {
      return false
    }
  }
}
