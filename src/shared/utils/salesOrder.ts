export class InvalidSalesOrderNumberError extends Error {
  constructor() {
    super('Enter a Sales Order number such as 1234 or SO1234.')
    this.name = 'InvalidSalesOrderNumberError'
  }
}

export function normalizeSalesOrderNumber(input: string): string {
  const normalized = input.trim().toUpperCase()
  const match = /^(?:SO)?(\d+)$/.exec(normalized)

  if (!match?.[1]) {
    throw new InvalidSalesOrderNumberError()
  }

  return `SO${match[1]}`
}
