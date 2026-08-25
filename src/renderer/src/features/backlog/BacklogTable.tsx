import { Fragment, useState, type KeyboardEvent } from 'react'

import type {
  BacklogItemRow,
  SalesOrderDetailsResult,
  SalesOrderGroup,
  SalesOrderItemDetail
} from '@shared/types/backlog'
import { formatDate } from '@shared/utils/date'
import { formatQuantity } from '@shared/utils/quantity'
import { ChevronIcon } from '../../components/icons'
import { StatusBadge } from '../../components/StatusBadge'

interface BacklogTableProps {
  salesOrders: SalesOrderGroup[]
  page: number
  pageSize: number
  totalSalesOrders: number
  hasPrevious: boolean
  hasNext: boolean
  onPageChange: (page: number) => void
  onLoadDetails: (salesOrderInternalId: string) => Promise<SalesOrderDetailsResult>
}

interface DetailState {
  loading: boolean
  items: SalesOrderItemDetail[]
  error?: string
}

const COLUMN_WIDTHS = [
  260, 125, 115, 130, 230, 125, 100, 125, 180, 130, 190, 125, 180, 125, 180, 120,
  120, 165
] as const

const HEADERS = [
  'Customer Name',
  'Sales Order #',
  'PO #',
  'Item',
  'Item Description',
  'Work Order #',
  'Sum of Qty.',
  'Paint Name',
  'Paint Description',
  'Fabric Name',
  'Fabric Description',
  'Welt Name',
  'Welt Description',
  'Button Name',
  'Button Description',
  'Created Date',
  'Due Date',
  'WO Status'
] as const

function displayText(value: string | null | undefined): string {
  return value?.trim() || ''
}

function displayDate(value: string | null | undefined): string {
  if (!value) return ''
  const formatted = formatDate(value)
  return formatted === '—' ? '' : formatted
}

function displayWorkOrderStatus(value: string | undefined): string {
  const normalized = value?.trim() ?? ''
  return normalized === 'No Work Order' ? '' : normalized
}

function itemDetail(
  item: BacklogItemRow,
  details: readonly SalesOrderItemDetail[]
): SalesOrderItemDetail | undefined {
  return details.find(
    (detail) =>
      (detail.lineId !== undefined && detail.lineId === item.lineId) ||
      (detail.lineSequence !== undefined && detail.lineSequence === item.lineSequence)
  )
}

function mergeItem(
  item: BacklogItemRow,
  details: readonly SalesOrderItemDetail[]
): BacklogItemRow {
  const detail = itemDetail(item, details)
  return detail ? { ...item, ...detail } : item
}

export function BacklogTable({
  salesOrders,
  page,
  pageSize,
  totalSalesOrders,
  hasPrevious,
  hasNext,
  onPageChange,
  onLoadDetails
}: BacklogTableProps) {
  const [expandedSalesOrders, setExpandedSalesOrders] = useState<Set<string>>(
    () => new Set()
  )
  const [detailBySalesOrder, setDetailBySalesOrder] = useState<Record<string, DetailState>>({})

  const toggleSalesOrder = (salesOrder: SalesOrderGroup): void => {
    const id = salesOrder.salesOrderInternalId
    const willExpand = !expandedSalesOrders.has(id)
    setExpandedSalesOrders((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

    if (!willExpand || detailBySalesOrder[id]) return
    setDetailBySalesOrder((current) => ({
      ...current,
      [id]: { loading: true, items: [] }
    }))
    void onLoadDetails(id)
      .then((result) => {
        setDetailBySalesOrder((current) => ({
          ...current,
          [id]: result.success
            ? { loading: false, items: result.items }
            : { loading: false, items: [], error: result.message }
        }))
      })
      .catch(() => {
        setDetailBySalesOrder((current) => ({
          ...current,
          [id]: {
            loading: false,
            items: [],
            error: 'Optional item details could not be loaded for this Sales Order.'
          }
        }))
      })
  }

  const handleParentKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    salesOrder: SalesOrderGroup
  ): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleSalesOrder(salesOrder)
  }

  const firstVisible = totalSalesOrders === 0 ? 0 : page * pageSize + 1
  const lastVisible = Math.min((page + 1) * pageSize, totalSalesOrders)
  const pageCount = Math.max(1, Math.ceil(totalSalesOrders / pageSize))

  return (
    <div className="report-table-shell">
      <div
        className="report-table-scroll"
        tabIndex={0}
        aria-label="Backlog report table, horizontally and vertically scrollable"
      >
        <table className="report-table report-table--grouped">
          <colgroup>
            {COLUMN_WIDTHS.map((width, index) => (
              <col key={HEADERS[index]} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salesOrders.map((salesOrder) => {
              const id = salesOrder.salesOrderInternalId
              const expanded = expandedSalesOrders.has(id)
              const detailState = detailBySalesOrder[id]
              return (
                <Fragment key={id}>
                  <tr
                    className={
                      expanded
                        ? 'report-row sales-order-row report-row--expanded'
                        : 'report-row sales-order-row'
                    }
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => toggleSalesOrder(salesOrder)}
                    onKeyDown={(event) => handleParentKeyDown(event, salesOrder)}
                  >
                    <td>
                      <span className="customer-cell">{displayText(salesOrder.customerName)}</span>
                    </td>
                    <td>
                      <button
                        className="sales-order-expand-button"
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${salesOrder.salesOrderNumber}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleSalesOrder(salesOrder)
                        }}
                      >
                        <ChevronIcon direction={expanded ? 'down' : 'right'} />
                        <strong>{displayText(salesOrder.salesOrderNumber)}</strong>
                      </button>
                    </td>
                    <td>{displayText(salesOrder.poNumber)}</td>
                    {Array.from({ length: 12 }, (_, index) => (
                      <td key={`parent-empty-${index}`} />
                    ))}
                    <td>{displayDate(salesOrder.createdDate)}</td>
                    <td>{displayDate(salesOrder.dueDate)}</td>
                    <td />
                  </tr>
                  {expanded
                    ? salesOrder.items.map((basicItem) => {
                        const item = mergeItem(basicItem, detailState?.items ?? [])
                        return (
                          <tr className="report-row sales-order-item-row" key={item.rowKey}>
                            <td>
                              <span className="customer-cell">
                                {displayText(salesOrder.customerName)}
                              </span>
                            </td>
                            <td>
                              <strong>{displayText(salesOrder.salesOrderNumber)}</strong>
                            </td>
                            <td>{displayText(salesOrder.poNumber)}</td>
                            <td>
                              <span className="item-cell">{displayText(item.item)}</span>
                            </td>
                            <td>{displayText(item.itemDescription)}</td>
                            <td>{displayText(item.workOrderNumber)}</td>
                            <td>
                              <span className="numeric numeric--emphasis">
                                {formatQuantity(item.quantity)}
                              </span>
                            </td>
                            <td>{displayText(item.paintName)}</td>
                            <td>{displayText(item.paintDescription)}</td>
                            <td>{displayText(item.fabricName)}</td>
                            <td>{displayText(item.fabricDescription)}</td>
                            <td>{displayText(item.weltName)}</td>
                            <td>{displayText(item.weltDescription)}</td>
                            <td>{displayText(item.buttonName)}</td>
                            <td>{displayText(item.buttonDescription)}</td>
                            <td>{displayDate(salesOrder.createdDate)}</td>
                            <td>{displayDate(salesOrder.dueDate)}</td>
                            <td>
                              {displayWorkOrderStatus(item.workOrderStatus) ? (
                                <StatusBadge
                                  label={displayWorkOrderStatus(item.workOrderStatus)}
                                />
                              ) : null}
                            </td>
                          </tr>
                        )
                      })
                    : null}
                  {expanded && detailState?.loading ? (
                    <tr className="optional-detail-row">
                      <td colSpan={HEADERS.length}>Loading optional item details…</td>
                    </tr>
                  ) : null}
                  {expanded && detailState?.error ? (
                    <tr className="optional-detail-row optional-detail-row--error">
                      <td colSpan={HEADERS.length}>{detailState.error}</td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="table-pagination" aria-label="Sales Order pagination">
        <span>
          Showing Sales Orders {firstVisible}–{lastVisible} of {totalSalesOrders}
        </span>
        <div className="table-pagination__controls">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={!hasPrevious}>
            Previous
          </button>
          <span>
            Page {page + 1} of {pageCount}
          </span>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={!hasNext}>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
