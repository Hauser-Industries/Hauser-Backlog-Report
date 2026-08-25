import { normalizeQuantity } from '@shared/utils/quantity'

import { UnverifiedFieldMappingError } from '../errors'
import { parseNetSuiteNumber } from './netSuiteNumber'

export type QuantitySignRule = 'as-returned' | 'invert' | 'absolute'

export interface VerifiedQuantityNormalization {
  verified: true
  orderedSign: QuantitySignRule
}

function parseExternalQuantity(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const parsed = parseNetSuiteNumber(value)
  if (parsed === null) throw new TypeError('NetSuite returned a non-numeric quantity.')
  return normalizeQuantity(parsed)
}

function applySign(value: number, rule: QuantitySignRule): number {
  if (rule === 'invert') return normalizeQuantity(-value)
  if (rule === 'absolute') return normalizeQuantity(Math.abs(value))
  return normalizeQuantity(value)
}

export function normalizeOptionalQuantity(
  value: unknown,
  sign: QuantitySignRule
): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  return applySign(parseExternalQuantity(value), sign)
}

export function normalizeBacklogQuantity(
  raw: unknown,
  rules?: VerifiedQuantityNormalization
): number {
  if (!rules?.verified) {
    throw new UnverifiedFieldMappingError(['quantity source/sign convention'])
  }
  return applySign(parseExternalQuantity(raw), rules.orderedSign)
}

/** Shared by the live report and the proven Sales Order inspector. */
export function normalizeSalesOrderReportQuantity(
  raw: unknown,
  rules: VerifiedQuantityNormalization
): number | null {
  if (!rules.verified) {
    throw new UnverifiedFieldMappingError(['quantity source/sign convention'])
  }
  const parsed = parseNetSuiteNumber(raw)
  return parsed === null ? null : applySign(parsed, rules.orderedSign)
}
