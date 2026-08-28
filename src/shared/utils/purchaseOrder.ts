const MAX_PURCHASE_ORDER_LENGTH = 80
const SUITEQL_COMMENT_OR_SEPARATOR = /;|--|\/\*/

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export class InvalidPurchaseOrderNumberError extends Error {
  constructor() {
    super('Enter a valid Purchase Order number.')
    this.name = 'InvalidPurchaseOrderNumberError'
  }
}

export function normalizePurchaseOrderNumber(input: string): string {
  const normalized = input.trim().toUpperCase()
  if (
    normalized.length === 0 ||
    normalized.length > MAX_PURCHASE_ORDER_LENGTH ||
    hasControlCharacter(normalized) ||
    SUITEQL_COMMENT_OR_SEPARATOR.test(normalized)
  ) {
    throw new InvalidPurchaseOrderNumberError()
  }
  return normalized
}
