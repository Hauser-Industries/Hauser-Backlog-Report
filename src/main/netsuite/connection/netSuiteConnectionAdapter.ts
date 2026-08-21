import type { ConnectionStatus } from '@shared/types/backlog'
import type { OAuthPkceProvider } from '../auth/oauthPkceProvider'

export class NetSuiteConnectionAdapter {
  private connectionVerified = false
  private connectionFailed = false

  constructor(private readonly authProvider: OAuthPkceProvider) {}

  async getStatus(): Promise<ConnectionStatus> {
    const authenticated = await this.authProvider.isAuthenticated()

    if (!authenticated) {
      return {
        dataSource: 'live',
        configured: true,
        authenticated: false,
        indicator: 'authentication-required',
        accountLabel: 'Configured',
        message: 'Sign in to NetSuite to authenticate this installation.'
      }
    }

    if (this.connectionFailed) {
      return {
        dataSource: 'live',
        configured: true,
        authenticated: true,
        indicator: 'connection-error',
        accountLabel: 'Configured',
        message: 'The most recent NetSuite connection test failed.'
      }
    }

    return {
      dataSource: 'live',
      configured: true,
      authenticated: true,
      indicator: this.connectionVerified ? 'connected' : 'disconnected',
      accountLabel: 'Configured',
      message: this.connectionVerified
        ? 'NetSuite authentication is active. Report field mappings are still pending.'
        : 'Authentication is stored but has not been tested in this session.'
    }
  }

  async signIn(): Promise<void> {
    this.connectionVerified = false
    this.connectionFailed = false
    await this.authProvider.signIn()
  }

  async signOut(): Promise<void> {
    await this.authProvider.signOut()
    this.connectionVerified = false
    this.connectionFailed = false
  }

  async testConnection(): Promise<void> {
    try {
      await this.authProvider.getAccessToken()
      this.connectionVerified = true
      this.connectionFailed = false
    } catch (error) {
      this.connectionVerified = false
      this.connectionFailed = true
      throw error
    }
  }

  async handleOAuthCallback(callbackUrl: string): Promise<void> {
    try {
      await this.authProvider.handleOAuthCallback(callbackUrl)
      this.connectionVerified = true
      this.connectionFailed = false
    } catch (error) {
      this.connectionVerified = false
      this.connectionFailed = true
      throw error
    }
  }
}
