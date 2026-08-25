import log from 'electron-log/main'

const SENSITIVE_KEY =
  /authorization|token|secret|code_verifier|codeverifier|refresh|password|^(?:code|state)$/i

export type DiagnosticValue = string | number | boolean | null
export type DiagnosticDetails = Readonly<Record<string, DiagnosticValue>>

export interface DiagnosticLogger {
  debug(message: string, details?: DiagnosticDetails): void
  info(message: string, details?: DiagnosticDetails): void
  warn(message: string, details?: DiagnosticDetails): void
  error(message: string, details?: DiagnosticDetails): void
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/authorization\s*:\s*bearer\s+[^\s,;]+/gi, '[REDACTED]')
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:access|refresh)_token["'\s:=]+)[^\s,"'}]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:code|state|code_verifier)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(\bcode_verifier\s*=\s*)[^&\s]+/gi, '$1[REDACTED]')
}

export function sanitizeDiagnosticText(
  value: string,
  maximumLength: number,
  sensitiveValues: readonly string[] = []
): string {
  const scrubbed = sensitiveValues.reduce(
    (current, sensitiveValue) =>
      sensitiveValue ? current.replaceAll(sensitiveValue, '[REDACTED]') : current,
    value
  )
  const withoutControlCharacters = Array.from(redactSensitiveText(scrubbed), (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127 ? ' ' : character
  }).join('')

  return withoutControlCharacters.replace(/\s+/g, ' ').trim().slice(0, maximumLength)
}

function sanitizeDetails(details?: DiagnosticDetails): Record<string, DiagnosticValue> {
  if (!details) return {}

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key)
        ? '[REDACTED]'
        : typeof value === 'string'
          ? redactSensitiveText(value)
          : value
    ])
  )
}

function safeMessage(message: string): string {
  return redactSensitiveText(message)
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
