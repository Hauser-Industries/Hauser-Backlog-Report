import type { NetSuitePublicConfiguration } from '@shared/types/backlog'

interface NetSuiteConfigurationDetailsProps {
  configuration: NetSuitePublicConfiguration
}

export function NetSuiteConfigurationDetails({ configuration }: NetSuiteConfigurationDetailsProps) {
  const entries = [
    ['accountId', configuration.accountId],
    ['suiteTalkUrl', configuration.suiteTalkUrl],
    ['clientId', configuration.clientId],
    ['redirectUri', configuration.redirectUri],
    ['scope', configuration.scope]
  ] as const

  return (
    <dl className="netsuite-config-details" aria-label="Packaged NetSuite configuration">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
