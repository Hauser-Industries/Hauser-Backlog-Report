export type NetSuiteErrorCode =
  | 'not-configured'
  | 'field-mapping-pending'
  | 'authentication-required'
  | 'authentication-failed'
  | 'permission-denied'
  | 'rate-limited'
  | 'network-error'
  | 'request-timeout'
  | 'request-cancelled'
  | 'invalid-query'
  | 'response-validation'
  | 'api-error'
  | 'hierarchy-error'

interface NetSuiteIntegrationErrorOptions {
  code: NetSuiteErrorCode
  retryable?: boolean
  status?: number
  cause?: unknown
}

export class NetSuiteIntegrationError extends Error {
  readonly code: NetSuiteErrorCode
  readonly retryable: boolean
  readonly status?: number

  constructor(message: string, options: NetSuiteIntegrationErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'NetSuiteIntegrationError'
    this.code = options.code
    this.retryable = options.retryable ?? false
    if (options.status !== undefined) this.status = options.status
  }
}

export class NetSuiteConfigurationError extends NetSuiteIntegrationError {
  constructor(message = 'NetSuite has not been configured for this installation.') {
    super(message, { code: 'not-configured' })
    this.name = 'NetSuiteConfigurationError'
  }
}

export class UnverifiedFieldMappingError extends NetSuiteIntegrationError {
  readonly pendingFields: readonly string[]

  constructor(pendingFields: readonly string[]) {
    super(
      `Live NetSuite reporting is waiting for verified field mappings: ${pendingFields.join(', ')}.`,
      { code: 'field-mapping-pending' }
    )
    this.name = 'UnverifiedFieldMappingError'
    this.pendingFields = pendingFields
  }
}

export class NetSuiteAuthenticationRequiredError extends NetSuiteIntegrationError {
  constructor(message = 'NetSuite authentication is required.') {
    super(message, { code: 'authentication-required' })
    this.name = 'NetSuiteAuthenticationRequiredError'
  }
}
