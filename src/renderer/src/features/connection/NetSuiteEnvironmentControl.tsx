import type { NetSuiteEnvironment } from '@shared/types/backlog'

interface NetSuiteEnvironmentControlProps {
  environment: NetSuiteEnvironment
  controlId: string
  busy: boolean
  disabled: boolean
  onChange: (environment: NetSuiteEnvironment) => void
}

export function NetSuiteEnvironmentControl({
  environment,
  controlId,
  busy,
  disabled,
  onChange
}: NetSuiteEnvironmentControlProps) {
  const label = environment.toUpperCase()

  return (
    <section
      className={`netsuite-environment-control netsuite-environment-control--${environment}`}
      aria-label="Active NetSuite environment"
    >
      <div>
        <span>Active environment</span>
        <strong className={`netsuite-environment-badge netsuite-environment-badge--${environment}`}>
          {busy ? 'SWITCHING…' : label}
        </strong>
      </div>
      <label htmlFor={controlId}>
        <span>Connect to</span>
        <select
          id={controlId}
          value={environment}
          disabled={disabled || busy}
          onChange={(event) => onChange(event.target.value as NetSuiteEnvironment)}
        >
          <option value="sandbox">SANDBOX</option>
          <option value="production">PRODUCTION</option>
        </select>
      </label>
      {environment === 'production' ? (
        <p>PRODUCTION contains live company data. Diagnostics are read-only.</p>
      ) : (
        <p>SANDBOX test account. Its authentication is isolated from production.</p>
      )}
    </section>
  )
}
