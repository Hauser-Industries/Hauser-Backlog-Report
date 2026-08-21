import log from 'electron-log/main'

export type OAuthCallbackConsumer = (callbackUrl: string) => Promise<void>

export class OAuthDeepLinkRouter {
  private consumer?: OAuthCallbackConsumer
  private pendingCallback: string | undefined

  setConsumer(consumer: OAuthCallbackConsumer): void {
    this.consumer = consumer
    if (this.pendingCallback) {
      const callback = this.pendingCallback
      this.pendingCallback = undefined
      void this.deliver(callback)
    }
  }

  accept(rawUrl: string): boolean {
    if (!this.isValidCallback(rawUrl)) return false

    if (!this.consumer) {
      this.pendingCallback = rawUrl
      return true
    }

    void this.deliver(rawUrl)
    return true
  }

  private async deliver(callbackUrl: string): Promise<void> {
    try {
      await this.consumer?.(callbackUrl)
    } catch (error) {
      log.error('OAuth callback processing failed', {
        errorType: error instanceof Error ? error.name : 'UnknownError'
      })
    }
  }

  private isValidCallback(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl)
      return (
        url.protocol === 'hauser-backlog:' &&
        url.hostname === 'oauth' &&
        url.pathname === '/callback'
      )
    } catch {
      return false
    }
  }
}
