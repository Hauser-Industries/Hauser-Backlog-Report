export class InvalidSalesOrderNumberError extends Error {
  constructor() {
    super('Enter a Sales Order number such as 1234 or SO1234.')
    this.name = 'InvalidSalesOrderNumberError'
  }
}

const NORMALIZED_SALES_ORDER_PATTERN = /^SO[0-9]+$/

export function normalizeSalesOrderNumber(input: string): string {
  const trimmed = input.trim().toUpperCase()
  const normalized = /^[0-9]+$/.test(trimmed) ? `SO${trimmed}` : trimmed

  if (!NORMALIZED_SALES_ORDER_PATTERN.test(normalized)) {
    throw new InvalidSalesOrderNumberError()
  }

  return normalized
}
