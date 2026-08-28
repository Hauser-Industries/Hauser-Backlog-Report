import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PrintableBacklogReport } from '../src/renderer/src/features/backlog/PrintableBacklogReport'
import { printableCustomerName } from '../src/renderer/src/features/backlog/printBacklogPresentation'
import type { BacklogPrintSnapshot } from '../src/shared/types/backlog'

const snapshot: BacklogPrintSnapshot = {
  scopeLabel: 'Current report',
  generatedAt: '2026-08-27T13:00:00.000Z',
  salesOrders: [
    {
      salesOrderInternalId: '10144',
      salesOrderNumber: 'SO10144',
      customerInternalId: '1578',
      customerName: 'WATERLOO - HAUSER COMPANY STORES',
      poNumber: 'PO-WITH-A-LONG-REFERENCE-45001',
      createdDate: '2026-08-20',
      dueDate: '2026-09-05',
      items: [
        {
          rowKey: '10144-1',
          lineId: '1',
          lineSequence: 1,
          itemInternalId: '44',
          item: 'CHAIR-WITH-A-LONG-SKU',
          itemDescription: 'A complete item description that must wrap without being truncated',
          paintDescription: 'Textured black powder coat description',
          fabricDescription: 'Full outdoor fabric description',
          quantity: 4,
          built: 2,
          painted: 1,
          workOrderInternalId: '900',
          workOrderNumber: 'SO10144-WO1449',
          workOrderStatus: 'Work Order : In Process'
        }
      ]
    }
  ]
}

describe('PrintableBacklogReport', () => {
  it('renders every item row expanded with all fourteen report columns', () => {
    const markup = renderToStaticMarkup(<PrintableBacklogReport snapshot={snapshot} />)

    expect(markup.match(/<th(?:\s|>)/g)).toHaveLength(14)
    expect(markup).toContain('CHAIR-WITH-A-LONG-SKU')
    expect(markup).toContain('A complete item description that must wrap without being truncated')
    expect(markup).toContain('Textured black powder coat description')
    expect(markup).toContain('Full outdoor fabric description')
    expect(markup).toContain('SO10144-WO1449')
    expect(markup).toContain('In Process')
    expect(markup).toContain('built-value--partial')
    expect(markup).not.toContain('column-resize-handle')
    expect(markup).not.toContain('Expand All')
  })

  it('prints the friendly store name without the company suffix while preserving other values', () => {
    const markup = renderToStaticMarkup(<PrintableBacklogReport snapshot={snapshot} />)

    expect(printableCustomerName('WATERLOO - HAUSER COMPANY STORES')).toBe('Waterloo')
    expect(printableCustomerName('BURLINGTON - HAUSER COMPANY STORES')).toBe('Burlington')
    expect(printableCustomerName('MAIN WAREHOUSE - HAUSER COMPANY STORES')).toBe(
      'Main Warehouse'
    )
    expect(markup).toContain('Waterloo')
    expect(markup).not.toContain('WATERLOO - HAUSER COMPANY STORES')
    expect(markup).toContain('PO-WITH-A-LONG-REFERENCE-45001')
  })
})
