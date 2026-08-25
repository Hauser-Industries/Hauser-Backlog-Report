import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ConnectionPanel } from '../src/renderer/src/features/connection/ConnectionPanel'
import type { ConnectionStatus, SuiteQlTestResult } from '../src/shared/types/backlog'

const connectedStatus: ConnectionStatus = {
  dataSource: 'live',
  configured: true,
  authenticated: true,
  indicator: 'connected',
  environment: 'sandbox',
  accountLabel: '3850367_SB1',
  message: 'NetSuite REST connection successful.'
}

function render(result: SuiteQlTestResult | null, suiteQlBusy = false): string {
  return renderToStaticMarkup(
    <ConnectionPanel
      status={connectedStatus}
      busy={false}
      suiteQlBusy={suiteQlBusy}
      suiteQlResult={result}
      customerResolutionBusy={false}
      customerResolutionResult={null}
      salesOrderInspectionInput=""
      salesOrderInspectionValidation={null}
      salesOrderInspectionBusy={false}
      salesOrderInspectionResult={null}
      environmentBusy={false}
      onSignIn={() => undefined}
      onSignOut={() => undefined}
      onTestConnection={() => undefined}
      onTestSuiteQl={() => undefined}
      onResolveCustomerIds={() => undefined}
      onSalesOrderInspectionInputChange={() => undefined}
      onInspectSalesOrder={() => undefined}
      onEnvironmentChange={() => undefined}
      onClose={() => undefined}
    />
  )
}

describe('ConnectionPanel SuiteQL diagnostic', () => {
  it('keeps the working REST action and adds the SuiteQL action to NetSuite Connection', () => {
    const markup = render(null)
    const restButtonPosition = markup.indexOf('Test Connection')
    const suiteQlButtonPosition = markup.indexOf('Test SuiteQL')
    const signOutPosition = markup.indexOf('Sign out')

    expect(markup).toContain('NetSuite Connection')
    expect(markup).toContain('NetSuite REST connection successful.')
    expect(restButtonPosition).toBeGreaterThan(-1)
    expect(suiteQlButtonPosition).toBeGreaterThan(restButtonPosition)
    expect(signOutPosition).toBeGreaterThan(suiteQlButtonPosition)
    expect(markup).toContain('Resolve Customer IDs')
    expect(markup).toContain('>Sales Order</span>')
    expect(markup).toContain('Inspect Sales Order')
  })

  it('keeps Test SuiteQL visibly rendered when authentication is unavailable', () => {
    const markup = renderToStaticMarkup(
      <ConnectionPanel
        status={{
          dataSource: 'live',
          configured: true,
          authenticated: false,
          indicator: 'authentication-required'
        }}
        busy={false}
        suiteQlBusy={false}
        suiteQlResult={null}
        customerResolutionBusy={false}
        customerResolutionResult={null}
        salesOrderInspectionInput=""
        salesOrderInspectionValidation={null}
        salesOrderInspectionBusy={false}
        salesOrderInspectionResult={null}
        environmentBusy={false}
        onSignIn={() => undefined}
        onSignOut={() => undefined}
        onTestConnection={() => undefined}
        onTestSuiteQl={() => undefined}
        onResolveCustomerIds={() => undefined}
        onSalesOrderInspectionInputChange={() => undefined}
        onInspectSalesOrder={() => undefined}
        onEnvironmentChange={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(markup).toContain('Test Connection')
    expect(markup).toContain('Test SuiteQL')
    expect(markup).toContain('Resolve Customer IDs')
    expect(markup).toContain('Inspect Sales Order')
    expect(markup).toContain('Sign in to NetSuite')
    expect(markup.match(/disabled=""/g)).toHaveLength(5)
  })

  it('shows SuiteQL progress and its sanitized diagnostic result in the panel', () => {
    const markup = render(
      {
        success: true,
        httpStatus: 200,
        message: 'SuiteQL connection successful.',
        count: 1,
        totalResults: 24,
        hasMore: true,
        items: [{ id: '123', entityid: 'Customer A' }]
      },
      true
    )

    expect(markup).toContain('Testing SuiteQL')
    expect(markup).toContain('SuiteQL connection successful.')
    expect(markup).toContain('Customer A')
    expect(markup).toContain('disabled=""')
    expect(markup).not.toMatch(/accessToken|refreshToken|authorization/i)
  })
})
