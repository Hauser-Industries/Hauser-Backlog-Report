export const IPC_CHANNELS = {
  getBacklog: 'backlog:get',
  searchSalesOrder: 'backlog:search-sales-order',
  refreshBacklog: 'backlog:refresh',
  getSalesOrderDetails: 'backlog:sales-order-details',
  getWorkOrderBuilt: 'backlog:work-order-built',
  getWorkOrderPainted: 'backlog:work-order-painted',
  getConnectionStatus: 'connection:status',
  signIn: 'auth:sign-in',
  signOut: 'auth:sign-out',
  testConnection: 'connection:test',
  testSuiteQl: 'connection:test-suiteql',
  resolveCustomerIds: 'connection:resolve-customer-ids',
  inspectSalesOrder: 'connection:inspect-sales-order',
  switchEnvironment: 'connection:switch-environment',
  getAppInfo: 'app:info'
} as const
