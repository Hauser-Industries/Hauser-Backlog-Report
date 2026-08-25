import type { NetSuiteEnvironment } from '@shared/types/backlog'
import type { NetSuiteConfig } from './netsuiteConfig'
import { NETSUITE_REDIRECT_URI, NETSUITE_SCOPE } from './netsuiteConfig'

export type { NetSuiteEnvironment } from '@shared/types/backlog'

export interface ConfiguredNetSuiteCustomer {
  internalId: string
  name: string
}

export interface NetSuiteEnvironmentProfile extends NetSuiteConfig {
  environment: NetSuiteEnvironment
  customers: readonly ConfiguredNetSuiteCustomer[]
}

const SB1_CUSTOMERS: readonly ConfiguredNetSuiteCustomer[] = Object.freeze([
  { internalId: '1432', name: 'LONDON - HAUSER COMPANY STORES' },
  { internalId: '1446', name: 'OTTAWA - HAUSER COMPANY STORES' },
  { internalId: '1578', name: 'WATERLOO - HAUSER COMPANY STORES' },
  { internalId: '5150', name: 'INTERNET - HAUSER COMPANY STORES' },
  { internalId: '5151', name: 'MAIN WAREHOUSE - HAUSER COMPANY STORES' },
  { internalId: '5152', name: 'BURLINGTON - HAUSER COMPANY STORES' }
])

const PRODUCTION_CUSTOMERS: readonly ConfiguredNetSuiteCustomer[] = Object.freeze([
  { internalId: '1432', name: 'LONDON - HAUSER COMPANY STORES' },
  { internalId: '1446', name: 'OTTAWA - HAUSER COMPANY STORES' },
  { internalId: '1578', name: 'WATERLOO - HAUSER COMPANY STORES' },
  { internalId: '5602', name: 'INTERNET - HAUSER COMPANY STORES' },
  { internalId: '5625', name: 'BURLINGTON - HAUSER COMPANY STORES' },
  { internalId: '6344', name: 'MAIN WAREHOUSE - HAUSER COMPANY STORES' }
])

export const NETSUITE_ENVIRONMENT_PROFILES: readonly NetSuiteEnvironmentProfile[] = Object.freeze([
  {
    accountId: '3850367_SB1',
    suiteTalkUrl: 'https://3850367-sb1.suitetalk.api.netsuite.com',
    clientId: 'c5dd9741a779dbfe50d63939f326b2a3a5b119b4a5b0034d362825e7eec76ce4',
    redirectUri: NETSUITE_REDIRECT_URI,
    scope: NETSUITE_SCOPE,
    environment: 'sandbox',
    customers: SB1_CUSTOMERS
  },
  {
    accountId: '3850367',
    suiteTalkUrl: 'https://3850367.suitetalk.api.netsuite.com',
    clientId: '88d0b33f1eba93684c2672ad145b17eec09deb41de3c019ea606bd805c8bd393',
    redirectUri: NETSUITE_REDIRECT_URI,
    scope: NETSUITE_SCOPE,
    environment: 'production',
    customers: PRODUCTION_CUSTOMERS
  }
])

export function getNetSuiteEnvironmentProfile(
  accountId: string
): NetSuiteEnvironmentProfile | undefined {
  const normalizedAccountId = accountId.trim().toUpperCase()
  return NETSUITE_ENVIRONMENT_PROFILES.find(
    (profile) => profile.accountId.toUpperCase() === normalizedAccountId
  )
}

export function getNetSuiteEnvironmentProfileByEnvironment(
  environment: NetSuiteEnvironment
): NetSuiteEnvironmentProfile {
  const profile = NETSUITE_ENVIRONMENT_PROFILES.find(
    (candidate) => candidate.environment === environment
  )
  if (!profile) throw new Error(`NetSuite environment profile is unavailable: ${environment}`)
  return profile
}
