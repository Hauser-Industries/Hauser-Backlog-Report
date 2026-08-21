import electron from 'electron'
import { z } from 'zod'
import { isAllowedCustomer } from '@shared/constants/customers'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type {
  BacklogFilter,
  BacklogResponse,
  ConnectionStatus,
  SalesOrderSearchRequest
} from '@shared/types/backlog'

const { app, ipcMain } = electron

export interface BacklogController {
  getBacklog(filter: BacklogFilter): Promise<BacklogResponse>
  searchSalesOrder(request: SalesOrderSearchRequest): Promise<BacklogResponse>
  refreshBacklog(filter: BacklogFilter): Promise<BacklogResponse>
}

export interface ConnectionController {
  getStatus(): Promise<ConnectionStatus>
  signIn(): Promise<ConnectionStatus>
  signOut(): Promise<ConnectionStatus>
  testConnection(): Promise<ConnectionStatus>
}

interface IpcDependencies {
  backlog: BacklogController
  connection: ConnectionController
}

const customerNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isAllowedCustomer, 'Customer is not in the configured allowlist.')

const backlogFilterSchema = z
  .strictObject({
    customerName: customerNameSchema.optional()
  })
  .transform<BacklogFilter>(({ customerName }) => (customerName ? { customerName } : {}))

const salesOrderSearchSchema = z
  .strictObject({
    salesOrderNumber: z.string().trim().min(1).max(40),
    customerName: customerNameSchema.optional()
  })
  .transform<SalesOrderSearchRequest>(({ salesOrderNumber, customerName }) =>
    customerName ? { salesOrderNumber, customerName } : { salesOrderNumber }
  )

function publicError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'The requested operation failed.'

  // IPC only returns a concise message. Detailed, sanitized diagnostics belong in main-process logs.
  return new Error(message.slice(0, 500))
}

function registerValidatedHandler<T>(
  channel: string,
  schema: z.ZodType<T>,
  handler: (value: T) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (_event, rawValue: unknown) => {
    try {
      return await handler(schema.parse(rawValue))
    } catch (error) {
      throw publicError(error)
    }
  })
}

function registerNoArgumentHandler(channel: string, handler: () => Promise<unknown>): void {
  ipcMain.handle(channel, async () => {
    try {
      return await handler()
    } catch (error) {
      throw publicError(error)
    }
  })
}

export function registerIpcHandlers({ backlog, connection }: IpcDependencies): void {
  registerValidatedHandler(IPC_CHANNELS.getBacklog, backlogFilterSchema, (filter) =>
    backlog.getBacklog(filter)
  )
  registerValidatedHandler(IPC_CHANNELS.searchSalesOrder, salesOrderSearchSchema, (request) =>
    backlog.searchSalesOrder(request)
  )
  registerValidatedHandler(IPC_CHANNELS.refreshBacklog, backlogFilterSchema, (filter) =>
    backlog.refreshBacklog(filter)
  )

  registerNoArgumentHandler(IPC_CHANNELS.getConnectionStatus, () => connection.getStatus())
  registerNoArgumentHandler(IPC_CHANNELS.signIn, () => connection.signIn())
  registerNoArgumentHandler(IPC_CHANNELS.signOut, () => connection.signOut())
  registerNoArgumentHandler(IPC_CHANNELS.testConnection, () => connection.testConnection())
  registerNoArgumentHandler(IPC_CHANNELS.getAppInfo, async () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }))
}
