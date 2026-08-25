import type {
  BacklogFilter,
  BacklogPageData,
  SalesOrderDetailsResult
} from '@shared/types/backlog'
import type { BacklogDataSource } from '../../data/backlogDataSource'
import type { SuiteQlOptions } from '../client/suiteQlClient'
import type { BacklogRepository } from '../repositories/backlogRepository'
import { ALL_CUSTOMERS_VALUE, isAllowedCustomer } from '@shared/constants/customers'
import { normalizeSalesOrderNumber } from '@shared/utils/salesOrder'
import { NetSuiteIntegrationError } from '../errors'

export interface NetSuiteBacklogDataSourceOptions {
  backlogRepository: BacklogRepository
}

export class NetSuiteBacklogDataSource implements BacklogDataSource {
  private readonly backlogRepository: BacklogRepository

  constructor(options: NetSuiteBacklogDataSourceOptions) {
    this.backlogRepository = options.backlogRepository
  }

  async getBacklog(filter: BacklogFilter, options?: SuiteQlOptions): Promise<BacklogPageData> {
    const normalizedFilter = this.normalizeFilter(filter)
    const page = await this.backlogRepository.getBacklog(normalizedFilter, options)
    return this.applyAllowedCustomerBoundary(page, normalizedFilter)
  }

  async getSalesOrder(
    salesOrderNumber: string,
    options?: SuiteQlOptions
  ): Promise<BacklogPageData> {
    const normalizedSalesOrder = normalizeSalesOrderNumber(salesOrderNumber)
    const page = await this.backlogRepository.getSalesOrder(normalizedSalesOrder, options)
    // Preserve outside-allowlist rows long enough for BacklogService to return its
    // distinct outside-allowed-customer outcome.
    return page
  }

  async getSalesOrderDetails(): Promise<SalesOrderDetailsResult> {
    return {
      success: false,
      message: 'Optional Sales Order details are unavailable for this data source.'
    }
  }

  private normalizeFilter(filter: BacklogFilter): BacklogFilter {
    const customerName = filter.customerName?.trim()
    const pagination = {
      ...(filter.page !== undefined ? { page: filter.page } : {}),
      ...(filter.pageSize !== undefined ? { pageSize: filter.pageSize } : {})
    }
    if (!customerName || customerName === ALL_CUSTOMERS_VALUE) return pagination
    if (!isAllowedCustomer(customerName)) {
      throw new NetSuiteIntegrationError('Only configured Hauser customers may be queried.', {
        code: 'invalid-query'
      })
    }
    return { customerName, ...pagination }
  }

  private applyAllowedCustomerBoundary(
    page: BacklogPageData,
    filter: BacklogFilter
  ): BacklogPageData {
    return {
      ...page,
      salesOrders: page.salesOrders.filter(
        (salesOrder) =>
          isAllowedCustomer(salesOrder.customerName) &&
          (!filter.customerName || salesOrder.customerName === filter.customerName)
      )
    }
  }
}
