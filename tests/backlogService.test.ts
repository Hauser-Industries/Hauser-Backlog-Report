import { describe, expect, it, vi } from 'vitest'

import type { BacklogDataSource } from '../src/main/data/backlogDataSource'
import { MockBacklogDataSource } from '../src/main/data/mock/mockBacklogDataSource'
import { BacklogService } from '../src/main/services/backlogService'
import { makeBacklogRow } from './helpers/testData'

describe('BacklogService', () => {
  it('normalizes a numeric search before using the narrow data-source path', async () => {
    const getSalesOrder = vi.fn(async () => [makeBacklogRow()])
    const dataSource: BacklogDataSource = {
      getBacklog: vi.fn(async () => []),
      getSalesOrder
    }
    const service = new BacklogService(dataSource)

    const response = await service.searchSalesOrder({ salesOrderNumber: ' 1234 ' })

    expect(getSalesOrder).toHaveBeenCalledWith('SO1234')
    expect(response.outcome).toBe('success')
    expect(response.rows).toHaveLength(1)
  })

  it('returns a friendly not-found outcome for a missing sales order', async () => {
    const service = new BacklogService(new MockBacklogDataSource())
    const response = await service.searchSalesOrder({ salesOrderNumber: '777777' })

    expect(response).toMatchObject({ outcome: 'not-found', rows: [] })
  })

  it('respects a selected configured customer without changing the selection', async () => {
    const service = new BacklogService(new MockBacklogDataSource())
    const response = await service.searchSalesOrder({
      salesOrderNumber: 'SO1234',
      customerName: 'WATERLOO - HAUSER COMPANY STORES'
    })

    expect(response).toMatchObject({ outcome: 'not-found', rows: [] })
  })

  it('keeps a row with no associated work order', async () => {
    const service = new BacklogService(new MockBacklogDataSource())
    const response = await service.searchSalesOrder({ salesOrderNumber: 'SO1235' })

    expect(response.outcome).toBe('success')
    expect(response.rows).toHaveLength(1)
    expect(response.rows[0]?.workOrderInternalId).toBeUndefined()
    expect(response.rows[0]?.workOrderHierarchy).toBeUndefined()
  })

  it('defensively removes disallowed rows even if a data source leaks them', async () => {
    const dataSource: BacklogDataSource = {
      getBacklog: vi.fn(async () => [
        makeBacklogRow({ customerName: 'OUTSIDE CUSTOMER' }),
        makeBacklogRow({ rowKey: 'allowed-row' })
      ]),
      getSalesOrder: vi.fn(async () => [])
    }
    const service = new BacklogService(dataSource)

    const response = await service.getBacklog()

    expect(response.rows.map((row) => row.rowKey)).toEqual(['allowed-row'])
  })

  it('reloads the source when refresh is requested', async () => {
    const getBacklog = vi.fn(async () => [makeBacklogRow()])
    const dataSource: BacklogDataSource = {
      getBacklog,
      getSalesOrder: vi.fn(async () => [])
    }
    const service = new BacklogService(dataSource)

    await service.getBacklog()
    await service.refreshBacklog()

    expect(getBacklog).toHaveBeenCalledTimes(2)
  })
})
