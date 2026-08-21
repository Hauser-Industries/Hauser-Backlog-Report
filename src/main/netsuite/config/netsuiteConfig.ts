import { z } from 'zod'

import { NetSuiteConfigurationError } from '../errors'

export const NETSUITE_SCOPE = 'rest_webservices' as const

export interface NetSuiteConfig {
  accountId: string
  accountDomain: string
  clientId: string
  redirectUri: string
  scope: typeof NETSUITE_SCOPE
}

export interface NetSuiteOAuthEndpoints {
  authorizationEndpoint: string
  tokenEndpoint: string
}

export type NetSuiteConfigKey =
  'NETSUITE_ACCOUNT_ID' | 'NETSUITE_ACCOUNT_DOMAIN' | 'NETSUITE_CLIENT_ID' | 'NETSUITE_REDIRECT_URI'

export type NetSuiteConfigState =
  | { configured: true; config: NetSuiteConfig }
  | { configured: false; missing: readonly NetSuiteConfigKey[] }

const configSchema = z.object({
  accountId: z.string().trim().min(1),
  accountDomain: z.url().refine((value) => new URL(value).protocol === 'https:', {
    message: 'NetSuite account domain must use HTTPS.'
  }),
  clientId: z.string().trim().min(1),
  redirectUri: z.url(),
  scope: z.literal(NETSUITE_SCOPE)
})

function cleanEnvironmentValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim()
  return cleaned ? cleaned : undefined
}

export function loadNetSuiteConfig(
  environment: NodeJS.ProcessEnv = process.env
): NetSuiteConfigState {
  const values = {
    accountId: cleanEnvironmentValue(environment.NETSUITE_ACCOUNT_ID),
    accountDomain: cleanEnvironmentValue(environment.NETSUITE_ACCOUNT_DOMAIN),
    clientId: cleanEnvironmentValue(environment.NETSUITE_CLIENT_ID),
    redirectUri: cleanEnvironmentValue(environment.NETSUITE_REDIRECT_URI)
  }

  const missing: NetSuiteConfigKey[] = []
  if (!values.accountId) missing.push('NETSUITE_ACCOUNT_ID')
  if (!values.accountDomain) missing.push('NETSUITE_ACCOUNT_DOMAIN')
  if (!values.clientId) missing.push('NETSUITE_CLIENT_ID')
  if (!values.redirectUri) missing.push('NETSUITE_REDIRECT_URI')

  if (missing.length > 0) return { configured: false, missing }

  const result = configSchema.safeParse({ ...values, scope: NETSUITE_SCOPE })
  if (!result.success) {
    throw new NetSuiteConfigurationError(
      `NetSuite configuration is invalid: ${result.error.issues.map((issue) => issue.message).join(' ')}`
    )
  }

  return {
    configured: true,
    config: {
      ...result.data,
      accountDomain: result.data.accountDomain.replace(/\/$/, '')
    }
  }
}

export function requireNetSuiteConfig(state: NetSuiteConfigState): NetSuiteConfig {
  if (!state.configured) throw new NetSuiteConfigurationError()
  return state.config
}

export function validateOAuthEndpoints(endpoints: NetSuiteOAuthEndpoints): void {
  for (const [name, value] of Object.entries(endpoints)) {
    let endpoint: URL
    try {
      endpoint = new URL(value)
    } catch {
      throw new NetSuiteConfigurationError(`${name} is not a valid URL.`)
    }

    if (endpoint.protocol !== 'https:') {
      throw new NetSuiteConfigurationError(`${name} must use HTTPS.`)
    }
  }
}

/**
 * Derives only Oracle's documented OAuth paths from the configured account
 * domain. The account-specific host itself still comes from configuration.
 */
export function createNetSuiteOAuthEndpoints(config: NetSuiteConfig): NetSuiteOAuthEndpoints {
  const accountDomain = new URL(config.accountDomain)
  const accountHostLabel = accountDomain.hostname.split('.')[0]
  if (!accountHostLabel) {
    throw new NetSuiteConfigurationError('The NetSuite account domain has no account host label.')
  }

  return {
    authorizationEndpoint: `https://${accountHostLabel}.app.netsuite.com/app/login/oauth2/authorize.nl`,
    tokenEndpoint: new URL('/services/rest/auth/oauth2/v1/token', accountDomain.origin).toString()
  }
}
