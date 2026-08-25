import type { SuiteQlTestResult } from '@shared/types/backlog'

interface SuiteQlDiagnosticProps {
  result: SuiteQlTestResult | null
}

export function SuiteQlDiagnostic({ result }: SuiteQlDiagnosticProps) {
  if (!result) return null

  if (!result.success) {
    return (
      <section className="suiteql-diagnostic suiteql-diagnostic--error" aria-live="polite">
        <h3>SuiteQL diagnostic</h3>
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

  return (
    <section className="suiteql-diagnostic suiteql-diagnostic--success" aria-live="polite">
      <h3>{result.message}</h3>
      <dl className="suiteql-diagnostic__summary">
        <div>
          <dt>Returned</dt>
          <dd>{result.count} rows</dd>
        </div>
        <div>
          <dt>Total customer records accessible</dt>
          <dd>{result.totalResults}</dd>
        </div>
        <div>
          <dt>More records available</dt>
          <dd>{result.hasMore ? 'Yes' : 'No'}</dd>
        </div>
      </dl>

      {result.items.length > 0 ? (
        <div className="suiteql-diagnostic__table-wrap">
          <table className="suiteql-diagnostic__table">
            <thead>
              <tr>
                <th scope="col">Internal ID</th>
                <th scope="col">Customer</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.id}</td>
                  <td>{customer.entityid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
