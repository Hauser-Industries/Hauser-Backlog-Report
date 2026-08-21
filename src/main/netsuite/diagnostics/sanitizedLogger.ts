import log from 'electron-log/main'

const SENSITIVE_KEY = /authorization|token|secret|code_verifier|codeverifier|refresh|password/i
const SENSITIVE_TEXT = /(bearer\s+)[^\s,;]+|((?:access|refresh)_token["'\s:=]+)[^\s,"'}]+/gi

export type DiagnosticValue = string | number | boolean | null
export type DiagnosticDetails = Readonly<Record<string, DiagnosticValue>>

export interface DiagnosticLogger {
  debug(message: string, details?: DiagnosticDetails): void
  info(message: string, details?: DiagnosticDetails): void
  warn(message: string, details?: DiagnosticDetails): void
  error(message: string, details?: DiagnosticDetails): void
}

function redactText(value: string): string {
  return value.replace(SENSITIVE_TEXT, '$1$2[REDACTED]')
}

function sanitizeDetails(details?: DiagnosticDetails): Record<string, DiagnosticValue> {
  if (!details) return {}

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : typeof value === 'string' ? redactText(value) : value
    ])
  )
}

function safeMessage(message: string): string {
  return redactText(message)
}

export const netSuiteDiagnosticLogger: DiagnosticLogger = {
  debug(message, details) {
    log.debug(`[NetSuite] ${safeMessage(message)}`, sanitizeDetails(details))
  },
  info(message, details) {
    log.info(`[NetSuite] ${safeMessage(message)}`, sanitizeDetails(details))
  },
  warn(message, details) {
    log.warn(`[NetSuite] ${safeMessage(message)}`, sanitizeDetails(details))
  },
  error(message, details) {
    log.error(`[NetSuite] ${safeMessage(message)}`, sanitizeDetails(details))
  }
}

export function describeErrorSafely(error: unknown): string {
  if (error instanceof Error) return safeMessage(`${error.name}: ${error.message}`)
  return 'Unknown error'
}
