import { UnverifiedFieldMappingError } from '../errors'

export type MappingStatus = 'pending' | 'verify' | 'critical' | 'verified'

export type NetSuiteMappingKey =
  | 'customerInternalId'
  | 'customerName'
  | 'poNumber'
  | 'workOrderInternalId'
  | 'workOrderNumber'
  | 'salesOrderInternalId'
  | 'salesOrderNumber'
  | 'shipTo'
  | 'itemInternalId'
  | 'item'
  | 'itemDescription'
  | 'paintName'
  | 'fabricName'
  | 'quantity'
  | 'quantityShipped'
  | 'quantityRemaining'
  | 'createdDate'
  | 'dueDate'
  | 'workOrderStatus'
  | 'topLevelWorkOrderRelationship'
  | 'childWorkOrderRelationship'

export interface FieldMapping {
  status: MappingStatus
  note: string
  suiteQlExpression?: string
}

export type NetSuiteFieldMapping = Readonly<Record<NetSuiteMappingKey, FieldMapping>>

// Account-specific expressions intentionally remain absent until verified against
// the Hauser Records Catalog and existing backlog report.
export const NETSUITE_FIELD_MAPPING: NetSuiteFieldMapping = {
  customerInternalId: { status: 'verify', note: 'Verify customer entity internal ID.' },
  customerName: { status: 'pending', note: 'Verify customer entity display source.' },
  poNumber: { status: 'pending', note: 'Verify the customer PO/reference source.' },
  workOrderInternalId: { status: 'verify', note: 'Verify top-level Work Order internal ID.' },
  workOrderNumber: { status: 'verify', note: 'Verify Work Order transaction number.' },
  salesOrderInternalId: { status: 'verify', note: 'Verify Sales Order transaction internal ID.' },
  salesOrderNumber: { status: 'verify', note: 'Verify Sales Order transaction number.' },
  shipTo: { status: 'pending', note: 'Verify line-level versus header shipping source.' },
  itemInternalId: { status: 'verify', note: 'Verify item internal ID.' },
  item: { status: 'verify', note: 'Verify transaction-line item source.' },
  itemDescription: { status: 'pending', note: 'Verify description precedence.' },
  paintName: { status: 'pending', note: 'Custom Paint Name field ID is unknown.' },
  fabricName: { status: 'pending', note: 'Custom Fabric Name field ID is unknown.' },
  quantity: { status: 'pending', note: 'Verify quantity source and sign convention.' },
  quantityShipped: {
    status: 'pending',
    note: 'Verify shipped quantity source and sign convention.'
  },
  quantityRemaining: {
    status: 'pending',
    note: 'Verify source or approved ordered-minus-shipped calculation.'
  },
  createdDate: { status: 'pending', note: 'Verify meaning and source of Created Date.' },
  dueDate: { status: 'pending', note: 'Verify meaning and source of Due Date.' },
  workOrderStatus: { status: 'verify', note: 'Verify status code and display value.' },
  topLevelWorkOrderRelationship: {
    status: 'critical',
    note: 'Verify the Sales Order line to top-level Work Order relationship.'
  },
  childWorkOrderRelationship: {
    status: 'critical',
    note: 'Verify actual parent/created-from/transaction relationship; never match by SKU.'
  }
}

export function getUnverifiedMappingKeys(
  mapping: NetSuiteFieldMapping = NETSUITE_FIELD_MAPPING
): NetSuiteMappingKey[] {
  return (Object.keys(mapping) as NetSuiteMappingKey[]).filter((key) => {
    const entry = mapping[key]
    return entry.status !== 'verified' || !entry.suiteQlExpression?.trim()
  })
}

export function assertLiveFieldMappingsReady(
  mapping: NetSuiteFieldMapping = NETSUITE_FIELD_MAPPING
): void {
  const pending = getUnverifiedMappingKeys(mapping)
  if (pending.length > 0) throw new UnverifiedFieldMappingError(pending)
}
