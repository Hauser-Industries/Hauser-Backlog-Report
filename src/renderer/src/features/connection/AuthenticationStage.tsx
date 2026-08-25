import type {
  ConnectionStatus,
  InspectSalesOrderResult,
  NetSuiteEnvironment,
  ResolveCustomerIdsResult,
  SuiteQlTestResult
} from '@shared/types/backlog'
import { AlertIcon } from '../../components/icons'
import { CustomerResolutionDiagnostic } from './CustomerResolutionDiagnostic'
import { NetSuiteConfigurationDetails } from './NetSuiteConfigurationDetails'
import { NetSuiteEnvironmentControl } from './NetSuiteEnvironmentControl'
import { SalesOrderInspectionControls } from './SalesOrderInspectionControls'
import { SalesOrderInspectionDiagnostic } from './SalesOrderInspectionDiagnostic'
import { SuiteQlDiagnostic } from './SuiteQlDiagnostic'

interface AuthenticationStageProps {
  status: ConnectionStatus
  busy: boolean
  suiteQlBusy: boolean
  suiteQlResult: SuiteQlTestResult | null
  customerResolutionBusy: boolean
  customerResolutionResult: ResolveCustomerIdsResult | null
  salesOrderInspectionInput: string
  salesOrderInspectionValidation: string | null
  salesOrderInspectionBusy: boolean
  salesOrderInspectionResult: InspectSalesOrderResult | null
  environmentBusy: boolean
  errorMessage: string | null
  onSignIn: () => void
  onSignOut: () => void
  onTestConnection: () => void
  onTestSuiteQl: () => void
  onResolveCustomerIds: () => void
  onSalesOrderInspectionInputChange: (value: string) => void
  onInspectSalesOrder: () => void
  onEnvironmentChange: (environment: NetSuiteEnvironment) => void
}

function authenticationHeading(status: ConnectionStatus): string {
  if (status.indicator === 'connected') return 'NetSuite Connected'
  if (status.indicator === 'connection-error') return 'NetSuite Connection Error'
  if (status.authenticated) return 'NetSuite Authenticated'
  return 'Authentication Required'
}

export function AuthenticationStage({
  status,
  busy,
  suiteQlBusy,
  suiteQlResult,
  customerResolutionBusy,
  customerResolutionResult,
  salesOrderInspectionInput,
  salesOrderInspectionValidation,
  salesOrderInspectionBusy,
  salesOrderInspectionResult,
  environmentBusy,
  errorMessage,
  onSignIn,
  onSignOut,
  onTestConnection,
  onTestSuiteQl,
  onResolveCustomerIds,
  onSalesOrderInspectionInputChange,
  onInspectSalesOrder,
  onEnvironmentChange
}: AuthenticationStageProps) {
  const connected = status.indicator === 'connected'
  const controlsBusy =
    busy || suiteQlBusy || customerResolutionBusy || salesOrderInspectionBusy || environmentBusy

  return (
    <section className="authentication-stage" aria-live="polite">
      <div className="authentication-card">
        <div
          className={`authentication-card__status authentication-card__status--${status.indicator}`}
        >
          <span aria-hidden="true" />
          {connected ? 'Connected' : status.authenticated ? 'Authenticated' : 'Sign-in required'}
        </div>

        <p className="eyebrow">NetSuite</p>
        <h2>{authenticationHeading(status)}</h2>
        <p className="authentication-card__message">
          {status.message ?? 'Sign in with the NetSuite role assigned to this application.'}
        </p>

        <NetSuiteEnvironmentControl
          environment={status.environment ?? 'sandbox'}
          controlId="authentication-netsuite-environment"
          busy={environmentBusy}
          disabled={!status.configured || (controlsBusy && !environmentBusy)}
          onChange={onEnvironmentChange}
        />

        {errorMessage ? (
          <div className="authentication-card__error" role="alert">
            <AlertIcon />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {!status.authenticated ? (
          <p className="authentication-card__role">
            If NetSuite asks you to select a role, choose <strong>Hauser Backlog Report API</strong>
            .
          </p>
        ) : null}

        {status.configuration ? (
          <NetSuiteConfigurationDetails configuration={status.configuration} />
        ) : null}

        <div className="authentication-card__actions">
          {!status.authenticated ? (
            <button
              className="button button--primary"
              type="button"
              onClick={onSignIn}
              disabled={controlsBusy}
            >
              {busy ? 'Opening NetSuite…' : 'Sign in to NetSuite'}
            </button>
          ) : (
            <>
              <button
                className="button button--primary"
                type="button"
                onClick={onTestConnection}
                disabled={controlsBusy}
              >
                {busy ? 'Testing…' : 'Test Connection'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={onTestSuiteQl}
                disabled={controlsBusy}
              >
                {suiteQlBusy ? 'Testing SuiteQL…' : 'Test SuiteQL'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={onSignOut}
                disabled={controlsBusy}
              >
                Sign out
              </button>
              <button
                className="button button--secondary authentication-card__action--wide"
                type="button"
                onClick={onResolveCustomerIds}
                disabled={controlsBusy}
              >
                {customerResolutionBusy ? 'Resolving Customer IDs…' : 'Resolve Customer IDs'}
              </button>
            </>
          )}
        </div>

        {status.authenticated ? (
          <SalesOrderInspectionControls
            controlId="authentication-sales-order-inspection"
            value={salesOrderInspectionInput}
            validationMessage={salesOrderInspectionValidation}
            busy={salesOrderInspectionBusy}
            disabled={controlsBusy}
            onChange={onSalesOrderInspectionInputChange}
            onInspect={onInspectSalesOrder}
          />
        ) : null}

        <SuiteQlDiagnostic result={suiteQlResult} />
        <CustomerResolutionDiagnostic result={customerResolutionResult} />
        <SalesOrderInspectionDiagnostic result={salesOrderInspectionResult} />

        <p className="authentication-card__footnote">
          Authentication uses your default browser and returns through
          {' hauser-backlog://oauth/callback'}. No local web server is started.
        </p>
      </div>
    </section>
  )
}
