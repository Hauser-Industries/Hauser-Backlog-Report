import { normalizeQuantity } from '@shared/utils/quantity'

import { UnverifiedFieldMappingError } from '../errors'

export type QuantitySignRule = 'as-returned' | 'invert' | 'absolute'

export type RemainingQuantityRule =
  { mode: 'source'; sign: QuantitySignRule } | { mode: 'ordered-minus-shipped' }

export interface VerifiedQuantityNormalization {
  verified: true
  orderedSign: QuantitySignRule
  shippedSign: QuantitySignRule
  remaining: RemainingQuantityRule
}

export interface NormalizedBacklogQuantities {
  quantity: number
  quantityShipped: number
  quantityRemaining: number
}

function parseExternalQuantity(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError('NetSuite quantity must be a number, numeric string, or empty value.')
  }

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new TypeError('NetSuite returned a non-numeric quantity.')
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

export function normalizeBacklogQuantities(
  raw: { ordered: unknown; shipped: unknown; remaining: unknown },
  rules?: VerifiedQuantityNormalization
): NormalizedBacklogQuantities {
  if (!rules?.verified) {
    throw new UnverifiedFieldMappingError([
      'quantity source/sign convention',
      'quantity shipped source/sign convention',
      'quantity remaining rule'
    ])
  }

  const quantity = applySign(parseExternalQuantity(raw.ordered), rules.orderedSign)
  const quantityShipped = applySign(parseExternalQuantity(raw.shipped), rules.shippedSign)
  const quantityRemaining =
    rules.remaining.mode === 'source'
      ? applySign(parseExternalQuantity(raw.remaining), rules.remaining.sign)
      : normalizeQuantity(quantity - quantityShipped)

  return { quantity, quantityShipped, quantityRemaining }
}
