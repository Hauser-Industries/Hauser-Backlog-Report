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
  | 'createdDate'
  | 'dueDate'
  | 'workOrderStatus'
  | 'topLevelWorkOrderRelationship'

export interface FieldMapping {
  status: MappingStatus
  note: string
  suiteQlExpression?: string
}

export type NetSuiteFieldMapping = Readonly<Record<NetSuiteMappingKey, FieldMapping>>

// Only supplied or live-observed account expressions are recorded here. A `verify`
// entry still blocks production backlog loading until its report semantics are reconciled.
export const NETSUITE_FIELD_MAPPING: NetSuiteFieldMapping = {
  customerInternalId: {
    status: 'verified',
    suiteQlExpression: 't.entity',
    note: 'Customer internal IDs were resolved independently for each environment.'
  },
  customerName: {
    status: 'verified',
    suiteQlExpression: 'BUILTIN.DF(t.entity)',
    note: 'Basic Sales Order query returns the customer display value.'
  },
  poNumber: {
    status: 'verify',
    suiteQlExpression: 't.otherrefnum',
    note: 'Retrieved by the diagnostic; additional Sales Order spot-checks remain.'
  },
  workOrderInternalId: { status: 'verify', note: 'Verify top-level Work Order internal ID.' },
  workOrderNumber: { status: 'verify', note: 'Verify Work Order transaction number.' },
  salesOrderInternalId: {
    status: 'verified',
    suiteQlExpression: 't.id',
    note: 'Verified by live exact Sales Order inspection.'
  },
  salesOrderNumber: {
    status: 'verified',
    suiteQlExpression: 't.tranid',
    note: 'Verified by live exact Sales Order inspection.'
  },
  shipTo: {
    status: 'verified',
    suiteQlExpression: 'BUILTIN.DF(t.entity)',
    note: 'Report rule intentionally displays Customer Name as Ship To.'
  },
  itemInternalId: {
    status: 'verified',
    suiteQlExpression: 'tl.item',
    note: 'Verified by live Sales Order line inspection.'
  },
  item: {
    status: 'verified',
    suiteQlExpression: 'BUILTIN.DF(tl.item)',
    note: 'Verified against the four SO10144 item lines.'
  },
  itemDescription: {
    status: 'verify',
    suiteQlExpression: 'tl.memo',
    note: 'Candidate source; additional spot-checks and precedence verification remain.'
  },
  paintName: {
    status: 'verify',
    suiteQlExpression: 'tl.custcol_nscs_paintreplacementsku',
    note: 'Verified replacement field ID; Item description precedence remains under live inspection.'
  },
  fabricName: {
    status: 'verify',
    suiteQlExpression: 'tl.custcol_nscs_fabricreplacementsku',
    note: 'Verified replacement field ID; Item description precedence remains under live inspection.'
  },
  quantity: {
    status: 'verified',
    suiteQlExpression: '-tl.quantity',
    note: 'Production REST SuiteQL returns negative numeric strings; report quantity inverts the sign.'
  },
  createdDate: {
    status: 'verify',
    suiteQlExpression: 't.createddate',
    note: 'Matched SO10144; additional Sales Order spot-checks remain.'
  },
  dueDate: {
    status: 'verify',
    suiteQlExpression: 't.custbody_nscs_duedatebal',
    note: 'Hauser field ID is verified; direct SuiteQL value still requires a live test.'
  },
  workOrderStatus: { status: 'verify', note: 'Verify status code and display value.' },
  topLevelWorkOrderRelationship: {
    status: 'verify',
    suiteQlExpression: 'tl.createwo',
    note: 'Field ID is verified; live diagnostic must prove whether SuiteQL exposes a Work Order reference.'
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
