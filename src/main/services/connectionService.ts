import type { ConnectionStatus, DataSourceMode } from '@shared/types/backlog'

export interface LiveConnectionAdapter {
  getStatus(): Promise<ConnectionStatus>
  signIn(): Promise<void>
  signOut(): Promise<void>
  testConnection(): Promise<void>
}

export interface LiveConfigurationSummary {
  configured: boolean
  accountLabel?: string
  message?: string
}

export class ConnectionService {
  constructor(
    private readonly mode: DataSourceMode,
    private readonly liveAdapter?: LiveConnectionAdapter,
    private readonly liveConfiguration: LiveConfigurationSummary = { configured: false }
  ) {}

  async getStatus(): Promise<ConnectionStatus> {
    if (this.mode === 'mock') return this.mockStatus()
    if (!this.liveAdapter) return this.pendingLiveStatus()
    return this.liveAdapter.getStatus()
  }

  async signIn(): Promise<ConnectionStatus> {
    const adapter = this.requireLiveAdapter()
    await adapter.signIn()
    return adapter.getStatus()
  }

  async signOut(): Promise<ConnectionStatus> {
    const adapter = this.requireLiveAdapter()
    await adapter.signOut()
    return adapter.getStatus()
  }

  async testConnection(): Promise<ConnectionStatus> {
    const adapter = this.requireLiveAdapter()
    await adapter.testConnection()
    return adapter.getStatus()
  }

  private requireLiveAdapter(): LiveConnectionAdapter {
    if (this.mode === 'mock') {
      throw new Error(
        'NetSuite connection controls are unavailable while Mock Data mode is active.'
      )
    }
    if (!this.liveAdapter) {
      throw new Error('NetSuite has not been configured for this installation.')
    }
    return this.liveAdapter
  }

  private mockStatus(): ConnectionStatus {
    return {
      dataSource: 'mock',
      configured: false,
      authenticated: false,
      indicator: 'mock-data',
      message: 'Demonstration data is active. No NetSuite requests are being made.'
    }
  }

  private pendingLiveStatus(): ConnectionStatus {
    if (this.liveConfiguration.configured) {
      return {
        dataSource: 'live',
        configured: true,
        authenticated: false,
        indicator: 'authentication-required',
        ...(this.liveConfiguration.accountLabel
          ? { accountLabel: this.liveConfiguration.accountLabel }
          : {}),
        message:
          this.liveConfiguration.message ??
          'Live reporting is waiting for authentication and verified field mappings.'
      }
    }

    return {
      dataSource: 'live',
      configured: false,
      authenticated: false,
      indicator: 'authentication-required',
      message:
        this.liveConfiguration.message ?? 'NetSuite has not been configured for this installation.'
    }
  }
}
