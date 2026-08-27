import electron from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { HauserBacklogApi } from '@shared/types/backlog'

const { contextBridge, ipcRenderer } = electron

const api: HauserBacklogApi = {
  getBacklog: (filter) => ipcRenderer.invoke(IPC_CHANNELS.getBacklog, filter),
  searchSalesOrder: (request) => ipcRenderer.invoke(IPC_CHANNELS.searchSalesOrder, request),
  refreshBacklog: (filter) => ipcRenderer.invoke(IPC_CHANNELS.refreshBacklog, filter),
  getSalesOrderDetails: (request) => ipcRenderer.invoke(IPC_CHANNELS.getSalesOrderDetails, request),
  getWorkOrderBuilt: (request) => ipcRenderer.invoke(IPC_CHANNELS.getWorkOrderBuilt, request),
  getConnectionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getConnectionStatus),
  signIn: () => ipcRenderer.invoke(IPC_CHANNELS.signIn),
  signOut: () => ipcRenderer.invoke(IPC_CHANNELS.signOut),
  testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.testConnection),
  testSuiteQl: () => ipcRenderer.invoke(IPC_CHANNELS.testSuiteQl),
  resolveCustomerIds: () => ipcRenderer.invoke(IPC_CHANNELS.resolveCustomerIds),
  inspectSalesOrder: (request) => ipcRenderer.invoke(IPC_CHANNELS.inspectSalesOrder, request),
  switchEnvironment: (request) => ipcRenderer.invoke(IPC_CHANNELS.switchEnvironment, request),
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo)
}

contextBridge.exposeInMainWorld('hauserBacklog', Object.freeze(api))
