import type { ResolveCustomerIdsResult } from '@shared/types/backlog'

interface CustomerResolutionDiagnosticProps {
  result: ResolveCustomerIdsResult | null
}

function optionalValue(value: string | null): string {
  return value ?? '—'
}

export function CustomerResolutionDiagnostic({ result }: CustomerResolutionDiagnosticProps) {
  if (!result) return null

  if (!result.success) {
    return (
      <section
        className="suiteql-diagnostic suiteql-diagnostic--error customer-resolution-diagnostic"
        aria-live="polite"
      >
        <h3>Customer ID resolution failed</h3>
        <p>{result.error.message}</p>
        <dl className="suiteql-diagnostic__summary">
          <div>
            <dt>HTTP status</dt>
            <dd>{result.httpStatus ?? 'Not available'}</dd>
          </div>
        </dl>
        {result.error.diagnostics ? (
          <details className="suiteql-diagnostic__details">
            <summary>Development diagnostics</summary>
            <dl>
              {result.error.diagnostics.netSuiteCode ? (
                <div>
                  <dt>NetSuite code</dt>
                  <dd>{result.error.diagnostics.netSuiteCode}</dd>
                </div>
              ) : null}
              {result.error.diagnostics.netSuiteMessage ? (
                <div>
                  <dt>NetSuite message</dt>
                  <dd>{result.error.diagnostics.netSuiteMessage}</dd>
                </div>
              ) : null}
            </dl>
          </details>
        ) : null}
      </section>
    )
  }

  const needsReview = result.resolutionStatus !== 'complete'

  return (
    <section
      className={`suiteql-diagnostic customer-resolution-diagnostic ${
        needsReview ? 'customer-resolution-diagnostic--review' : ''
      }`}
      aria-live="polite"
    >
      <h3>Customer ID resolution</h3>
      <p>{result.message}</p>
      <dl className="suiteql-diagnostic__summary">
        <div>
          <dt>Configured</dt>
          <dd>{result.configuredCustomerCount}</dd>
        </div>
        <div>
          <dt>Resolved</dt>
          <dd>{result.resolvedCustomerCount}</dd>
        </div>
        <div>
          <dt>Candidate rows</dt>
          <dd>{result.candidateCount}</dd>
        </div>
      </dl>

      {result.rows.length > 0 ? (
        <div className="suiteql-diagnostic__table-wrap">
          <table className="suiteql-diagnostic__table customer-resolution-diagnostic__table">
            <thead>
              <tr>
                <th scope="col">Internal ID</th>
                <th scope="col">Customer ID</th>
                <th scope="col">Company Name</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((customer, index) => (
                <tr key={`${customer.internalId}-${index}`}>
                  <td>{customer.internalId}</td>
                  <td>{optionalValue(customer.entityId)}</td>
                  <td>{optionalValue(customer.companyName)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
