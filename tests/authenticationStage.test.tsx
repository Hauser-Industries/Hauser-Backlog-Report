import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AuthenticationStage } from '../src/renderer/src/features/connection/AuthenticationStage'
import type {
  ConnectionStatus,
  ResolveCustomerIdsResult,
  SuiteQlTestResult
} from '../src/shared/types/backlog'

const configuration = {
  accountId: '3850367_SB1',
  suiteTalkUrl: 'https://3850367-sb1.suitetalk.api.netsuite.com',
  clientId: 'c5dd9741a779dbfe50d63939f326b2a3a5b119b4a5b0034d362825e7eec76ce4',
  redirectUri: 'hauser-backlog://oauth/callback',
  scope: 'rest_webservices'
}

function render(
  status: ConnectionStatus,
  options: {
    busy?: boolean
    suiteQlBusy?: boolean
    suiteQlResult?: SuiteQlTestResult | null
    customerResolutionBusy?: boolean
    customerResolutionResult?: ResolveCustomerIdsResult | null
    errorMessage?: string | null
    startupGate?: boolean
  } = {}
): string {
  return renderToStaticMarkup(
    <AuthenticationStage
      status={status}
      busy={options.busy ?? false}
      suiteQlBusy={options.suiteQlBusy ?? false}
      suiteQlResult={options.suiteQlResult ?? null}
      customerResolutionBusy={options.customerResolutionBusy ?? false}
      customerResolutionResult={options.customerResolutionResult ?? null}
      salesOrderInspectionInput=""
      salesOrderInspectionValidation={null}
      salesOrderInspectionBusy={false}
      salesOrderInspectionResult={null}
      environmentBusy={false}
      errorMessage={options.errorMessage ?? null}
      {...(options.startupGate === undefined ? {} : { startupGate: options.startupGate })}
      onSignIn={() => undefined}
      onSignOut={() => undefined}
      onTestConnection={() => undefined}
      onTestSuiteQl={() => undefined}
      onResolveCustomerIds={() => undefined}
      onSalesOrderInspectionInputChange={() => undefined}
      onInspectSalesOrder={() => undefined}
      onEnvironmentChange={() => undefined}
    />
  )
}

describe('AuthenticationStage', () => {
  it('shows the first-test sign-in action and required NetSuite role', () => {
    const markup = render({
      dataSource: 'live',
      configured: true,
      authenticated: false,
      indicator: 'authentication-required',
      accountLabel: configuration.accountId,
      configuration
    })

    expect(markup).toContain('Authentication Required')
    expect(markup).toContain('Sign in to NetSuite')
    expect(markup).toContain('Hauser Backlog Report API')
    expect(markup).not.toContain('accessToken')
    expect(markup).not.toContain('refreshToken')
  })

  it('shows NetSuite Connected and every packaged public value', () => {
    const markup = render({
      dataSource: 'live',
      configured: true,
      authenticated: true,
      indicator: 'connected',
      environment: 'sandbox',
      accountLabel: configuration.accountId,
      configuration,
      message: 'NetSuite REST connection successful.'
    })

    expect(markup).toContain('NetSuite Connected')
    expect(markup).toContain('NetSuite REST connection successful.')
    expect(markup).toContain('Test Connection')
    expect(markup).toContain('Test SuiteQL')
    expect(markup).toContain('Resolve Customer IDs')
    expect(markup).toContain('>Sales Order</span>')
    expect(markup).toContain('Inspect Sales Order')
    expect(markup).toContain('SANDBOX')
    for (const value of Object.values(configuration)) expect(markup).toContain(value)
  })

  it('shows a prominent production indicator beside diagnostic actions', () => {
    const markup = render({
      dataSource: 'live',
      environment: 'production',
      configured: true,
      authenticated: true,
      indicator: 'connected',
      accountLabel: '3850367',
      configuration: {
        accountId: '3850367',
        suiteTalkUrl: 'https://3850367.suitetalk.api.netsuite.com',
        clientId: '88d0b33f1eba93684c2672ad145b17eec09deb41de3c019ea606bd805c8bd393',
        redirectUri: 'hauser-backlog://oauth/callback',
        scope: 'rest_webservices'
      }
    })

    expect(markup).toContain('netsuite-environment-badge--production')
    expect(markup.match(/PRODUCTION/g)?.length).toBeGreaterThanOrEqual(2)
    expect(markup).toContain('live company data')
    expect(markup).toContain('Test Connection')
    expect(markup).toContain('Test SuiteQL')
    expect(markup).toContain('Resolve Customer IDs')
  })

  it('shows a sanitized HTTP failure and disables duplicate tests while busy', () => {
    const markup = render(
      {
        dataSource: 'live',
        configured: true,
        authenticated: true,
        indicator: 'connection-error',
        accountLabel: configuration.accountId,
        configuration,
        message: 'The selected NetSuite role does not have permission.'
      },
      {
        busy: true,
        errorMessage:
          'HTTP 403: The selected NetSuite role does not have permission to access REST Web Services metadata.'
      }
    )

    expect(markup).toContain('HTTP 403')
    expect(markup).toContain('role does not have permission')
    expect(markup).toContain('Testing')
    expect(markup).toContain('disabled=""')
  })

  it('disables both diagnostics and shows SuiteQL progress independently', () => {
    const markup = render(
      {
        dataSource: 'live',
        configured: true,
        authenticated: true,
        indicator: 'connected',
        accountLabel: configuration.accountId,
        configuration
      },
      { suiteQlBusy: true }
    )

    expect(markup).toContain('Testing SuiteQL')
    expect(markup.match(/disabled=""/g)).toHaveLength(7)
    expect(markup).toContain('Test Connection')
  })

  it('keeps an existing token behind the launch authorization gate after a denial', () => {
    const markup = render(
      {
        dataSource: 'live',
        environment: 'production',
        configured: true,
        authenticated: true,
        indicator: 'authentication-required',
        startupAuthorization: 'denied',
        accountLabel: '3850367',
        configuration,
        message:
          'NetSuite authorization was denied. The report remains locked until you approve access.'
      },
      { startupGate: true }
    )

    expect(markup).toContain('Authorization Denied')
    expect(markup).toContain('Sign in to NetSuite')
    expect(markup).toContain('Hauser Backlog Report API')
    expect(markup).not.toContain('Test Connection')
  })
})
