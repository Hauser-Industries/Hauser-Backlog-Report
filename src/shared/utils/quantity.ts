const QUANTITY_PRECISION = 6

export function normalizeQuantity(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0

  return Number(parsed.toFixed(QUANTITY_PRECISION))
}

export function calculateQuantityRemaining(ordered: number, shipped: number): number {
  return normalizeQuantity(normalizeQuantity(ordered) - normalizeQuantity(shipped))
}

export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return new Intl.NumberFormat('en-CA', {
    maximumFractionDigits: QUANTITY_PRECISION
  }).format(normalizeQuantity(value))
}
