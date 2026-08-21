import type { ConnectionStatus } from '@shared/types/backlog'

interface ConnectionPanelProps {
  status: ConnectionStatus
  busy: boolean
  onSignIn: () => void
  onSignOut: () => void
  onTestConnection: () => void
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
  onSignIn,
  onSignOut,
  onTestConnection,
  onClose
}: ConnectionPanelProps) {
  const isMock = status.dataSource === 'mock'

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

      {status.message ? <p className="connection-panel__message">{status.message}</p> : null}
      {isMock ? (
        <p className="connection-panel__note">
          This installation is using demonstration data. Live controls become available after the
          account and field mappings are configured.
        </p>
      ) : null}

      <div className="connection-panel__actions">
        {status.authenticated ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={onSignOut}
            disabled={busy || isMock}
          >
            Sign out
          </button>
        ) : (
          <button
            className="button button--primary"
            type="button"
            onClick={onSignIn}
            disabled={busy || isMock}
          >
            Sign in to NetSuite
          </button>
        )}
        <button
          className="button button--secondary"
          type="button"
          onClick={onTestConnection}
          disabled={busy || isMock}
        >
          Test Connection
        </button>
      </div>
    </aside>
  )
}
