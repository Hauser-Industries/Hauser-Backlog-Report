/**
 * Parses a scalar numeric value returned by NetSuite without treating missing or
 * malformed data as zero. The raw value should be retained separately whenever
 * this parser is used for diagnostics.
 */
export function parseNetSuiteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') return null

  const normalized = value.trim()
  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}
