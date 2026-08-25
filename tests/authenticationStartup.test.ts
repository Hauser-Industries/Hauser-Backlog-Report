import { describe, expect, it } from 'vitest'

import { shouldLoadBacklogAtStartup } from '../src/shared/utils/startupMode'

describe('authentication-only live startup', () => {
  it('does not start the backlog report in live mode', () => {
    expect(shouldLoadBacklogAtStartup({ dataSource: 'live', authenticated: false })).toBe(false)
    expect(shouldLoadBacklogAtStartup({ dataSource: 'live', authenticated: true })).toBe(true)
  })

  it('still loads fixtures when mock mode is explicitly selected', () => {
    expect(shouldLoadBacklogAtStartup({ dataSource: 'mock', authenticated: false })).toBe(true)
  })
})
