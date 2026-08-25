import { z } from 'zod'

import { NetSuiteConfigurationError } from '../errors'

export const NETSUITE_SCOPE = 'rest_webservices' as const
export const NETSUITE_REDIRECT_URI = 'hauser-backlog://oauth/callback' as const

export interface NetSuiteConfig {
  accountId: string
  suiteTalkUrl: string
  clientId: string
  redirectUri: typeof NETSUITE_REDIRECT_URI
  scope: typeof NETSUITE_SCOPE
}

/**
 * Public OAuth client metadata bundled with the desktop application.
 *
 * These values identify the NetSuite account and public client; none is a
 * credential. Access tokens and refresh tokens are deliberately excluded.
 */
export const PACKAGED_NETSUITE_CONFIG: Readonly<NetSuiteConfig> = Object.freeze({
  accountId: '3850367_SB1',
  suiteTalkUrl: 'https://3850367-sb1.suitetalk.api.netsuite.com',
  clientId: 'c5dd9741a779dbfe50d63939f326b2a3a5b119b4a5b0034d362825e7eec76ce4',
  redirectUri: NETSUITE_REDIRECT_URI,
  scope: NETSUITE_SCOPE
})

export interface NetSuiteOAuthEndpoints {
  authorizationEndpoint: string
  tokenEndpoint: string
}

export type NetSuiteConfigKey = keyof NetSuiteConfig

export type NetSuiteConfigState =
  | { configured: true; config: NetSuiteConfig }
  | { configured: false; missing: readonly NetSuiteConfigKey[] }

const suiteTalkUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'NetSuite SuiteTalk URL must use HTTPS.'
  })
  .refine(
    (value) => {
      const url = new URL(value)
      return (
        url.hostname.endsWith('.suitetalk.api.netsuite.com') &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      )
    },
    { message: 'NetSuite SuiteTalk URL must be an account-specific API origin.' }
  )

const configSchema = z
  .object({
    accountId: z
      .string()
      .trim()
      .regex(/^\d+(?:_[A-Z0-9]+)?$/, 'NetSuite Account ID is invalid.'),
    suiteTalkUrl: suiteTalkUrlSchema,
    clientId: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i, 'NetSuite public Client ID is invalid.'),
    redirectUri: z.literal(NETSUITE_REDIRECT_URI),
    scope: z.literal(NETSUITE_SCOPE)
  })
  .superRefine((value, context) => {
    const accountHost = new URL(value.suiteTalkUrl).hostname.split('.')[0]
    const expectedAccountHost = value.accountId.toLowerCase().replaceAll('_', '-')
    if (accountHost !== expectedAccountHost) {
      context.addIssue({
        code: 'custom',
        path: ['suiteTalkUrl'],
        message: 'NetSuite SuiteTalk URL does not match the configured Account ID.'
      })
    }
  })

export function loadNetSuiteConfig(
  candidate: Partial<NetSuiteConfig> = PACKAGED_NETSUITE_CONFIG
): NetSuiteConfigState {
  const requiredKeys = [
    'accountId',
    'suiteTalkUrl',
    'clientId',
    'redirectUri',
    'scope'
  ] as const satisfies readonly NetSuiteConfigKey[]
  const missing = requiredKeys.filter((key) => !candidate[key])

  if (missing.length > 0) return { configured: false, missing }

  const result = configSchema.safeParse(candidate)
  if (!result.success) {
    throw new NetSuiteConfigurationError(
      `NetSuite configuration is invalid: ${result.error.issues.map((issue) => issue.message).join(' ')}`
    )
  }

  return {
    configured: true,
    config: {
      ...result.data,
      suiteTalkUrl: result.data.suiteTalkUrl.replace(/\/$/, '')
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

/** Derives Oracle's documented OAuth paths from the bundled SuiteTalk origin. */
export function createNetSuiteOAuthEndpoints(config: NetSuiteConfig): NetSuiteOAuthEndpoints {
  const suiteTalkUrl = new URL(config.suiteTalkUrl)
  const accountHostLabel = suiteTalkUrl.hostname.split('.')[0]
  if (!accountHostLabel) {
    throw new NetSuiteConfigurationError('The NetSuite SuiteTalk URL has no account host label.')
  }

  return {
    authorizationEndpoint: `https://${accountHostLabel}.app.netsuite.com/app/login/oauth2/authorize.nl`,
    tokenEndpoint: new URL('/services/rest/auth/oauth2/v1/token', suiteTalkUrl.origin).toString()
  }
}
