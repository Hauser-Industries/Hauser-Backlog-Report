import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createPkceValues, oauthStateMatches } from '../src/main/netsuite/auth/pkce'
import {
  createNetSuiteOAuthEndpoints,
  loadNetSuiteConfig,
  NETSUITE_SCOPE
} from '../src/main/netsuite/config/netsuiteConfig'

describe('NetSuite OAuth configuration', () => {
  it('reports every required value when configuration is absent', () => {
    const state = loadNetSuiteConfig({})

    expect(state).toEqual({
      configured: false,
      missing: [
        'NETSUITE_ACCOUNT_ID',
        'NETSUITE_ACCOUNT_DOMAIN',
        'NETSUITE_CLIENT_ID',
        'NETSUITE_REDIRECT_URI'
      ]
    })
  })

  it('derives documented OAuth paths from the configured account domain', () => {
    const endpoints = createNetSuiteOAuthEndpoints({
      accountId: '1234567_SB1',
      accountDomain: 'https://1234567-sb1.suitetalk.api.netsuite.com',
      clientId: 'public-client-id',
      redirectUri: 'hauser-backlog://oauth/callback',
      scope: NETSUITE_SCOPE
    })

    expect(endpoints).toEqual({
      authorizationEndpoint: 'https://1234567-sb1.app.netsuite.com/app/login/oauth2/authorize.nl',
      tokenEndpoint:
        'https://1234567-sb1.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token'
    })
  })
})

describe('PKCE generation', () => {
  it('creates an S256 challenge and cryptographically distinct state', () => {
    const first = createPkceValues()
    const second = createPkceValues()
    const expectedChallenge = createHash('sha256')
      .update(first.codeVerifier, 'ascii')
      .digest('base64url')

    expect(first.codeChallenge).toBe(expectedChallenge)
    expect(first.codeVerifier.length).toBeGreaterThanOrEqual(43)
    expect(first.state).not.toBe(second.state)
    expect(oauthStateMatches(first.state, first.state)).toBe(true)
    expect(oauthStateMatches(first.state, second.state)).toBe(false)
  })
})
