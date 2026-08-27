import type {
  BacklogFilter,
  BacklogPageData,
  ConnectionStatus,
  InspectSalesOrderOutcome,
  NetSuiteEnvironment,
  NetSuiteRestConnectionOutcome,
  NetSuiteSuiteQlOutcome,
  ResolveCustomerIdsOutcome,
  SalesOrderDetailsResult,
  WorkOrderBuiltRequest,
  WorkOrderBuiltResult
} from '@shared/types/backlog'
import type { NetSuiteEnvironmentProfile } from '../config/environmentProfiles'

export interface NetSuiteEnvironmentSession {
  getBacklog(filter: BacklogFilter): Promise<BacklogPageData>
  getSalesOrder(salesOrderNumber: string): Promise<BacklogPageData>
  getSalesOrderDetails(salesOrderInternalId: string): Promise<SalesOrderDetailsResult>
  getWorkOrderBuilt(request: WorkOrderBuiltRequest): Promise<WorkOrderBuiltResult>
  invalidateDetails(): void
  getStatus(): Promise<ConnectionStatus>
  signIn(): Promise<void>
  signOut(): Promise<void>
  testConnection(): Promise<NetSuiteRestConnectionOutcome>
  testSuiteQl(): Promise<NetSuiteSuiteQlOutcome>
  resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome>
  inspectSalesOrder(salesOrderNumber: string): Promise<InspectSalesOrderOutcome>
  handleOAuthCallback(callbackUrl: string): Promise<void>
  clearVolatileAuthentication(): void
}

export interface NetSuiteEnvironmentConnectionManagerOptions {
  profiles: readonly NetSuiteEnvironmentProfile[]
  initialEnvironment: NetSuiteEnvironment
  createSession: (profile: NetSuiteEnvironmentProfile) => NetSuiteEnvironmentSession
}

/** Routes every OAuth and read-only diagnostic operation through one active account profile. */
export class NetSuiteEnvironmentConnectionManager {
  private readonly profiles: readonly NetSuiteEnvironmentProfile[]
  private readonly createSession: (
    profile: NetSuiteEnvironmentProfile
  ) => NetSuiteEnvironmentSession
  private activeProfile: NetSuiteEnvironmentProfile
  private activeSession: NetSuiteEnvironmentSession

  constructor(options: NetSuiteEnvironmentConnectionManagerOptions) {
    this.profiles = options.profiles
    this.createSession = options.createSession
    this.activeProfile = this.requireProfile(options.initialEnvironment)
    this.activeSession = this.createSession(this.activeProfile)
  }

  async getStatus(): Promise<ConnectionStatus> {
    return this.withActiveEnvironment(await this.activeSession.getStatus())
  }

  async getBacklog(filter: BacklogFilter): Promise<BacklogPageData> {
    return this.activeSession.getBacklog(filter)
  }

  async getSalesOrder(salesOrderNumber: string): Promise<BacklogPageData> {
    return this.activeSession.getSalesOrder(salesOrderNumber)
  }

  async getSalesOrderDetails(salesOrderInternalId: string): Promise<SalesOrderDetailsResult> {
    return this.activeSession.getSalesOrderDetails(salesOrderInternalId)
  }

  async getWorkOrderBuilt(request: WorkOrderBuiltRequest): Promise<WorkOrderBuiltResult> {
    return this.activeSession.getWorkOrderBuilt(request)
  }

  invalidateDetails(): void {
    this.activeSession.invalidateDetails()
  }

  async switchEnvironment(environment: NetSuiteEnvironment): Promise<ConnectionStatus> {
    if (environment === this.activeProfile.environment) return this.getStatus()

    const nextProfile = this.requireProfile(environment)
    const nextSession = this.createSession(nextProfile)

    this.activeSession.clearVolatileAuthentication()
    this.activeProfile = nextProfile
    this.activeSession = nextSession
    return this.getStatus()
  }

  async signIn(): Promise<void> {
    return this.activeSession.signIn()
  }

  async signOut(): Promise<void> {
    return this.activeSession.signOut()
  }

  async testConnection(): Promise<NetSuiteRestConnectionOutcome> {
    return this.activeSession.testConnection()
  }

  async testSuiteQl(): Promise<NetSuiteSuiteQlOutcome> {
    return this.activeSession.testSuiteQl()
  }

  async resolveCustomerIds(): Promise<ResolveCustomerIdsOutcome> {
    return this.activeSession.resolveCustomerIds()
  }

  async inspectSalesOrder(salesOrderNumber: string): Promise<InspectSalesOrderOutcome> {
    return this.activeSession.inspectSalesOrder(salesOrderNumber)
  }

  async handleOAuthCallback(callbackUrl: string): Promise<void> {
    return this.activeSession.handleOAuthCallback(callbackUrl)
  }

  private requireProfile(environment: NetSuiteEnvironment): NetSuiteEnvironmentProfile {
    const profile = this.profiles.find((candidate) => candidate.environment === environment)
    if (!profile) throw new Error(`NetSuite environment profile is unavailable: ${environment}`)
    return profile
  }

  private withActiveEnvironment(status: ConnectionStatus): ConnectionStatus {
    return { ...status, environment: this.activeProfile.environment }
  }
}
