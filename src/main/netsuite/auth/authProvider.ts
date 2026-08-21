export interface NetSuiteAuthProvider {
  getAccessToken(): Promise<string>
  isAuthenticated(): Promise<boolean>
  signIn(): Promise<void>
  signOut(): Promise<void>
  handleOAuthCallback(callbackUri: string): Promise<void>
  invalidateAccessToken(): void
}
