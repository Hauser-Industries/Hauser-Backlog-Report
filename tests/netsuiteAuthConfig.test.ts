import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createPkceValues, oauthStateMatches } from '../src/main/netsuite/auth/pkce'
import {
  createNetSuiteOAuthEndpoints,
  loadNetSuiteConfig,
  NETSUITE_SCOPE,
  PACKAGED_NETSUITE_CONFIG
} from '../src/main/netsuite/config/netsuiteConfig'
import { getDataSourceMode } from '../src/main/config/dataSourceMode'
import { getNetSuiteEnvironmentProfile } from '../src/main/netsuite/config/environmentProfiles'

describe('NetSuite OAuth configuration', () => {
  it('reports every required value when configuration is absent', () => {
    const state = loadNetSuiteConfig({})

    expect(state).toEqual({
      configured: false,
      missing: ['accountId', 'suiteTalkUrl', 'clientId', 'redirectUri', 'scope']
    })
  })

  it('loads the exact public configuration bundled with the application', () => {
    expect(loadNetSuiteConfig()).toEqual({
      configured: true,
      config: {
        accountId: '3850367_SB1',
        suiteTalkUrl: 'https://3850367-sb1.suitetalk.api.netsuite.com',
        clientId: 'c5dd9741a779dbfe50d63939f326b2a3a5b119b4a5b0034d362825e7eec76ce4',
        redirectUri: 'hauser-backlog://oauth/callback',
        scope: NETSUITE_SCOPE
      }
    })
  })

  it('derives documented OAuth paths from the packaged SuiteTalk URL', () => {
    const endpoints = createNetSuiteOAuthEndpoints(PACKAGED_NETSUITE_CONFIG)

    expect(endpoints).toEqual({
      authorizationEndpoint: 'https://3850367-sb1.app.netsuite.com/app/login/oauth2/authorize.nl',
      tokenEndpoint:
        'https://3850367-sb1.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token'
    })
  })

  it('derives production OAuth paths from the independent production profile', () => {
    const production = getNetSuiteEnvironmentProfile('3850367')
    if (!production) throw new Error('Expected the production profile.')

    expect(createNetSuiteOAuthEndpoints(production)).toEqual({
      authorizationEndpoint: 'https://3850367.app.netsuite.com/app/login/oauth2/authorize.nl',
      tokenEndpoint: 'https://3850367.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token'
    })
    expect(production).not.toHaveProperty('clientSecret')
  })

  it('defaults packaged builds to live and makes mock mode an explicit override', () => {
    expect(getDataSourceMode({})).toBe('live')
    expect(getDataSourceMode({ DATA_SOURCE: 'mock' })).toBe('mock')
    expect(getDataSourceMode({ DATA_SOURCE: 'live' })).toBe('live')
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
