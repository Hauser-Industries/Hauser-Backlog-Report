import electron from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type { HauserBacklogApi } from '@shared/types/backlog'

const { contextBridge, ipcRenderer } = electron

const api: HauserBacklogApi = {
  getBacklog: (filter) => ipcRenderer.invoke(IPC_CHANNELS.getBacklog, filter),
  searchSalesOrder: (request) => ipcRenderer.invoke(IPC_CHANNELS.searchSalesOrder, request),
  refreshBacklog: (filter) => ipcRenderer.invoke(IPC_CHANNELS.refreshBacklog, filter),
  getConnectionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getConnectionStatus),
  signIn: () => ipcRenderer.invoke(IPC_CHANNELS.signIn),
  signOut: () => ipcRenderer.invoke(IPC_CHANNELS.signOut),
  testConnection: () => ipcRenderer.invoke(IPC_CHANNELS.testConnection),
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo)
}

contextBridge.exposeInMainWorld('hauserBacklog', Object.freeze(api))
