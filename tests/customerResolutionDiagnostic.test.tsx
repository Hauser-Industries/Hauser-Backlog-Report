import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CustomerResolutionDiagnostic } from '../src/renderer/src/features/connection/CustomerResolutionDiagnostic'
import type { ResolveCustomerIdsResult } from '../src/shared/types/backlog'

describe('CustomerResolutionDiagnostic', () => {
  it('renders the exact-six summary and only the three approved row fields', () => {
    const result: ResolveCustomerIdsResult = {
      success: true,
      httpStatus: 200,
      message: '6 configured customers resolved.',
      resolutionStatus: 'complete',
      configuredCustomerCount: 6,
      resolvedCustomerCount: 6,
      candidateCount: 6,
      additionalCandidateCount: 0,
      rows: [
        {
          internalId: '123',
          entityId: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
          companyName: null
        }
      ]
    }

    const markup = renderToStaticMarkup(<CustomerResolutionDiagnostic result={result} />)

    expect(markup).toContain('6 configured customers resolved.')
    expect(markup).toContain('<th scope="col">Internal ID</th>')
    expect(markup).toContain('<th scope="col">Customer ID</th>')
    expect(markup).toContain('<th scope="col">Company Name</th>')
    expect(markup).toContain('MAIN WAREHOUSE - HAUSER COMPANY STORES')
    expect(markup).toContain('—')
    expect(markup).not.toMatch(/accessToken|refreshToken|authorization/i)
  })

  it('visibly warns when fewer than six configured customers resolve', () => {
    const result: ResolveCustomerIdsResult = {
      success: true,
      httpStatus: 200,
      message: 'Only 5 of 6 configured customers were resolved.',
      resolutionStatus: 'incomplete',
      configuredCustomerCount: 6,
      resolvedCustomerCount: 5,
      candidateCount: 5,
      additionalCandidateCount: 0,
      rows: []
    }

    const markup = renderToStaticMarkup(<CustomerResolutionDiagnostic result={result} />)

    expect(markup).toContain('Only 5 of 6 configured customers were resolved.')
    expect(markup).toContain('customer-resolution-diagnostic--review')
  })

  it('displays every additional candidate row without choosing one', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      internalId: String(index + 1),
      entityId: `Candidate ${index + 1}`,
      companyName: index === 7 ? null : `Company ${index + 1}`
    }))
    const result: ResolveCustomerIdsResult = {
      success: true,
      httpStatus: 200,
      message:
        '6 configured customers resolved. 2 additional matching customer candidates were found.',
      resolutionStatus: 'additional-candidates',
      configuredCustomerCount: 6,
      resolvedCustomerCount: 6,
      candidateCount: 8,
      additionalCandidateCount: 2,
      rows
    }

    const markup = renderToStaticMarkup(<CustomerResolutionDiagnostic result={result} />)

    expect(markup).toContain('2 additional matching customer candidates were found.')
    for (const row of rows) expect(markup).toContain(row.entityId)
  })

  it('renders a sanitized SuiteQL failure without raw response data', () => {
    const result: ResolveCustomerIdsResult = {
      success: false,
      httpStatus: 403,
      error: {
        code: 'permission',
        message:
          'The NetSuite role does not have permission to execute or access the requested SuiteQL data.'
      }
    }

    const markup = renderToStaticMarkup(<CustomerResolutionDiagnostic result={result} />)

    expect(markup).toContain('Customer ID resolution failed')
    expect(markup).toContain('HTTP status')
    expect(markup).toContain('403')
    expect(markup).not.toMatch(/accessToken|refreshToken|authorization/i)
  })
})
