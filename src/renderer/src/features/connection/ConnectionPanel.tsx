import type {
  ConnectionStatus,
  InspectSalesOrderResult,
  NetSuiteEnvironment,
  ResolveCustomerIdsResult,
  SuiteQlTestResult
} from '@shared/types/backlog'
import { CustomerResolutionDiagnostic } from './CustomerResolutionDiagnostic'
import { NetSuiteConfigurationDetails } from './NetSuiteConfigurationDetails'
import { NetSuiteEnvironmentControl } from './NetSuiteEnvironmentControl'
import { SalesOrderInspectionControls } from './SalesOrderInspectionControls'
import { SalesOrderInspectionDiagnostic } from './SalesOrderInspectionDiagnostic'
import { SuiteQlDiagnostic } from './SuiteQlDiagnostic'

interface ConnectionPanelProps {
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
  onSignIn: () => void
  onSignOut: () => void
  onTestConnection: () => void
  onTestSuiteQl: () => void
  onResolveCustomerIds: () => void
  onSalesOrderInspectionInputChange: (value: string) => void
  onInspectSalesOrder: () => void
  onEnvironmentChange: (environment: NetSuiteEnvironment) => void
  onClose: () => void
}

function readableIndicator(status: ConnectionStatus): string {
  switch (status.indicator) {
    case 'mock-data':
      return 'Mock Data'
    case 'connected':
      return 'Connected'
    case 'disconnected':
      return 'Disconnected'
    case 'authentication-required':
      return 'Authentication Required'
    case 'connection-error':
      return 'Connection Error'
  }
}

export function ConnectionPanel({
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
  onSignIn,
  onSignOut,
  onTestConnection,
  onTestSuiteQl,
  onResolveCustomerIds,
  onSalesOrderInspectionInputChange,
  onInspectSalesOrder,
  onEnvironmentChange,
  onClose
}: ConnectionPanelProps) {
  const isMock = status.dataSource === 'mock'
  const controlsBusy =
    busy || suiteQlBusy || customerResolutionBusy || salesOrderInspectionBusy || environmentBusy

  return (
    <aside className="connection-panel" aria-label="Connection settings">
      <div className="connection-panel__header">
        <div>
          <p className="eyebrow">Application connection</p>
          <h2>NetSuite Connection</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close connection settings"
        >
          ×
        </button>
      </div>

      <NetSuiteEnvironmentControl
        environment={status.environment ?? 'sandbox'}
        controlId="panel-netsuite-environment"
        busy={environmentBusy}
        disabled={isMock || !status.configured || (controlsBusy && !environmentBusy)}
        onChange={onEnvironmentChange}
      />

      <dl className="connection-details">
        <div>
          <dt>Data Source</dt>
          <dd>{status.dataSource === 'mock' ? 'Mock' : 'Live'}</dd>
        </div>
        <div>
          <dt>NetSuite Account</dt>
          <dd>{status.configured ? status.accountLabel || 'Configured' : 'Not Configured'}</dd>
        </div>
        <div>
          <dt>Authentication</dt>
          <dd>{status.authenticated ? 'Signed In' : 'Signed Out'}</dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>{readableIndicator(status)}</dd>
        </div>
      </dl>

      {status.configuration ? (
        <NetSuiteConfigurationDetails configuration={status.configuration} />
      ) : null}

      {status.message ? <p className="connection-panel__message">{status.message}</p> : null}
      {isMock ? (
        <p className="connection-panel__note">
          This installation is using demonstration data. Live controls become available after the
          account and field mappings are configured.
        </p>
      ) : !status.authenticated ? (
        <p className="connection-panel__note">
          If prompted for a role, choose <strong>Hauser Backlog Report API</strong>.
        </p>
      ) : null}

      <div className="connection-panel__actions">
        <button
          className="button button--primary"
          type="button"
          onClick={onTestConnection}
          disabled={controlsBusy || isMock || !status.authenticated}
        >
          Test Connection
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onTestSuiteQl}
          disabled={controlsBusy || isMock || !status.authenticated}
        >
          {suiteQlBusy ? 'Testing SuiteQL…' : 'Test SuiteQL'}
        </button>
        {status.authenticated ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={onSignOut}
            disabled={controlsBusy || isMock}
          >
            Sign out
          </button>
        ) : (
          <button
            className="button button--secondary"
            type="button"
            onClick={onSignIn}
            disabled={controlsBusy || isMock}
          >
            Sign in to NetSuite
          </button>
        )}
        <button
          className="button button--secondary connection-panel__action--wide"
          type="button"
          onClick={onResolveCustomerIds}
          disabled={controlsBusy || isMock || !status.authenticated}
        >
          {customerResolutionBusy ? 'Resolving Customer IDs…' : 'Resolve Customer IDs'}
        </button>
      </div>

      <SalesOrderInspectionControls
        controlId="panel-sales-order-inspection"
        value={salesOrderInspectionInput}
        validationMessage={salesOrderInspectionValidation}
        busy={salesOrderInspectionBusy}
        disabled={controlsBusy || isMock || !status.authenticated}
        onChange={onSalesOrderInspectionInputChange}
        onInspect={onInspectSalesOrder}
      />

      <SuiteQlDiagnostic result={suiteQlResult} />
      <CustomerResolutionDiagnostic result={customerResolutionResult} />
      <SalesOrderInspectionDiagnostic result={salesOrderInspectionResult} />
    </aside>
  )
}
