import type { ConfiguredCustomer } from '../types/backlog'

export const ALL_CUSTOMERS_VALUE = 'all' as const
export const ALL_CUSTOMERS_LABEL = 'All Hauser Company Stores'

export const ALLOWED_CUSTOMERS = [
  'MAIN WAREHOUSE - HAUSER COMPANY STORES',
  'INTERNET - HAUSER COMPANY STORES',
  'WATERLOO - HAUSER COMPANY STORES',
  'OTTAWA - HAUSER COMPANY STORES',
  'LONDON - HAUSER COMPANY STORES',
  'BURLINGTON - HAUSER COMPANY STORES'
] as const

export type AllowedCustomerName = (typeof ALLOWED_CUSTOMERS)[number]

// Internal IDs intentionally remain unset until they are verified in the Hauser account.
export const CONFIGURED_CUSTOMERS: readonly ConfiguredCustomer[] = ALLOWED_CUSTOMERS.map(
  (name) => ({ name })
)

export function isAllowedCustomer(name: string): name is AllowedCustomerName {
  return (ALLOWED_CUSTOMERS as readonly string[]).includes(name)
}
