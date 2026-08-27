import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BacklogTable } from '../src/renderer/src/features/backlog/BacklogTable'
import {
  BACKLOG_TABLE_HEADERS,
  displayWorkOrderStatus,
  getBuiltCompletionState,
  MIN_REPORT_COLUMN_WIDTH,
  setReportColumnWidth,
  shouldLoadPainted
} from '../src/renderer/src/features/backlog/backlogTablePresentation'
import type { SalesOrderGroup } from '../src/shared/types/backlog'

const salesOrder: SalesOrderGroup = {
  salesOrderInternalId: '1234',
  salesOrderNumber: 'SO1234',
  customerInternalId: '1578',
  customerName: 'WATERLOO - HAUSER COMPANY STORES',
  poNumber: 'PO-88',
  createdDate: '2026-08-20',
  dueDate: '2026-09-05',
  items: [
    {
      rowKey: '1234-1',
      lineId: '1',
      lineSequence: 1,
      itemInternalId: '44',
      item: 'CHAIR-01',
      itemDescription: 'Chair',
      quantity: 4
    }
  ]
}

const sharedProps = {
  page: 0,
  pageSize: 50,
  totalSalesOrders: 1,
  hasPrevious: false,
  hasNext: false,
  onPageChange: () => undefined,
  onLoadDetails: async () => ({ success: true as const, items: [] }),
  onLoadBuilt: async () => ({ success: true as const, values: [] }),
  onLoadPainted: async () => ({ success: true as const, values: [] })
}

describe('BacklogTable grouped report contract', () => {
  it('renders the approved columns, including Built after Sum of Qty., and resize handles', () => {
    const markup = renderToStaticMarkup(
      <BacklogTable salesOrders={[salesOrder]} {...sharedProps} />
    )
    const expectedHeaders = [
      'Customer Name',
      'Sales Order #',
      'PO #',
      'Item',
      'Item Description',
      'Paint Description',
      'Fabric Description',
      'Sum of Qty.',
      'Built',
      'Painted',
      'Work Order #',
      'WO Status',
      'Created Date',
      'Due Date'
    ]

    expect(BACKLOG_TABLE_HEADERS).toEqual(expectedHeaders)
    expect(markup.match(/<th(?:\s|>)/g)).toHaveLength(14)
    expect(markup.match(/role="separator"/g)).toHaveLength(14)
    let priorIndex = -1
    for (const header of expectedHeaders) {
      const index = markup.indexOf(header)
      expect(index).toBeGreaterThan(priorIndex)
      priorIndex = index
    }
    expect(markup).toContain('WATERLOO - HAUSER COMPANY STORES')
    expect(markup).toContain('SO1234')
    expect(markup).not.toContain('Ship To')
    expect(markup).not.toMatch(/Paint Name|Fabric Name|Welt|Button/)
    expect(markup).not.toMatch(/Qty Shipped|Qty Remaining/i)
    expect(markup).toContain('class="sales-order-expand-button"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('CHAIR-01')
    expect(markup).toContain('Expand All')
    expect(markup).toContain('Collapse All')
    expect(markup).not.toContain('—')
  })

  it('maps Built completion to unavailable, red, amber, and green states', () => {
    expect(getBuiltCompletionState(undefined, 4)).toBe('unavailable')
    expect(getBuiltCompletionState(0, 4)).toBe('none')
    expect(getBuiltCompletionState(0, null)).toBe('none')
    expect(getBuiltCompletionState(2, 4)).toBe('partial')
    expect(getBuiltCompletionState(4, 4)).toBe('complete')
    expect(getBuiltCompletionState(5, 4)).toBe('complete')
  })

  it('loads Painted only for paint-bearing lines whose top-level Work Order is incomplete', () => {
    expect(shouldLoadPainted('PAINT-BLACK', 0, 4)).toBe(true)
    expect(shouldLoadPainted('PAINT-BLACK', 2, 4)).toBe(true)
    expect(shouldLoadPainted('PAINT-BLACK', 4, 4)).toBe(false)
    expect(shouldLoadPainted('', 2, 4)).toBe(false)
    expect(shouldLoadPainted(undefined, 2, 4)).toBe(false)
    expect(shouldLoadPainted('PAINT-BLACK', null, 4)).toBe(false)
  })

  it('resizes only the requested column and enforces the minimum width', () => {
    expect(setReportColumnWidth([100, 120, 140], 1, 175)).toEqual([100, 175, 140])
    expect(setReportColumnWidth([100, 120, 140], 1, 10)).toEqual([
      100,
      MIN_REPORT_COLUMN_WIDTH,
      140
    ])
  })

  it('shows only the Work Order status label without the NetSuite record-type prefix', () => {
    expect(displayWorkOrderStatus('Work Order : In Process')).toBe('In Process')
    expect(displayWorkOrderStatus('work order: Released')).toBe('Released')
    expect(displayWorkOrderStatus('Complete')).toBe('Complete')
    expect(displayWorkOrderStatus('Work Order : No Work Order')).toBe('')
  })

  it('renders Sales Order-level paging controls', () => {
    const markup = renderToStaticMarkup(
      <BacklogTable salesOrders={[salesOrder]} {...sharedProps} totalSalesOrders={75} hasNext />
    )

    expect(markup).toContain('Showing Sales Orders 1–50 of 75')
    expect(markup).toContain('Page 1 of 2')
    expect(markup).toContain('Next')
  })
})
