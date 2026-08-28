import { ALL_CUSTOMERS_LABEL } from '@shared/constants/customers'
import type {
  BacklogPrintRequest,
  BacklogPrintSnapshot,
  BacklogResponse,
  PrintableBacklogItem,
  PrintableSalesOrderGroup,
  PurchaseOrderSearchRequest,
  SalesOrderDetailsResult,
  SalesOrderGroup,
  SalesOrderItemDetail,
  SalesOrderSearchRequest,
  WorkOrderBuiltRequest,
  WorkOrderBuiltResult,
  WorkOrderPaintedRequest,
  WorkOrderPaintedResult
} from '@shared/types/backlog'

const PRINT_PAGE_SIZE = 100
const DETAIL_CONCURRENCY = 3
const WORK_ORDER_BATCH_SIZE = 100
const MAX_PRINT_PAGES = 10_000

export interface BacklogPrintOperations {
  getBacklog(filter: {
    customerName?: string
    page: number
    pageSize: number
  }): Promise<BacklogResponse>
  searchSalesOrder(request: SalesOrderSearchRequest): Promise<BacklogResponse>
  searchPurchaseOrder(request: PurchaseOrderSearchRequest): Promise<BacklogResponse>
  getSalesOrderDetails(salesOrderInternalId: string): Promise<SalesOrderDetailsResult>
  getWorkOrderBuilt(request: WorkOrderBuiltRequest): Promise<WorkOrderBuiltResult>
  getWorkOrderPainted(request: WorkOrderPaintedRequest): Promise<WorkOrderPaintedResult>
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

async function forEachWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex]
        nextIndex += 1
        if (value !== undefined) await worker(value)
      }
    })
  )
}

function matchingDetail(
  item: SalesOrderGroup['items'][number],
  result: SalesOrderDetailsResult | undefined
): SalesOrderItemDetail | undefined {
  if (!result?.success) return undefined
  return result.items.find(
    (detail) =>
      (detail.lineId !== undefined && detail.lineId === item.lineId) ||
      (detail.lineSequence !== undefined && detail.lineSequence === item.lineSequence)
  )
}

function shouldLoadPainted(item: PrintableBacklogItem): boolean {
  return Boolean(
    item.paintName?.trim() &&
      item.built !== null &&
      Number.isFinite(item.built) &&
      item.quantity !== null &&
      Number.isFinite(item.quantity) &&
      item.built < item.quantity
  )
}

function scopeLabel(request: BacklogPrintRequest): string {
  switch (request.scope.kind) {
    case 'sales-order':
      return `Sales Order ${request.scope.salesOrderNumber}`
    case 'purchase-order':
      return `Purchase Order ${request.scope.purchaseOrderNumber}`
    case 'customer':
      return request.scope.customerName ?? ALL_CUSTOMERS_LABEL
  }
}

export class BacklogPrintDataService {
  constructor(
    private readonly backlog: BacklogPrintOperations,
    private readonly now: () => Date = () => new Date()
  ) {}

  async prepare(request: BacklogPrintRequest): Promise<BacklogPrintSnapshot> {
    const salesOrders = await this.loadScope(request)
    const detailBySalesOrder = new Map<string, SalesOrderDetailsResult>()

    await forEachWithConcurrency(salesOrders, DETAIL_CONCURRENCY, async (salesOrder) => {
      try {
        detailBySalesOrder.set(
          salesOrder.salesOrderInternalId,
          await this.backlog.getSalesOrderDetails(salesOrder.salesOrderInternalId)
        )
      } catch {
        // Optional detail failures leave the verified base report fields intact.
      }
    })

    const printableSalesOrders: PrintableSalesOrderGroup[] = salesOrders.map((salesOrder) => ({
      ...salesOrder,
      items: salesOrder.items.map((item) => {
        const detail = matchingDetail(item, detailBySalesOrder.get(salesOrder.salesOrderInternalId))
        return {
          ...item,
          ...(detail ?? {}),
          built: item.built ?? null,
          painted: null
        }
      })
    }))

    await this.attachBuilt(printableSalesOrders)
    await this.attachPainted(printableSalesOrders)

    return {
      salesOrders: printableSalesOrders,
      scopeLabel: scopeLabel(request),
      generatedAt: this.now().toISOString()
    }
  }

  private async loadScope(request: BacklogPrintRequest): Promise<SalesOrderGroup[]> {
    const { scope } = request
    if (scope.kind === 'sales-order') {
      const response = await this.backlog.searchSalesOrder({
        salesOrderNumber: scope.salesOrderNumber,
        ...(scope.customerName ? { customerName: scope.customerName } : {})
      })
      return structuredClone(response.salesOrders)
    }
    if (scope.kind === 'purchase-order') {
      const response = await this.backlog.searchPurchaseOrder({
        purchaseOrderNumber: scope.purchaseOrderNumber,
        ...(scope.customerName ? { customerName: scope.customerName } : {})
      })
      return structuredClone(response.salesOrders)
    }

    const salesOrders: SalesOrderGroup[] = []
    for (let page = 0; page < MAX_PRINT_PAGES; page += 1) {
      const response = await this.backlog.getBacklog({
        ...(scope.customerName ? { customerName: scope.customerName } : {}),
        page,
        pageSize: PRINT_PAGE_SIZE
      })
      salesOrders.push(...response.salesOrders)
      if (!response.hasNext) return structuredClone(salesOrders)
      if (response.salesOrders.length === 0) {
        throw new Error('The printable report pagination did not advance.')
      }
    }
    throw new Error('The printable report exceeded its pagination safety limit.')
  }

  private async attachBuilt(salesOrders: PrintableSalesOrderGroup[]): Promise<void> {
    const references = [
      ...new Map(
        salesOrders.flatMap((salesOrder) =>
          salesOrder.items.flatMap((item) =>
            item.workOrderInternalId && item.workOrderNumber
              ? [
                  [
                    item.workOrderInternalId,
                    {
                      workOrderInternalId: item.workOrderInternalId,
                      workOrderNumber: item.workOrderNumber
                    }
                  ] as const
                ]
              : []
          )
        )
      ).values()
    ]
    const builtByWorkOrder = new Map<string, number | null>()

    for (const batch of chunks(references, WORK_ORDER_BATCH_SIZE)) {
      try {
        const result = await this.backlog.getWorkOrderBuilt({ workOrders: batch })
        for (const value of result.values) {
          builtByWorkOrder.set(value.workOrderInternalId, value.built)
        }
      } catch {
        // Built is optional for printing and must not hide the rest of the report.
      }
    }

    for (const salesOrder of salesOrders) {
      for (const item of salesOrder.items) {
        if (item.workOrderInternalId && builtByWorkOrder.has(item.workOrderInternalId)) {
          item.built = builtByWorkOrder.get(item.workOrderInternalId) ?? null
        }
      }
    }
  }

  private async attachPainted(salesOrders: PrintableSalesOrderGroup[]): Promise<void> {
    const references = [
      ...new Map(
        salesOrders.flatMap((salesOrder) =>
          salesOrder.items.flatMap((item) =>
            shouldLoadPainted(item) && item.workOrderInternalId && item.workOrderNumber
              ? [
                  [
                    item.workOrderInternalId,
                    {
                      workOrderInternalId: item.workOrderInternalId,
                      workOrderNumber: item.workOrderNumber
                    }
                  ] as const
                ]
              : []
          )
        )
      ).values()
    ]
    const paintedByWorkOrder = new Map<string, number | null>()

    for (const batch of chunks(references, WORK_ORDER_BATCH_SIZE)) {
      try {
        const result = await this.backlog.getWorkOrderPainted({ workOrders: batch })
        for (const value of result.values) {
          paintedByWorkOrder.set(value.workOrderInternalId, value.painted)
        }
      } catch {
        // Painted is optional for printing and must not hide the rest of the report.
      }
    }

    for (const salesOrder of salesOrders) {
      for (const item of salesOrder.items) {
        if (item.workOrderInternalId && paintedByWorkOrder.has(item.workOrderInternalId)) {
          item.painted = paintedByWorkOrder.get(item.workOrderInternalId) ?? null
        }
      }
    }
  }
}
