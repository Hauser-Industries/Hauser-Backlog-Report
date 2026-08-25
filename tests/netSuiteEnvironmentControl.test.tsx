import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { NetSuiteEnvironmentControl } from '../src/renderer/src/features/connection/NetSuiteEnvironmentControl'

describe('NetSuiteEnvironmentControl', () => {
  it('renders an obvious sandbox indicator', () => {
    const markup = renderToStaticMarkup(
      <NetSuiteEnvironmentControl
        environment="sandbox"
        controlId="sandbox-environment"
        busy={false}
        disabled={false}
        onChange={() => undefined}
      />
    )

    expect(markup).toContain('Active environment')
    expect(markup).toContain('netsuite-environment-badge--sandbox')
    expect(markup).toContain('SANDBOX')
    expect(markup).toContain('isolated from production')
  })

  it('renders a prominent production warning and selector', () => {
    const markup = renderToStaticMarkup(
      <NetSuiteEnvironmentControl
        environment="production"
        controlId="production-environment"
        busy={false}
        disabled={false}
        onChange={() => undefined}
      />
    )

    expect(markup).toContain('netsuite-environment-control--production')
    expect(markup).toContain('netsuite-environment-badge--production')
    expect(markup.match(/PRODUCTION/g)?.length).toBeGreaterThanOrEqual(2)
    expect(markup).toContain('live company data')
    expect(markup).toContain('Diagnostics are read-only')
    expect(markup).toContain('<option value="sandbox">SANDBOX</option>')
    expect(markup).toContain('<option value="production" selected="">PRODUCTION</option>')
  })
})
