import type { BacklogDataSource } from './backlogDataSource'
import type { BacklogPageData, SalesOrderDetailsResult } from '@shared/types/backlog'
import { assertLiveFieldMappingsReady } from '../netsuite/config/fieldMapping'
import {
  loadNetSuiteConfig,
  requireNetSuiteConfig,
  type NetSuiteConfigState
} from '../netsuite/config/netsuiteConfig'
import { NetSuiteConfigurationError } from '../netsuite/errors'

/**
 * Honest live-mode boundary used until Hauser's field mapping is verified and
 * the concrete NetSuite repositories can be composed. It must never return
 * mock rows while the application says it is in Live mode.
 */
export class PendingLiveBacklogDataSource implements BacklogDataSource {
  constructor(private readonly configState: NetSuiteConfigState = loadNetSuiteConfig()) {}

  async getBacklog(): Promise<BacklogPageData> {
    return this.assertReady()
  }

  async getSalesOrder(): Promise<BacklogPageData> {
    return this.assertReady()
  }

  async getPurchaseOrder(): Promise<BacklogPageData> {
    return this.assertReady()
  }

  async getSalesOrderDetails(): Promise<SalesOrderDetailsResult> {
    return this.assertReady()
  }

  private assertReady(): never {
    requireNetSuiteConfig(this.configState)
    assertLiveFieldMappingsReady()

    throw new NetSuiteConfigurationError(
      'Live NetSuite repositories have not been composed for this installation.'
    )
  }
}
