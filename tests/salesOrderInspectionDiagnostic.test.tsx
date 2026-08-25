import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SalesOrderInspectionDiagnostic } from '../src/renderer/src/features/connection/SalesOrderInspectionDiagnostic'
import type { InspectSalesOrderResult } from '../src/shared/types/backlog'

describe('SalesOrderInspectionDiagnostic', () => {
  it('renders the approved header and raw transaction-line candidates', () => {
    const result: InspectSalesOrderResult = {
      success: true,
      httpStatus: 200,
      found: true,
      message: 'Sales Order SO1234 returned 1 transaction line.',
      configuredHauserCustomer: true,
      header: {
        salesOrderInternalId: '9001',
        salesOrderNumber: 'SO1234',
        customerInternalId: '5151',
        customerName: 'MAIN WAREHOUSE - HAUSER COMPANY STORES',
        poNumber: 'PO-88',
        transactionDate: '8/21/2026',
        createdDate: '8/20/2026',
        standardDueDate: null,
        hauserDueDate: '9/5/2026'
      },
      lines: [
        {
          lineId: '10',
          lineSequence: 1,
          itemInternalId: '301',
          item: 'CHAIR-01',
          descriptionCandidate: null,
          rawQuantityApiValue: '-4',
          rawQuantityApiType: 'string',
          normalizedQuantity: -4,
          reportQuantity: 4,
          closed: 'F',
          itemType: 'InvtPart'
        }
      ]
    }

    const markup = renderToStaticMarkup(<SalesOrderInspectionDiagnostic result={result} />)

    expect(markup).toContain('Sales Order inspection')
    expect(markup).toContain('Configured Hauser customer')
    expect(markup).toContain('<dd>Yes</dd>')
    expect(markup).toContain('Sales Order #')
    expect(markup).toContain('PO #')
    expect(markup).toContain('Created Date')
    expect(markup).toContain('Standard NetSuite Due Date')
    expect(markup).toContain('Hauser Due Date')
    expect(markup).toContain('Raw Quantity API Value')
    expect(markup).toContain('Raw Quantity API Type')
    expect(markup).toContain('Normalized Quantity')
    expect(markup).toContain('Report Quantity (-transactionLine.quantity)')
    expect(markup).toContain('<td>string</td>')
    expect(markup).not.toMatch(/Paint Replacement|Fabric Replacement|Create WO/i)
    expect(markup).toContain('<td>-4</td>')
    expect(markup).toContain('<td>4</td>')
    expect(markup).toContain('—')
    expect(markup).not.toMatch(/accessToken|refreshToken|authorization/i)
  })

  it('renders non-configured and not-found outcomes without hiding them', () => {
    const nonConfigured: InspectSalesOrderResult = {
      success: true,
      httpStatus: 200,
      found: true,
      message: 'Sales Order SO1234 returned 0 transaction lines.',
      configuredHauserCustomer: false,
      header: {
        salesOrderInternalId: '9001',
        salesOrderNumber: 'SO1234',
        customerInternalId: '5149',
        customerName: 'ONLINE - HAUSER COMPANY STORES',
        poNumber: null,
        transactionDate: null,
        createdDate: null,
        standardDueDate: null,
        hauserDueDate: null
      },
      lines: []
    }
    const notFound: InspectSalesOrderResult = {
      success: true,
      httpStatus: 200,
      found: false,
      message: 'Sales Order SO9999 was not found.',
      salesOrderNumber: 'SO9999'
    }

    expect(
      renderToStaticMarkup(<SalesOrderInspectionDiagnostic result={nonConfigured} />)
    ).toContain('<dd>No</dd>')
    expect(renderToStaticMarkup(<SalesOrderInspectionDiagnostic result={notFound} />)).toContain(
      'Sales Order SO9999 was not found.'
    )
  })

  it('renders only a sanitized failure contract', () => {
    const result: InspectSalesOrderResult = {
      success: false,
      httpStatus: 403,
      error: {
        code: 'permission',
        message:
          'The NetSuite role does not have permission to execute or access the requested SuiteQL data.',
        diagnostics: { stage: 'SALES_ORDER_QUERY' }
      }
    }

    const markup = renderToStaticMarkup(<SalesOrderInspectionDiagnostic result={result} />)

    expect(markup).toContain('Sales Order inspection failed')
    expect(markup).toContain('HTTP status: 403')
    expect(markup).toContain('SALES_ORDER_QUERY')
    expect(markup).not.toMatch(/accessToken|refreshToken|authorization/i)
  })
})
