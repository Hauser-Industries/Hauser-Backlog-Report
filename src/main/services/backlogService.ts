import type { BacklogDataSource } from '../data/backlogDataSource'
import type {
  BacklogFilter,
  BacklogPageData,
  BacklogResponse,
  PurchaseOrderSearchRequest,
  SalesOrderGroup,
  SalesOrderDetailsResult,
  SalesOrderSearchRequest,
  WorkOrderBuiltRequest,
  WorkOrderBuiltResult,
  WorkOrderPaintedRequest,
  WorkOrderPaintedResult
} from '@shared/types/backlog'
import { isAllowedCustomer } from '@shared/constants/customers'
import { normalizeSalesOrderNumber } from '@shared/utils/salesOrder'
import { normalizePurchaseOrderNumber } from '@shared/utils/purchaseOrder'

export class BacklogService {
  constructor(
    private readonly dataSource: BacklogDataSource,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getBacklog(filter: BacklogFilter = {}): Promise<BacklogResponse> {
    return this.response(await this.dataSource.getBacklog(filter), 'success')
  }

  async refreshBacklog(filter: BacklogFilter = {}): Promise<BacklogResponse> {
    this.dataSource.invalidateDetails?.()
    return this.response(await this.dataSource.getBacklog(filter), 'success')
  }

  async getSalesOrderDetails(salesOrderInternalId: string): Promise<SalesOrderDetailsResult> {
    return this.dataSource.getSalesOrderDetails(salesOrderInternalId)
  }

  async getWorkOrderBuilt(request: WorkOrderBuiltRequest): Promise<WorkOrderBuiltResult> {
    if (this.dataSource.getWorkOrderBuilt) return this.dataSource.getWorkOrderBuilt(request)
    return {
      success: true,
      values: request.workOrders.map(({ workOrderInternalId }) => ({
        workOrderInternalId,
        built: null
      }))
    }
  }

  async getWorkOrderPainted(request: WorkOrderPaintedRequest): Promise<WorkOrderPaintedResult> {
    if (this.dataSource.getWorkOrderPainted) return this.dataSource.getWorkOrderPainted(request)
    return {
      success: true,
      values: request.workOrders.map(({ workOrderInternalId }) => ({
        workOrderInternalId,
        painted: null
      }))
    }
  }

  async searchSalesOrder(request: SalesOrderSearchRequest): Promise<BacklogResponse> {
    if (request.refreshDetails) this.dataSource.invalidateDetails?.()
    const salesOrderNumber = normalizeSalesOrderNumber(request.salesOrderNumber)
    const page = await this.dataSource.getSalesOrder(salesOrderNumber)
    const exactSalesOrders = page.salesOrders.filter(
      (salesOrder) => salesOrder.salesOrderNumber.toUpperCase() === salesOrderNumber
    )

    if (exactSalesOrders.length === 0) return this.emptyResponse(page, 'not-found')

    const allowedSalesOrders = exactSalesOrders.filter((salesOrder) =>
      isAllowedCustomer(salesOrder.customerName)
    )
    if (allowedSalesOrders.length === 0) {
      return this.emptyResponse(page, 'outside-allowed-customer')
    }

    const filteredSalesOrders = request.customerName
      ? allowedSalesOrders.filter((salesOrder) => salesOrder.customerName === request.customerName)
      : allowedSalesOrders

    return filteredSalesOrders.length > 0
      ? this.response(
          {
            ...page,
            salesOrders: filteredSalesOrders,
            totalSalesOrders: filteredSalesOrders.length,
            hasPrevious: false,
            hasNext: false
          },
          'success'
        )
      : this.emptyResponse(page, 'not-found')
  }

  async searchPurchaseOrder(request: PurchaseOrderSearchRequest): Promise<BacklogResponse> {
    if (request.refreshDetails) this.dataSource.invalidateDetails?.()
    const purchaseOrderNumber = normalizePurchaseOrderNumber(request.purchaseOrderNumber)
    const page = await this.dataSource.getPurchaseOrder(purchaseOrderNumber)
    const exactSalesOrders = page.salesOrders.filter(
      (salesOrder) => salesOrder.poNumber.trim().toUpperCase() === purchaseOrderNumber
    )

    if (exactSalesOrders.length === 0) return this.emptyResponse(page, 'not-found')

    const allowedSalesOrders = exactSalesOrders.filter((salesOrder) =>
      isAllowedCustomer(salesOrder.customerName)
    )
    if (allowedSalesOrders.length === 0) {
      return this.emptyResponse(page, 'outside-allowed-customer')
    }

    const filteredSalesOrders = request.customerName
      ? allowedSalesOrders.filter((salesOrder) => salesOrder.customerName === request.customerName)
      : allowedSalesOrders

    return filteredSalesOrders.length > 0
      ? this.response(
          {
            ...page,
            salesOrders: filteredSalesOrders,
            totalSalesOrders: filteredSalesOrders.length,
            hasPrevious: false,
            hasNext: false
          },
          'success'
        )
      : this.emptyResponse(page, 'not-found')
  }

  private emptyResponse(
    page: BacklogPageData,
    outcome: BacklogResponse['outcome']
  ): BacklogResponse {
    return this.response(
      {
        ...page,
        salesOrders: [],
        totalSalesOrders: 0,
        hasPrevious: false,
        hasNext: false
      },
      outcome
    )
  }

  private response(page: BacklogPageData, outcome: BacklogResponse['outcome']): BacklogResponse {
    const salesOrders = this.allowedSalesOrders(page.salesOrders)
    return {
      ...page,
      salesOrders,
      lastUpdated: this.now().toISOString(),
      outcome
    }
  }

  private allowedSalesOrders(salesOrders: readonly SalesOrderGroup[]): SalesOrderGroup[] {
    return salesOrders.filter((salesOrder) => isAllowedCustomer(salesOrder.customerName))
  }
}
