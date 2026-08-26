import { describe, expect, it } from 'vitest'

import {
  requiresStartupAuthorization,
  shouldBeginStartupAuthorization,
  shouldLoadBacklogAtStartup
} from '../src/shared/utils/startupMode'

describe('authentication-only live startup', () => {
  it('does not start the backlog report in live mode', () => {
    expect(shouldLoadBacklogAtStartup({ dataSource: 'live', authenticated: false })).toBe(false)
    expect(shouldLoadBacklogAtStartup({ dataSource: 'live', authenticated: true })).toBe(true)
  })

  it('still loads fixtures when mock mode is explicitly selected', () => {
    expect(shouldLoadBacklogAtStartup({ dataSource: 'mock', authenticated: false })).toBe(true)
  })

  it('requires a new production authorization even if an encrypted token exists', () => {
    const status = {
      dataSource: 'live' as const,
      authenticated: true,
      startupAuthorization: 'required' as const
    }

    expect(requiresStartupAuthorization(status)).toBe(true)
    expect(shouldBeginStartupAuthorization(status)).toBe(true)
    expect(shouldLoadBacklogAtStartup(status)).toBe(false)
  })

  it('loads the report only after the production authorization is approved', () => {
    const status = {
      dataSource: 'live' as const,
      authenticated: true,
      startupAuthorization: 'approved' as const
    }

    expect(requiresStartupAuthorization(status)).toBe(false)
    expect(shouldBeginStartupAuthorization(status)).toBe(false)
    expect(shouldLoadBacklogAtStartup(status)).toBe(true)
  })
})
