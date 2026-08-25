import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SuiteQlDiagnostic } from '../src/renderer/src/features/connection/SuiteQlDiagnostic'
import type { SuiteQlTestResult } from '../src/shared/types/backlog'

describe('SuiteQlDiagnostic', () => {
  it('renders the successful summary and five sanitized customer records', () => {
    const result: SuiteQlTestResult = {
      success: true,
      httpStatus: 200,
      message: 'SuiteQL connection successful.',
      count: 5,
      totalResults: 1024,
      hasMore: true,
      items: [
        { id: '123', entityid: 'Customer A' },
        { id: '456', entityid: 'Customer B' },
        { id: '789', entityid: 'Customer C' },
        { id: '1001', entityid: 'Customer D' },
        { id: '1002', entityid: 'Customer <E>' }
      ]
    }

    const markup = renderToStaticMarkup(<SuiteQlDiagnostic result={result} />)

    expect(markup).toContain('SuiteQL connection successful.')
    expect(markup).toContain('<dt>Returned</dt><dd>5 rows</dd>')
    expect(markup).toContain('<dt>Total customer records accessible</dt><dd>1024</dd>')
    expect(markup).toContain('<dt>More records available</dt><dd>Yes</dd>')
    expect(markup).toContain('<th scope="col">Internal ID</th>')
    expect(markup).toContain('<th scope="col">Customer</th>')
    for (const customer of result.items.slice(0, 4)) {
      expect(markup).toContain(customer.id)
      expect(markup).toContain(customer.entityid)
    }
    expect(markup).toContain('Customer &lt;E&gt;')
    expect(markup).not.toContain('<script')
    expect(markup).not.toMatch(/accessToken|refreshToken|authorization/i)
  })

  it('renders a sanitized HTTP 400 message and bounded development diagnostics', () => {
    const result: SuiteQlTestResult = {
      success: false,
      httpStatus: 400,
      error: {
        code: 'bad-request',
        message: 'The SuiteQL request was rejected by NetSuite.',
        diagnostics: {
          netSuiteCode: 'INVALID_QUERY',
          netSuiteMessage: 'Unknown field. [REDACTED]'
        }
      }
    }

    const markup = renderToStaticMarkup(<SuiteQlDiagnostic result={result} />)

    expect(markup).toContain('SuiteQL diagnostic')
    expect(markup).toContain('The SuiteQL request was rejected by NetSuite.')
    expect(markup).toContain('<dt>HTTP status</dt><dd>400</dd>')
    expect(markup).toContain('Development diagnostics')
    expect(markup).toContain('INVALID_QUERY')
    expect(markup).toContain('Unknown field. [REDACTED]')
    expect(markup).not.toMatch(/authorization/i)
    expect(markup).not.toContain('sentinel-access-token')
  })

  it('renders nothing before a SuiteQL diagnostic has been run', () => {
    expect(renderToStaticMarkup(<SuiteQlDiagnostic result={null} />)).toBe('')
  })
})
