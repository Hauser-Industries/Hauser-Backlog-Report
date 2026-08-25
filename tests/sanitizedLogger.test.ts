import { describe, expect, it } from 'vitest'

import { redactSensitiveText } from '../src/main/netsuite/diagnostics/sanitizedLogger'

describe('NetSuite log redaction', () => {
  it('removes bearer tokens and OAuth callback secrets from diagnostic text', () => {
    const redacted = redactSensitiveText(
      'Authorization: Bearer access-secret hauser-backlog://oauth/callback?code=auth-code&state=oauth-state code_verifier=pkce-secret refresh_token=refresh-secret'
    )

    expect(redacted).not.toContain('access-secret')
    expect(redacted).not.toContain('auth-code')
    expect(redacted).not.toContain('oauth-state')
    expect(redacted).not.toContain('pkce-secret')
    expect(redacted).not.toContain('refresh-secret')
    expect(redacted.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(5)
  })
})
