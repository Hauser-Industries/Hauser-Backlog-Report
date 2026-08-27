import electron from 'electron'
import { z } from 'zod'
import { isAllowedCustomer } from '@shared/constants/customers'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import type {
  BacklogFilter,
  BacklogResponse,
  ConnectionStatus,
  ConnectionTestResult,
  InspectSalesOrderRequest,
  InspectSalesOrderResult,
  ResolveCustomerIdsResult,
  SalesOrderSearchRequest,
  SalesOrderDetailsRequest,
  SalesOrderDetailsResult,
  SuiteQlTestResult,
  SwitchNetSuiteEnvironmentRequest,
  WorkOrderBuiltRequest,
  WorkOrderBuiltResult
} from '@shared/types/backlog'

const { app, ipcMain } = electron

export interface BacklogController {
  getBacklog(filter: BacklogFilter): Promise<BacklogResponse>
  searchSalesOrder(request: SalesOrderSearchRequest): Promise<BacklogResponse>
  refreshBacklog(filter: BacklogFilter): Promise<BacklogResponse>
  getSalesOrderDetails(salesOrderInternalId: string): Promise<SalesOrderDetailsResult>
  getWorkOrderBuilt(request: WorkOrderBuiltRequest): Promise<WorkOrderBuiltResult>
}

export interface ConnectionController {
  getStatus(): Promise<ConnectionStatus>
  signIn(): Promise<ConnectionStatus>
  signOut(): Promise<ConnectionStatus>
  testConnection(): Promise<ConnectionTestResult>
  testSuiteQl(): Promise<SuiteQlTestResult>
  resolveCustomerIds(): Promise<ResolveCustomerIdsResult>
  inspectSalesOrder(request: InspectSalesOrderRequest): Promise<InspectSalesOrderResult>
  switchEnvironment(request: SwitchNetSuiteEnvironmentRequest): Promise<ConnectionStatus>
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
    customerName: customerNameSchema.optional(),
    page: z.number().int().min(0).max(100_000).optional(),
    pageSize: z.number().int().min(1).max(100).optional()
  })
  .transform<BacklogFilter>(({ customerName, page, pageSize }) => ({
    ...(customerName ? { customerName } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {})
  }))

const salesOrderSearchSchema = z
  .strictObject({
    salesOrderNumber: z.string().trim().min(1).max(40),
    customerName: customerNameSchema.optional(),
    refreshDetails: z.boolean().optional()
  })
  .transform<SalesOrderSearchRequest>(({ salesOrderNumber, customerName, refreshDetails }) => ({
    salesOrderNumber,
    ...(customerName ? { customerName } : {}),
    ...(refreshDetails !== undefined ? { refreshDetails } : {})
  }))

const salesOrderDetailsSchema = z
  .strictObject({
    salesOrderInternalId: z
      .string()
      .trim()
      .regex(/^[0-9]+$/)
  })
  .transform<SalesOrderDetailsRequest>(({ salesOrderInternalId }) => ({
    salesOrderInternalId
  }))

const workOrderBuiltSchema = z
  .strictObject({
    workOrders: z
      .array(
        z.strictObject({
          workOrderInternalId: z.string().trim().regex(/^[0-9]+$/),
          workOrderNumber: z.string().trim().min(1).max(80)
        })
      )
      .max(100)
  })
  .transform<WorkOrderBuiltRequest>(({ workOrders }) => ({ workOrders }))

const salesOrderInspectionSchema = z
  .strictObject({
    salesOrderNumber: z.string().trim().min(1).max(40)
  })
  .transform<InspectSalesOrderRequest>(({ salesOrderNumber }) => ({ salesOrderNumber }))

const netSuiteEnvironmentSchema = z
  .strictObject({
    environment: z.enum(['sandbox', 'production'])
  })
  .transform<SwitchNetSuiteEnvironmentRequest>(({ environment }) => ({ environment }))

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
  registerValidatedHandler(IPC_CHANNELS.getSalesOrderDetails, salesOrderDetailsSchema, (request) =>
    backlog.getSalesOrderDetails(request.salesOrderInternalId)
  )
  registerValidatedHandler(IPC_CHANNELS.getWorkOrderBuilt, workOrderBuiltSchema, (request) =>
    backlog.getWorkOrderBuilt(request)
  )

  registerNoArgumentHandler(IPC_CHANNELS.getConnectionStatus, () => connection.getStatus())
  registerNoArgumentHandler(IPC_CHANNELS.signIn, () => connection.signIn())
  registerNoArgumentHandler(IPC_CHANNELS.signOut, () => connection.signOut())
  registerNoArgumentHandler(IPC_CHANNELS.testConnection, () => connection.testConnection())
  registerNoArgumentHandler(IPC_CHANNELS.testSuiteQl, () => connection.testSuiteQl())
  registerNoArgumentHandler(IPC_CHANNELS.resolveCustomerIds, () => connection.resolveCustomerIds())
  registerValidatedHandler(IPC_CHANNELS.inspectSalesOrder, salesOrderInspectionSchema, (request) =>
    connection.inspectSalesOrder(request)
  )
  registerValidatedHandler(IPC_CHANNELS.switchEnvironment, netSuiteEnvironmentSchema, (request) =>
    connection.switchEnvironment(request)
  )
  registerNoArgumentHandler(IPC_CHANNELS.getAppInfo, async () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }))
}
