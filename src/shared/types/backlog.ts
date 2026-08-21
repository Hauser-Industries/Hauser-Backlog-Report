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
  paintName: string
  fabricName: string
  quantity: number
  quantityShipped: number
  quantityRemaining: number
  createdDate?: string
  dueDate?: string
  workOrderStatus?: WorkOrderStatus
  workOrderHierarchy?: WorkOrderNode
}

export interface BacklogFilter {
  customerName?: string
}

export type BacklogQueryOutcome = 'success' | 'not-found' | 'outside-allowed-customer'

export interface BacklogResponse {
  rows: BacklogRow[]
  lastUpdated: string
  outcome: BacklogQueryOutcome
}

export type DataSourceMode = 'mock' | 'live'

export type ConnectionIndicator =
  'mock-data' | 'connected' | 'disconnected' | 'authentication-required' | 'connection-error'

export interface ConnectionStatus {
  dataSource: DataSourceMode
  configured: boolean
  authenticated: boolean
  indicator: ConnectionIndicator
  accountLabel?: string
  message?: string
}

export interface AppInfo {
  name: string
  version: string
  platform: string
}

export interface SalesOrderSearchRequest {
  salesOrderNumber: string
  customerName?: string
}

export interface HauserBacklogApi {
  getBacklog(filter: BacklogFilter): Promise<BacklogResponse>
  searchSalesOrder(request: SalesOrderSearchRequest): Promise<BacklogResponse>
  refreshBacklog(filter: BacklogFilter): Promise<BacklogResponse>
  getConnectionStatus(): Promise<ConnectionStatus>
  signIn(): Promise<ConnectionStatus>
  signOut(): Promise<ConnectionStatus>
  testConnection(): Promise<ConnectionStatus>
  getAppInfo(): Promise<AppInfo>
}
