export interface ConfiguredCustomer {
  internalId?: string
  name: string
}

export interface WorkOrderStatus {
  code?: string
  label: string
}

export interface WorkOrderNode {
  internalId: string
  workOrderNumber: string
  parentWorkOrderInternalId?: string
  rootWorkOrderInternalId?: string
  itemInternalId?: string
  item: string
  itemDescription?: string
  statusCode?: string
  statusLabel: string
  quantity?: number
  quantityCompleted?: number
  quantityRemaining?: number
  createdDate?: string
  dueDate?: string
  children: WorkOrderNode[]
}

export interface BacklogRow {
  rowKey: string
  customerInternalId?: string
  customerName: string
  poNumber: string
  workOrderInternalId?: string
  workOrderNumber?: string
  salesOrderInternalId?: string
  salesOrderNumber: string
  shipTo: string
  itemInternalId?: string
  item: string
  itemDescription: string
  paintItemInternalId?: string
  paintSku?: string
  paintName: string
  fabricItemInternalId?: string
  fabricSku?: string
  fabricName: string
  weltItemInternalId?: string
  weltSku?: string
  weltName: string
  buttonItemInternalId?: string
  buttonSku?: string
  buttonName: string
  quantity: number
  createdDate?: string
  dueDate?: string
  workOrderStatusCode?: string
  workOrderStatusLabel?: string
  workOrderHierarchy?: WorkOrderNode
  workOrderHierarchySource?: 'live-rest' | 'demo'
}

export interface BacklogItemRow {
  rowKey: string
  lineId: string
  lineSequence: number | null
  itemInternalId: string
  item: string
  itemDescription: string
  quantity: number | null
  workOrderInternalId?: string
  workOrderNumber?: string
  paintName?: string
  paintDescription?: string
  fabricName?: string
  fabricDescription?: string
  weltName?: string
  weltDescription?: string
  buttonName?: string
  buttonDescription?: string
  workOrderStatus?: string
}

export interface SalesOrderGroup {
  salesOrderInternalId: string
  salesOrderNumber: string
  customerInternalId: string
  customerName: string
  poNumber: string
  createdDate: string | null
  dueDate: string | null
  items: BacklogItemRow[]
}

export interface BacklogPageData {
  salesOrders: SalesOrderGroup[]
  page: number
  pageSize: number
  totalSalesOrders: number
  hasPrevious: boolean
  hasNext: boolean
}

export interface BacklogRowWithHierarchy extends BacklogRow {
  workOrderHierarchy?: WorkOrderNode
}

export interface BacklogFilter {
  customerName?: string
  page?: number
  pageSize?: number
}

export type BacklogQueryOutcome = 'success' | 'not-found' | 'outside-allowed-customer'

export interface BacklogResponse {
  salesOrders: SalesOrderGroup[]
  page: number
  pageSize: number
  totalSalesOrders: number
  hasPrevious: boolean
  hasNext: boolean
  lastUpdated: string
  outcome: BacklogQueryOutcome
}

export interface SalesOrderItemDetail {
  lineId?: string
  lineSequence?: number
  paintName?: string
  paintDescription?: string
  fabricName?: string
  fabricDescription?: string
  weltName?: string
  weltDescription?: string
  buttonName?: string
  buttonDescription?: string
  workOrderInternalId?: string
  workOrderNumber?: string
  workOrderStatus?: string
}

export interface SalesOrderDetailsRequest {
  salesOrderInternalId: string
}

export type SalesOrderDetailsResult =
  | {
      success: true
      items: SalesOrderItemDetail[]
    }
  | {
      success: false
      message: string
    }

export type DataSourceMode = 'mock' | 'live'
export type NetSuiteEnvironment = 'sandbox' | 'production'

export type ConnectionIndicator =
  'mock-data' | 'connected' | 'disconnected' | 'authentication-required' | 'connection-error'

export interface NetSuitePublicConfiguration {
  accountId: string
  suiteTalkUrl: string
  clientId: string
  redirectUri: string
  scope: string
}

export interface ConnectionStatus {
  dataSource: DataSourceMode
  environment?: NetSuiteEnvironment
  configured: boolean
  authenticated: boolean
  indicator: ConnectionIndicator
  accountLabel?: string
  configuration?: NetSuitePublicConfiguration
  message?: string
}

export type NetSuiteRestConnectionErrorCode =
  | 'authentication'
  | 'permission'
  | 'endpoint'
  | 'rate-limited'
  | 'service'
  | 'network'
  | 'unexpected-response'

export interface NetSuiteRestConnectionError {
  code: NetSuiteRestConnectionErrorCode
  httpStatus: number | null
  message: string
}

export type NetSuiteRestConnectionOutcome =
  | {
      ok: true
      httpStatus: 200
      message: string
    }
  | {
      ok: false
      error: NetSuiteRestConnectionError
    }

export type ConnectionTestResult =
  | {
      ok: true
      httpStatus: 200
      message: string
      connectionStatus: ConnectionStatus
    }
  | {
      ok: false
      error: NetSuiteRestConnectionError
      connectionStatus: ConnectionStatus
    }

export interface SuiteQlDiagnosticCustomer {
  id: string
  entityid: string
}

export type SuiteQlDiagnosticErrorCode =
  | 'invalid-input'
  | 'authentication'
  | 'permission'
  | 'bad-request'
  | 'rate-limited'
  | 'service'
  | 'network'
  | 'unexpected-response'

export interface SuiteQlDevelopmentDiagnostics {
  netSuiteCode?: string
  netSuiteMessage?: string
  stage?: 'SALES_ORDER_QUERY' | 'REPLACEMENT_ITEM_LOOKUP' | 'WORK_ORDER_LOOKUP'
}

export interface SuiteQlDiagnosticError {
  code: SuiteQlDiagnosticErrorCode
  message: string
  diagnostics?: SuiteQlDevelopmentDiagnostics
}

export type NetSuiteSuiteQlOutcome =
  | {
      success: true
      httpStatus: 200
      message: string
      count: number
      totalResults: number
      hasMore: boolean
      items: SuiteQlDiagnosticCustomer[]
    }
  | {
      success: false
      httpStatus: number | null
      error: SuiteQlDiagnosticError
    }

export type SuiteQlTestResult = NetSuiteSuiteQlOutcome

export interface ResolvedCustomerDiagnosticRow {
  internalId: string
  entityId: string | null
  companyName: string | null
}

export type CustomerResolutionStatus = 'complete' | 'incomplete' | 'additional-candidates'

export type ResolveCustomerIdsOutcome =
  | {
      success: true
      httpStatus: 200
      message: string
      resolutionStatus: CustomerResolutionStatus
      configuredCustomerCount: number
      resolvedCustomerCount: number
      candidateCount: number
      additionalCandidateCount: number
      rows: ResolvedCustomerDiagnosticRow[]
    }
  | {
      success: false
      httpStatus: number | null
      error: SuiteQlDiagnosticError
    }

export type ResolveCustomerIdsResult = ResolveCustomerIdsOutcome

export type SalesOrderInspectionRawValue = string | number | null
export type SalesOrderInspectionRawBooleanValue = string | boolean | number | null
export type SalesOrderInspectionRawType = 'string' | 'number' | 'null'

export interface SalesOrderInspectionHeader {
  salesOrderInternalId: string
  salesOrderNumber: string
  customerInternalId: string
  customerName: string | null
  poNumber: string | null
  transactionDate: string | null
  createdDate: string | null
  standardDueDate: string | null
  hauserDueDate: string | null
}

export interface SalesOrderInspectionLine {
  lineId: string
  lineSequence: SalesOrderInspectionRawValue
  itemInternalId: string
  item: string | null
  descriptionCandidate: string | null
  rawQuantityApiValue: SalesOrderInspectionRawValue
  rawQuantityApiType: SalesOrderInspectionRawType
  normalizedQuantity: number | null
  reportQuantity: number | null
  closed: SalesOrderInspectionRawBooleanValue
  itemType: string | null
}

export interface InspectSalesOrderRequest {
  salesOrderNumber: string
}

export interface SwitchNetSuiteEnvironmentRequest {
  environment: NetSuiteEnvironment
}

export type InspectSalesOrderOutcome =
  | {
      success: true
      httpStatus: 200
      found: true
      message: string
      configuredHauserCustomer: boolean
      header: SalesOrderInspectionHeader
      lines: SalesOrderInspectionLine[]
    }
  | {
      success: true
      httpStatus: 200
      found: false
      message: string
      salesOrderNumber: string
    }
  | {
      success: false
      httpStatus: number | null
      error: SuiteQlDiagnosticError
    }

export type InspectSalesOrderResult = InspectSalesOrderOutcome

export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface SalesOrderSearchRequest {
  salesOrderNumber: string
  customerName?: string
  refreshDetails?: boolean
}

export interface HauserBacklogApi {
  getBacklog(filter: BacklogFilter): Promise<BacklogResponse>
  searchSalesOrder(request: SalesOrderSearchRequest): Promise<BacklogResponse>
  refreshBacklog(filter: BacklogFilter): Promise<BacklogResponse>
  getSalesOrderDetails(request: SalesOrderDetailsRequest): Promise<SalesOrderDetailsResult>
  getConnectionStatus(): Promise<ConnectionStatus>
  signIn(): Promise<ConnectionStatus>
  signOut(): Promise<ConnectionStatus>
  testConnection(): Promise<ConnectionTestResult>
  testSuiteQl(): Promise<SuiteQlTestResult>
  resolveCustomerIds(): Promise<ResolveCustomerIdsResult>
  inspectSalesOrder(request: InspectSalesOrderRequest): Promise<InspectSalesOrderResult>
  switchEnvironment(request: SwitchNetSuiteEnvironmentRequest): Promise<ConnectionStatus>
  getAppInfo(): Promise<AppInfo>
}
