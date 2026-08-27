import { Fragment, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import type {
  BacklogItemRow,
  SalesOrderDetailsResult,
  SalesOrderGroup,
  SalesOrderItemDetail,
  WorkOrderBuiltRequest,
  WorkOrderBuiltResult
} from '@shared/types/backlog'
import { formatDate } from '@shared/utils/date'
import { formatQuantity } from '@shared/utils/quantity'
import { ChevronIcon } from '../../components/icons'
import { StatusBadge } from '../../components/StatusBadge'
import {
  BACKLOG_TABLE_HEADERS,
  getBuiltCompletionState,
  MIN_REPORT_COLUMN_WIDTH,
  setReportColumnWidth,
  displayWorkOrderStatus
} from './backlogTablePresentation'

interface BacklogTableProps {
  salesOrders: SalesOrderGroup[]
  page: number
  pageSize: number
  totalSalesOrders: number
  hasPrevious: boolean
  hasNext: boolean
  onPageChange: (page: number) => void
  onLoadDetails: (salesOrderInternalId: string) => Promise<SalesOrderDetailsResult>
  onLoadBuilt: (request: WorkOrderBuiltRequest) => Promise<WorkOrderBuiltResult>
}

interface DetailState {
  loading: boolean
  items: SalesOrderItemDetail[]
  builtByWorkOrder: Record<string, number | null>
  error?: string
}

const DEFAULT_COLUMN_WIDTHS = [
  260, 125, 115, 125, 230, 180, 190, 100, 100, 125, 165, 120, 120
] as const

interface ColumnResizeState {
  columnIndex: number
  pointerId: number
  startX: number
  startWidth: number
}

function displayText(value: string | null | undefined): string {
  return value?.trim() || ''
}

function displayDate(value: string | null | undefined): string {
  if (!value) return ''
  const formatted = formatDate(value)
  return formatted === '—' ? '' : formatted
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

function mergeItem(item: BacklogItemRow, details: readonly SalesOrderItemDetail[]): BacklogItemRow {
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
  onLoadDetails,
  onLoadBuilt
}: BacklogTableProps) {
  const [expandedSalesOrders, setExpandedSalesOrders] = useState<Set<string>>(() => new Set())
  const [detailBySalesOrder, setDetailBySalesOrder] = useState<Record<string, DetailState>>({})
  const [columnWidths, setColumnWidths] = useState<number[]>(() => [...DEFAULT_COLUMN_WIDTHS])
  const columnResize = useRef<ColumnResizeState | undefined>(undefined)

  const startColumnResize = (
    event: PointerEvent<HTMLButtonElement>,
    columnIndex: number
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    columnResize.current = {
      columnIndex,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: columnWidths[columnIndex] ?? MIN_REPORT_COLUMN_WIDTH
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resizeColumn = (event: PointerEvent<HTMLButtonElement>): void => {
    const active = columnResize.current
    if (!active || active.pointerId !== event.pointerId) return
    setColumnWidths((current) =>
      setReportColumnWidth(
        current,
        active.columnIndex,
        active.startWidth + event.clientX - active.startX
      )
    )
  }

  const finishColumnResize = (event: PointerEvent<HTMLButtonElement>): void => {
    if (columnResize.current?.pointerId !== event.pointerId) return
    columnResize.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const resizeColumnWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    columnIndex: number
  ): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -10 : 10
    setColumnWidths((current) =>
      setReportColumnWidth(current, columnIndex, (current[columnIndex] ?? 0) + delta)
    )
  }

  const loadDetails = async (salesOrder: SalesOrderGroup): Promise<void> => {
    const id = salesOrder.salesOrderInternalId
    if (detailBySalesOrder[id]) return

    setDetailBySalesOrder((current) => ({
      ...current,
      [id]: { loading: true, items: [], builtByWorkOrder: {} }
    }))
    const workOrders = [
      ...new Map(
        salesOrder.items.flatMap((item) =>
          item.workOrderInternalId && item.workOrderNumber
            ? [
                [
                  item.workOrderInternalId,
                  {
                    workOrderInternalId: item.workOrderInternalId,
                    workOrderNumber: item.workOrderNumber
                  }
                ] as const
              ]
            : []
        )
      ).values()
    ]
    const [detailsOutcome, builtOutcome] = await Promise.allSettled([
      onLoadDetails(id),
      workOrders.length === 0
        ? Promise.resolve({ success: true as const, values: [] })
        : onLoadBuilt({ workOrders })
    ])
    const details = detailsOutcome.status === 'fulfilled' ? detailsOutcome.value : undefined
    const builtValues = builtOutcome.status === 'fulfilled' ? builtOutcome.value.values : []
    const builtByWorkOrder = Object.fromEntries(
      builtValues.map(({ workOrderInternalId, built }) => [workOrderInternalId, built])
    )

    setDetailBySalesOrder((current) => ({
      ...current,
      [id]: {
        loading: false,
        items: details?.success ? details.items : [],
        builtByWorkOrder,
        ...(!details || !details.success
          ? {
              error:
                details && !details.success
                  ? details.message
                  : 'Optional item details could not be loaded for this Sales Order.'
            }
          : {})
      }
    }))
  }

  const toggleSalesOrder = (salesOrder: SalesOrderGroup): void => {
    const id = salesOrder.salesOrderInternalId
    const willExpand = !expandedSalesOrders.has(id)
    setExpandedSalesOrders((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

    if (willExpand) void loadDetails(salesOrder)
  }

  const expandAll = (): void => {
    setExpandedSalesOrders(
      new Set(salesOrders.map((salesOrder) => salesOrder.salesOrderInternalId))
    )
    void (async () => {
      // Keep bulk expansion gentle on NetSuite's concurrency limits.
      for (const salesOrder of salesOrders) await loadDetails(salesOrder)
    })()
  }

  const collapseAll = (): void => {
    setExpandedSalesOrders(new Set())
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
  const allExpanded =
    salesOrders.length > 0 &&
    salesOrders.every((salesOrder) => expandedSalesOrders.has(salesOrder.salesOrderInternalId))
  const anyExpanded = expandedSalesOrders.size > 0
  const tableWidth = columnWidths.reduce((total, width) => total + width, 0)

  return (
    <div className="report-table-shell">
      <div className="report-table-actions" aria-label="Sales Order expansion controls">
        <button
          className="button button--secondary"
          type="button"
          onClick={expandAll}
          disabled={salesOrders.length === 0 || allExpanded}
        >
          Expand All
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={collapseAll}
          disabled={!anyExpanded}
        >
          Collapse All
        </button>
      </div>
      <div
        className="report-table-scroll"
        tabIndex={0}
        aria-label="Backlog report table, horizontally and vertically scrollable"
      >
        <table
          className="report-table report-table--grouped"
          style={{ width: tableWidth, minWidth: tableWidth }}
        >
          <colgroup>
            {columnWidths.map((width, index) => (
              <col key={BACKLOG_TABLE_HEADERS[index]} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {BACKLOG_TABLE_HEADERS.map((header, columnIndex) => (
                <th key={header}>
                  <span>{header}</span>
                  <button
                    className="column-resize-handle"
                    type="button"
                    role="separator"
                    aria-label={`Resize ${header} column`}
                    aria-orientation="vertical"
                    aria-valuemin={MIN_REPORT_COLUMN_WIDTH}
                    aria-valuenow={columnWidths[columnIndex]}
                    title={`Resize ${header} column`}
                    onPointerDown={(event) => startColumnResize(event, columnIndex)}
                    onPointerMove={resizeColumn}
                    onPointerUp={finishColumnResize}
                    onPointerCancel={finishColumnResize}
                    onLostPointerCapture={() => {
                      columnResize.current = undefined
                    }}
                    onKeyDown={(event) => resizeColumnWithKeyboard(event, columnIndex)}
                  />
                </th>
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
                    {Array.from({ length: 8 }, (_, index) => (
                      <td key={`parent-empty-${index}`} />
                    ))}
                    <td>{displayDate(salesOrder.createdDate)}</td>
                    <td>{displayDate(salesOrder.dueDate)}</td>
                  </tr>
                  {expanded
                    ? salesOrder.items.map((basicItem) => {
                        const item = mergeItem(basicItem, detailState?.items ?? [])
                        const hasLoadedBuilt = Boolean(
                          item.workOrderInternalId &&
                            detailState &&
                            Object.hasOwn(detailState.builtByWorkOrder, item.workOrderInternalId)
                        )
                        const built =
                          hasLoadedBuilt && item.workOrderInternalId
                            ? detailState?.builtByWorkOrder[item.workOrderInternalId]
                            : item.built
                        return (
                          <tr className="report-row sales-order-item-row" key={item.rowKey}>
                            <td />
                            <td />
                            <td />
                            <td>
                              <span className="item-cell">{displayText(item.item)}</span>
                            </td>
                            <td>{displayText(item.itemDescription)}</td>
                            <td>{displayText(item.paintDescription)}</td>
                            <td>{displayText(item.fabricDescription)}</td>
                            <td>
                              <span className="numeric numeric--emphasis">
                                {formatQuantity(item.quantity)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`built-value numeric built-value--${getBuiltCompletionState(built, item.quantity)}`}
                              >
                                {built === undefined || built === null || !Number.isFinite(built)
                                  ? '—'
                                  : formatQuantity(built)}
                              </span>
                            </td>
                            <td>{displayText(item.workOrderNumber)}</td>
                            <td>
                              {displayWorkOrderStatus(item.workOrderStatus) ? (
                                <StatusBadge label={displayWorkOrderStatus(item.workOrderStatus)} />
                              ) : null}
                            </td>
                            <td />
                            <td />
                          </tr>
                        )
                      })
                    : null}
                  {expanded && detailState?.loading ? (
                    <tr className="optional-detail-row">
                      <td colSpan={BACKLOG_TABLE_HEADERS.length}>
                        Loading optional item details…
                      </td>
                    </tr>
                  ) : null}
                  {expanded && detailState?.error ? (
                    <tr className="optional-detail-row optional-detail-row--error">
                      <td colSpan={BACKLOG_TABLE_HEADERS.length}>{detailState.error}</td>
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
