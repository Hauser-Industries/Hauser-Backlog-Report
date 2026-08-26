import { NetSuiteIntegrationError } from '../errors'
import type { NetSuiteEnvironmentProfile } from '../config/environmentProfiles'
import type { OAuthAuthorizationIdentity } from './oauthPkceProvider'

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toUpperCase()
}

/** Validates NetSuite-owned callback identifiers before any OAuth token is accepted. */
export function validateOAuthAuthorizationIdentity(
  profile: NetSuiteEnvironmentProfile,
  identity: OAuthAuthorizationIdentity
): void {
  if (normalizeAccountId(identity.companyId) !== normalizeAccountId(profile.accountId)) {
    throw new NetSuiteIntegrationError(
      'The selected NetSuite account is not authorized for this application.',
      { code: 'authentication-failed' }
    )
  }

  const requiredRole = profile.requiredOAuthRole
  if (requiredRole && identity.roleId !== requiredRole.internalId) {
    throw new NetSuiteIntegrationError(
      `The selected NetSuite role is not authorized. Choose ${requiredRole.name}.`,
      { code: 'permission-denied' }
    )
  }
}
