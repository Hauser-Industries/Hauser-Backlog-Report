import { describe, expect, it } from 'vitest'

import { validateOAuthAuthorizationIdentity } from '../src/main/netsuite/auth/oauthAuthorizationValidator'
import { getNetSuiteEnvironmentProfileByEnvironment } from '../src/main/netsuite/config/environmentProfiles'

describe('Production OAuth authorization validator', () => {
  const production = getNetSuiteEnvironmentProfileByEnvironment('production')

  it('accepts Production account 3850367 using the Hauser API role', () => {
    expect(() =>
      validateOAuthAuthorizationIdentity(production, {
        companyId: '3850367',
        roleId: '1990',
        entityId: '123'
      })
    ).not.toThrow()
  })

  it('rejects a callback from another NetSuite account', () => {
    expect(() =>
      validateOAuthAuthorizationIdentity(production, {
        companyId: '9999999',
        roleId: '1990',
        entityId: '123'
      })
    ).toThrow('selected NetSuite account is not authorized')
  })

  it('rejects every role other than customrole1990 before token exchange', () => {
    expect(() =>
      validateOAuthAuthorizationIdentity(production, {
        companyId: '3850367',
        roleId: '3',
        entityId: '123'
      })
    ).toThrow('Choose Hauser Backlog Report API')
  })
})
