import type {
  InspectSalesOrderResult,
  SalesOrderInspectionRawBooleanValue,
  SalesOrderInspectionRawValue
} from '@shared/types/backlog'

interface SalesOrderInspectionDiagnosticProps {
  result: InspectSalesOrderResult | null
}

function displayRawValue(
  value: SalesOrderInspectionRawValue | SalesOrderInspectionRawBooleanValue
): string {
  return value === null ? '—' : String(value)
}

export function SalesOrderInspectionDiagnostic({ result }: SalesOrderInspectionDiagnosticProps) {
  if (!result) return null

  if (!result.success) {
    return (
      <section className="suiteql-diagnostic suiteql-diagnostic--error" role="alert">
        <h3>Sales Order inspection failed</h3>
        <p>{result.error.message}</p>
        {result.httpStatus !== null ? <p>HTTP status: {result.httpStatus}</p> : null}
        {result.error.diagnostics ? (
          <details className="suiteql-diagnostic__details">
            <summary>Development diagnostics</summary>
            <dl>
              {result.error.diagnostics.stage ? (
                <div>
                  <dt>Failure stage</dt>
                  <dd>{result.error.diagnostics.stage}</dd>
                </div>
              ) : null}
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

  if (!result.found) {
    return (
      <section className="suiteql-diagnostic sales-order-inspection-diagnostic">
        <h3>Sales Order not found</h3>
        <p>{result.message}</p>
      </section>
    )
  }

  const { header } = result
  return (
    <section className="suiteql-diagnostic sales-order-inspection-diagnostic">
      <h3>Sales Order inspection</h3>
      <p>{result.message}</p>
      <dl className="sales-order-inspection-diagnostic__header">
        <div>
          <dt>Sales Order Internal ID</dt>
          <dd>{header.salesOrderInternalId}</dd>
        </div>
        <div>
          <dt>Sales Order #</dt>
          <dd>{header.salesOrderNumber}</dd>
        </div>
        <div>
          <dt>Customer Internal ID</dt>
          <dd>{header.customerInternalId}</dd>
        </div>
        <div>
          <dt>Customer Name</dt>
          <dd>{displayRawValue(header.customerName)}</dd>
        </div>
        <div>
          <dt>Configured Hauser customer</dt>
          <dd>{result.configuredHauserCustomer ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>PO #</dt>
          <dd>{displayRawValue(header.poNumber)}</dd>
        </div>
        <div>
          <dt>Transaction Date</dt>
          <dd>{displayRawValue(header.transactionDate)}</dd>
        </div>
        <div>
          <dt>Created Date</dt>
          <dd>{displayRawValue(header.createdDate)}</dd>
        </div>
        <div>
          <dt>Standard NetSuite Due Date</dt>
          <dd>{displayRawValue(header.standardDueDate)}</dd>
        </div>
        <div>
          <dt>Hauser Due Date</dt>
          <dd>{displayRawValue(header.hauserDueDate)}</dd>
        </div>
      </dl>

      <div className="suiteql-diagnostic__table-wrap">
        <table className="suiteql-diagnostic__table sales-order-inspection-diagnostic__table">
          <thead>
            <tr>
              <th>Line ID</th>
              <th>Line Sequence</th>
              <th>Item Internal ID</th>
              <th>Item</th>
              <th>Description Candidate</th>
              <th>Raw Quantity API Value</th>
              <th>Raw Quantity API Type</th>
              <th>Normalized Quantity</th>
              <th>Report Quantity (-transactionLine.quantity)</th>
              <th>Closed</th>
              <th>Item Type</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((line) => (
              <tr key={line.lineId}>
                <td>{line.lineId}</td>
                <td>{displayRawValue(line.lineSequence)}</td>
                <td>{line.itemInternalId}</td>
                <td>{displayRawValue(line.item)}</td>
                <td>{displayRawValue(line.descriptionCandidate)}</td>
                <td>{displayRawValue(line.rawQuantityApiValue)}</td>
                <td>{line.rawQuantityApiType}</td>
                <td>{displayRawValue(line.normalizedQuantity)}</td>
                <td>{displayRawValue(line.reportQuantity)}</td>
                <td>{displayRawValue(line.closed)}</td>
                <td>{displayRawValue(line.itemType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
