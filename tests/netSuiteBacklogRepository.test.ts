import { describe, expect, it, vi } from 'vitest'

import { getNetSuiteEnvironmentProfileByEnvironment } from '../src/main/netsuite/config/environmentProfiles'
import type { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import { VerifiedBacklogQueryFactory } from '../src/main/netsuite/queries/backlogQuery'
import { NetSuiteBacklogRepository } from '../src/main/netsuite/repositories/backlogRepository'

describe('NetSuiteBacklogRepository two-stage paging', () => {
  it('pages headers first and then attaches all current-page item lines', async () => {
    const executeSuiteQL = vi.fn(async () => ({
      count: 1,
      offset: 50,
      totalResults: 87,
      hasMore: true,
      items: [
        {
          sales_order_internal_id: '10144',
          sales_order_number: 'SO10144',
          customer_internal_id: '1578',
          customer_name: 'WATERLOO - HAUSER COMPANY STORES',
          po_number: '182560',
          created_date: '2026-08-24',
          due_date: '2026-09-07'
        }
      ]
    }))
    const queryAll = vi.fn(async () => ({
      items: [
        {
          sales_order_internal_id: '10144',
          line_id: '11',
          line_sequence: '1',
          item_internal_id: '44',
          item: 'HSPR0290C',
          item_description: 'COASTAL CORNER CUSHIONS',
          quantity_api_value: '-1'
        },
        {
          sales_order_internal_id: '10144',
          line_id: '12',
          line_sequence: '2',
          item_internal_id: '45',
          item: 'HSPR0233C',
          item_description: 'COASTAL ARMLESS CUSHIONS',
          quantity_api_value: '-2'
        }
      ],
      totalResults: 2,
      pages: 1
    }))
    const suiteQlClient = { executeSuiteQL, queryAll } as unknown as SuiteQlClient
    const repository = new NetSuiteBacklogRepository(
      suiteQlClient,
      new VerifiedBacklogQueryFactory(getNetSuiteEnvironmentProfileByEnvironment('production')),
      { verified: true, orderedSign: 'invert' }
    )

    const page = await repository.getBacklog({ page: 1, pageSize: 50 })

    expect(executeSuiteQL).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY t.createddate ASC, t.id ASC'),
      expect.objectContaining({ limit: 50, offset: 50 })
    )
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('tl.transaction IN (10144)')
      }),
      undefined
    )
    expect(page).toMatchObject({
      page: 1,
      pageSize: 50,
      totalSalesOrders: 87,
      hasPrevious: true,
      hasNext: true
    })
    expect(page.salesOrders).toHaveLength(1)
    expect(page.salesOrders[0]?.items.map((item) => item.quantity)).toEqual([1, 2])
  })

  it('keeps the base report when Work Order resolution fails', async () => {
    const suiteQlClient = {
      executeSuiteQL: vi.fn(async () => ({
        count: 1,
        offset: 0,
        totalResults: 1,
        hasMore: false,
        items: [
          {
            sales_order_internal_id: '10144',
            sales_order_number: 'SO10144',
            customer_internal_id: '1578',
            customer_name: 'WATERLOO - HAUSER COMPANY STORES'
          }
        ]
      })),
      queryAll: vi.fn(async () => ({
        items: [
          {
            sales_order_internal_id: '10144',
            line_id: '11',
            line_sequence: '1',
            item_internal_id: '44',
            item: 'HSPR0290C',
            quantity_api_value: '-1'
          }
        ],
        totalResults: 1,
        pages: 1
      }))
    } as unknown as SuiteQlClient
    const repository = new NetSuiteBacklogRepository(
      suiteQlClient,
      new VerifiedBacklogQueryFactory(getNetSuiteEnvironmentProfileByEnvironment('production')),
      { verified: true, orderedSign: 'invert' },
      {
        resolve: vi.fn(async () => {
          throw new Error('Work Order lookup failed')
        })
      }
    )

    const page = await repository.getBacklog({})

    expect(page.salesOrders[0]?.items[0]).toMatchObject({
      item: 'HSPR0290C',
      quantity: 1
    })
    expect(page.salesOrders[0]?.items[0]?.workOrderNumber).toBeUndefined()
  })

  it('marks a line as No Work Order after a successful empty relationship lookup', async () => {
    const suiteQlClient = {
      executeSuiteQL: vi.fn(async () => ({
        count: 1,
        offset: 0,
        totalResults: 1,
        hasMore: false,
        items: [
          {
            sales_order_internal_id: '10144',
            sales_order_number: 'SO10144',
            customer_internal_id: '1578',
            customer_name: 'WATERLOO - HAUSER COMPANY STORES'
          }
        ]
      })),
      queryAll: vi.fn(async () => ({
        items: [
          {
            sales_order_internal_id: '10144',
            line_id: '11',
            line_sequence: '1',
            item_internal_id: '44',
            item: 'HSPR0290C',
            quantity_api_value: '-2'
          }
        ],
        totalResults: 1,
        pages: 1
      }))
    } as unknown as SuiteQlClient
    const repository = new NetSuiteBacklogRepository(
      suiteQlClient,
      new VerifiedBacklogQueryFactory(getNetSuiteEnvironmentProfileByEnvironment('production')),
      { verified: true, orderedSign: 'invert' },
      {
        resolve: vi.fn(async () => ({
          succeeded: true,
          relationship: 'NextTransactionLineLink' as const,
          bySalesOrderLine: new Map<string, never>(),
          ambiguousLineKeys: new Set<string>()
        }))
      }
    )

    const page = await repository.getBacklog({})

    expect(page.salesOrders[0]?.items[0]).toMatchObject({
      quantity: 2,
      workOrderStatus: 'No Work Order'
    })
  })

  it('merges the normalized Work Order Built quantity onto the matching item row', async () => {
    const suiteQlClient = {
      executeSuiteQL: vi.fn(async () => ({
        count: 1,
        offset: 0,
        totalResults: 1,
        hasMore: false,
        items: [
          {
            sales_order_internal_id: '10144',
            sales_order_number: 'SO10144',
            customer_internal_id: '1578',
            customer_name: 'WATERLOO - HAUSER COMPANY STORES'
          }
        ]
      })),
      queryAll: vi.fn(async () => ({
        items: [
          {
            sales_order_internal_id: '10144',
            line_id: '11',
            line_sequence: '1',
            item_internal_id: '44',
            item: 'HSPR0290C',
            quantity_api_value: '-4'
          }
        ],
        totalResults: 1,
        pages: 1
      }))
    } as unknown as SuiteQlClient
    const repository = new NetSuiteBacklogRepository(
      suiteQlClient,
      new VerifiedBacklogQueryFactory(getNetSuiteEnvironmentProfileByEnvironment('production')),
      { verified: true, orderedSign: 'invert' },
      {
        resolve: vi.fn(async () => ({
          succeeded: true,
          relationship: 'NextTransactionLineLink' as const,
          bySalesOrderLine: new Map([
            [
              '10144:11',
              { internalId: '900', number: 'WO777', status: 'Released', built: 2.5 }
            ]
          ]),
          ambiguousLineKeys: new Set<string>()
        }))
      }
    )

    const page = await repository.getBacklog({})

    expect(page.salesOrders[0]?.items[0]).toMatchObject({
      quantity: 4,
      built: 2.5,
      workOrderNumber: 'WO777',
      workOrderStatus: 'Released'
    })
  })
})
