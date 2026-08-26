import { describe, expect, it } from 'vitest'

import {
  getNetSuiteEnvironmentProfile,
  NETSUITE_ENVIRONMENT_PROFILES
} from '../src/main/netsuite/config/environmentProfiles'

describe('NetSuite environment profiles', () => {
  it('contains only the six confirmed SB1 sandbox customers', () => {
    const profile = getNetSuiteEnvironmentProfile('3850367_sb1')

    expect(profile).toEqual({
      accountId: '3850367_SB1',
      suiteTalkUrl: 'https://3850367-sb1.suitetalk.api.netsuite.com',
      clientId: 'c5dd9741a779dbfe50d63939f326b2a3a5b119b4a5b0034d362825e7eec76ce4',
      redirectUri: 'hauser-backlog://oauth/callback',
      scope: 'rest_webservices',
      environment: 'sandbox',
      customers: [
        { internalId: '1432', name: 'LONDON - HAUSER COMPANY STORES' },
        { internalId: '1446', name: 'OTTAWA - HAUSER COMPANY STORES' },
        { internalId: '1578', name: 'WATERLOO - HAUSER COMPANY STORES' },
        { internalId: '5150', name: 'INTERNET - HAUSER COMPANY STORES' },
        { internalId: '5151', name: 'MAIN WAREHOUSE - HAUSER COMPANY STORES' },
        { internalId: '5152', name: 'BURLINGTON - HAUSER COMPANY STORES' }
      ]
    })
    expect(profile?.customers.map(({ internalId }) => internalId)).not.toContain('5149')
    expect(profile?.customers.map(({ internalId }) => internalId)).not.toContain('226')
  })

  it('defines the six independently resolved production customers and excludes candidates', () => {
    expect(NETSUITE_ENVIRONMENT_PROFILES).toHaveLength(2)
    const production = getNetSuiteEnvironmentProfile('3850367')

    expect(production).toEqual({
      accountId: '3850367',
      suiteTalkUrl: 'https://3850367.suitetalk.api.netsuite.com',
      clientId: '88d0b33f1eba93684c2672ad145b17eec09deb41de3c019ea606bd805c8bd393',
      redirectUri: 'hauser-backlog://oauth/callback',
      scope: 'rest_webservices',
      environment: 'production',
      requiredOAuthRole: {
        internalId: '1990',
        scriptId: 'customrole1990',
        name: 'Hauser Backlog Report API'
      },
      customers: [
        { internalId: '1432', name: 'LONDON - HAUSER COMPANY STORES' },
        { internalId: '1446', name: 'OTTAWA - HAUSER COMPANY STORES' },
        { internalId: '1578', name: 'WATERLOO - HAUSER COMPANY STORES' },
        { internalId: '5602', name: 'INTERNET - HAUSER COMPANY STORES' },
        { internalId: '5625', name: 'BURLINGTON - HAUSER COMPANY STORES' },
        { internalId: '6344', name: 'MAIN WAREHOUSE - HAUSER COMPANY STORES' }
      ]
    })
    expect(production?.customers.map(({ internalId }) => internalId)).not.toContain('226')
    expect(production?.customers.map(({ internalId }) => internalId)).not.toContain('5601')
    expect(production?.customers).not.toBe(getNetSuiteEnvironmentProfile('3850367_SB1')?.customers)
  })
})
