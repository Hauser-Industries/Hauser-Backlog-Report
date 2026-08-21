export const IPC_CHANNELS = {
  getBacklog: 'backlog:get',
  searchSalesOrder: 'backlog:search-sales-order',
  refreshBacklog: 'backlog:refresh',
  getConnectionStatus: 'connection:status',
  signIn: 'auth:sign-in',
  signOut: 'auth:sign-out',
  testConnection: 'connection:test',
  getAppInfo: 'app:info'
} as const
