import { Fragment, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ExpandedState,
  type PaginationState,
  type SortingState
} from '@tanstack/react-table'
import type { BacklogRow } from '@shared/types/backlog'
import { formatDate } from '@shared/utils/date'
import { formatQuantity } from '@shared/utils/quantity'
import { ChevronIcon, SortIcon } from '../../components/icons'
import { StatusBadge } from '../../components/StatusBadge'
import { WorkOrderHierarchyPanel } from '../work-order-tree/WorkOrderHierarchyPanel'

interface BacklogTableProps {
  rows: BacklogRow[]
}

const PAGE_SIZES = [50, 100, 250] as const

function countDescendants(root: BacklogRow['workOrderHierarchy']): number {
  if (!root) return 0
  return root.children.reduce((total, child) => total + 1 + countDescendants(child), 0)
}

function displayText(value: string | undefined): string {
  return value?.trim() || '—'
}

export function BacklogTable({ rows }: BacklogTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'dueDate', desc: false },
    { id: 'salesOrderNumber', desc: false }
  ])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 100 })

  const columns = useMemo<ColumnDef<BacklogRow>[]>(
    () => [
      {
        accessorKey: 'customerName',
        header: 'Customer Name',
        size: 265,
        cell: ({ getValue }) => (
          <span className="customer-cell">{displayText(getValue<string>())}</span>
        )
      },
      {
        accessorKey: 'poNumber',
        header: 'PO #',
        size: 120,
        cell: ({ getValue }) => displayText(getValue<string>())
      },
      {
        accessorKey: 'workOrderNumber',
        header: 'Work Order #',
        size: 130,
        cell: ({ getValue }) => displayText(getValue<string | undefined>())
      },
      {
        accessorKey: 'salesOrderNumber',
        header: 'Sales Order #',
        size: 130,
        cell: ({ getValue }) => <strong>{displayText(getValue<string>())}</strong>
      },
      {
        accessorKey: 'shipTo',
        header: 'Ship To',
        size: 200,
        enableSorting: false,
        cell: ({ getValue }) => displayText(getValue<string>())
      },
      {
        accessorKey: 'item',
        header: 'Item',
        size: 130,
        cell: ({ getValue }) => <strong>{displayText(getValue<string>())}</strong>
      },
      {
        accessorKey: 'itemDescription',
        header: 'Item Description',
        size: 245,
        enableSorting: false,
        cell: ({ getValue }) => displayText(getValue<string>())
      },
      {
        accessorKey: 'paintName',
        header: 'Paint Name',
        size: 145,
        enableSorting: false,
        cell: ({ getValue }) => displayText(getValue<string>())
      },
      {
        accessorKey: 'fabricName',
        header: 'Fabric Name',
        size: 155,
        enableSorting: false,
        cell: ({ getValue }) => displayText(getValue<string>())
      },
      {
        accessorKey: 'quantity',
        header: 'Sum of Qty.',
        size: 118,
        cell: ({ getValue }) => (
          <span className="numeric">{formatQuantity(getValue<number>())}</span>
        )
      },
      {
        accessorKey: 'quantityShipped',
        header: 'Sum of Qty. Ship',
        size: 145,
        cell: ({ getValue }) => (
          <span className="numeric">{formatQuantity(getValue<number>())}</span>
        )
      },
      {
        accessorKey: 'quantityRemaining',
        header: 'Sum of Qty. Rmn',
        size: 145,
        cell: ({ getValue }) => (
          <span className="numeric numeric--emphasis">{formatQuantity(getValue<number>())}</span>
        )
      },
      {
        accessorKey: 'createdDate',
        header: 'Created Date',
        size: 135,
        cell: ({ getValue }) => formatDate(getValue<string | undefined>())
      },
      {
        accessorKey: 'dueDate',
        header: 'Due Date',
        size: 135,
        cell: ({ getValue }) => formatDate(getValue<string | undefined>())
      },
      {
        id: 'workOrderStatus',
        accessorFn: (row) => row.workOrderStatus?.label ?? '',
        header: 'WO Status',
        size: 210,
        cell: ({ row, getValue }) => {
          if (!row.original.workOrderNumber || !row.original.workOrderStatus) {
            return <span className="no-work-order">No Work Order</span>
          }

          const relatedCount = countDescendants(row.original.workOrderHierarchy)
          const statusLabel = getValue<string>() || 'Unknown'

          if (!row.getCanExpand()) return <StatusBadge label={statusLabel} />

          return (
            <button
              className="status-expand-button"
              type="button"
              onClick={row.getToggleExpandedHandler()}
              aria-expanded={row.getIsExpanded()}
              aria-label={`${row.getIsExpanded() ? 'Collapse' : 'Expand'} ${row.original.workOrderNumber} hierarchy`}
            >
              <ChevronIcon direction={row.getIsExpanded() ? 'down' : 'right'} />
              <StatusBadge label={statusLabel} />
              {relatedCount > 0 ? (
                <span className="related-count">{relatedCount} related</span>
              ) : null}
            </button>
          )
        }
      }
    ],
    []
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, expanded, pagination },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.rowKey,
    getRowCanExpand: (row) => Boolean(row.original.workOrderHierarchy),
    autoResetPageIndex: true
  })

  const firstVisibleRow = rows.length === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1
  const lastVisibleRow = Math.min((pagination.pageIndex + 1) * pagination.pageSize, rows.length)

  return (
    <div className="report-table-shell">
      <div
        className="report-table-scroll"
        tabIndex={0}
        aria-label="Backlog report table, horizontally scrollable"
      >
        <table className="report-table" style={{ width: table.getTotalSize() }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDirection = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      aria-sort={
                        sortDirection === 'asc'
                          ? 'ascending'
                          : sortDirection === 'desc'
                            ? 'descending'
                            : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon sortDirection={sortDirection} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className={row.getIsExpanded() ? 'report-row report-row--expanded' : 'report-row'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                {row.getIsExpanded() && row.original.workOrderHierarchy ? (
                  <tr className="hierarchy-detail-row">
                    <td colSpan={columns.length}>
                      <WorkOrderHierarchyPanel root={row.original.workOrderHierarchy} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-pagination" aria-label="Table pagination">
        <span>
          Showing {firstVisibleRow}–{lastVisibleRow} of {rows.length}
        </span>
        <div className="table-pagination__controls">
          <label>
            Rows per page
            <select
              value={pagination.pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
          </span>
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
