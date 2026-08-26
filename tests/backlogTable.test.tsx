import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BacklogTable } from '../src/renderer/src/features/backlog/BacklogTable'
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
  onLoadDetails: async () => ({ success: true as const, items: [] })
}

describe('BacklogTable grouped report contract', () => {
  it('renders exactly the approved 18 columns in order and one collapsed Sales Order parent', () => {
    const markup = renderToStaticMarkup(
      <BacklogTable salesOrders={[salesOrder]} {...sharedProps} />
    )
    const expectedHeaders = [
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
    ]

    expect(markup.match(/<th(?:\s|>)/g)).toHaveLength(18)
    let priorIndex = -1
    for (const header of expectedHeaders) {
      const index = markup.indexOf(header)
      expect(index).toBeGreaterThan(priorIndex)
      priorIndex = index
    }
    expect(markup).toContain('WATERLOO - HAUSER COMPANY STORES')
    expect(markup).toContain('SO1234')
    expect(markup).not.toContain('Ship To')
    expect(markup).not.toMatch(/Qty Shipped|Qty Remaining/i)
    expect(markup).toContain('class="sales-order-expand-button"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('CHAIR-01')
    expect(markup).not.toContain('—')
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
