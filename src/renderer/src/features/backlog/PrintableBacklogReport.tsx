import type { BacklogPrintSnapshot } from '@shared/types/backlog'
import { formatDate, formatDateTime } from '@shared/utils/date'
import { formatQuantity } from '@shared/utils/quantity'
import { StatusBadge } from '../../components/StatusBadge'
import {
  BACKLOG_TABLE_HEADERS,
  displayWorkOrderStatus,
  getBuiltCompletionState
} from './backlogTablePresentation'
import { printableCustomerName } from './printBacklogPresentation'

interface PrintableBacklogReportProps {
  snapshot: BacklogPrintSnapshot
}

const PRINT_COLUMN_WIDTHS = [5, 6, 7, 7, 13, 10, 10, 4.5, 4.5, 4.5, 9, 6, 6.5, 6.5]

function text(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function date(value: string | null | undefined): string {
  return value ? formatDate(value) : ''
}

export function PrintableBacklogReport({ snapshot }: PrintableBacklogReportProps) {
  return (
    <section className="print-report" aria-hidden="true">
      <header className="print-report__header">
        <div>
          <h1>Hauser Backlog Report</h1>
          <p>{snapshot.scopeLabel}</p>
        </div>
        <div>
          <strong>{snapshot.salesOrders.length} Sales Orders</strong>
          <span>Generated {formatDateTime(snapshot.generatedAt)}</span>
        </div>
      </header>
      <table className="print-report__table">
        <colgroup>
          {PRINT_COLUMN_WIDTHS.map((width, index) => (
            <col key={BACKLOG_TABLE_HEADERS[index]} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {BACKLOG_TABLE_HEADERS.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        {snapshot.salesOrders.map((salesOrder) => (
          <tbody key={salesOrder.salesOrderInternalId} className="print-sales-order-group">
            <tr className="print-sales-order-row">
              <td>{printableCustomerName(salesOrder.customerName)}</td>
              <td>{text(salesOrder.salesOrderNumber)}</td>
              <td>{text(salesOrder.poNumber)}</td>
              {Array.from({ length: 9 }, (_, index) => (
                <td key={`print-parent-empty-${index}`} />
              ))}
              <td>{date(salesOrder.createdDate)}</td>
              <td>{date(salesOrder.dueDate)}</td>
            </tr>
            {salesOrder.items.map((item) => {
              const workOrderStatus = displayWorkOrderStatus(item.workOrderStatus)
              return (
                <tr className="print-item-row" key={item.rowKey}>
                  <td />
                  <td />
                  <td />
                  <td>{text(item.item)}</td>
                  <td>{text(item.itemDescription)}</td>
                  <td>{text(item.paintDescription)}</td>
                  <td>{text(item.fabricDescription)}</td>
                  <td className="print-numeric">{formatQuantity(item.quantity)}</td>
                  <td>
                    <span
                      className={`built-value built-value--${getBuiltCompletionState(item.built, item.quantity)}`}
                    >
                      {formatQuantity(item.built)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`built-value built-value--${getBuiltCompletionState(item.painted, item.quantity)}`}
                    >
                      {formatQuantity(item.painted)}
                    </span>
                  </td>
                  <td>{text(item.workOrderNumber)}</td>
                  <td>{workOrderStatus ? <StatusBadge label={workOrderStatus} compact /> : null}</td>
                  <td />
                  <td />
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </section>
  )
}
