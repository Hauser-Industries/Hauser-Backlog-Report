import { describe, expect, it, vi } from 'vitest'

import type { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import {
  createNextTransactionWorkOrderQuery,
  NetSuiteWorkOrderRelationshipResolver
} from '../src/main/netsuite/workOrders/workOrderRelationshipResolver'
import { makeSalesOrderGroup } from './helpers/testData'

const logger: DiagnosticLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

function result(items: Record<string, unknown>[]) {
  return { items, totalResults: items.length, pages: 1 }
}

describe('NetSuiteWorkOrderRelationshipResolver', () => {
  it('maps different Work Orders to exact SO transaction line IDs and preserves statuses', async () => {
    const queryAll = vi.fn(async () =>
      result([
        {
          sales_order_internal_id: '10144',
          sales_order_line_id: '11',
          work_order_internal_id: '900',
          work_order_number: 'WO777',
          work_order_status_raw: 'B',
          work_order_status: 'Released'
        },
        {
          sales_order_internal_id: '10144',
          sales_order_line_id: '12',
          work_order_internal_id: '901',
          work_order_number: 'WO778',
          work_order_status_raw: 'CUSTOM_STATUS',
          work_order_status: 'Pending Custom Review'
        }
      ])
    )
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger
    )
    const salesOrder = makeSalesOrderGroup({
      salesOrderInternalId: '10144',
      items: [
        {
          rowKey: '10144-11',
          lineId: '11',
          lineSequence: 1,
          itemInternalId: '44',
          item: 'CHAIR-A',
          itemDescription: 'A',
          quantity: 1
        },
        {
          rowKey: '10144-12',
          lineId: '12',
          lineSequence: 2,
          itemInternalId: '45',
          item: 'CHAIR-B',
          itemDescription: 'B',
          quantity: 2
        }
      ]
    })

    const resolution = await resolver.resolve([salesOrder])

    expect(resolution.relationship).toBe('NextTransactionLineLink')
    expect(resolution.bySalesOrderLine.get('10144:11')).toMatchObject({
      number: 'WO777',
      status: 'Released'
    })
    expect(resolution.bySalesOrderLine.get('10144:12')).toMatchObject({
      number: 'WO778',
      status: 'Pending Custom Review'
    })
  })

  it('does not add a LinkType filter to the first-attempt relationship query', () => {
    const query = createNextTransactionWorkOrderQuery(['10144'])

    expect(query.sql).toContain('NTLL.LinkType AS link_type')
    expect(query.sql).not.toMatch(/WHERE[\s\S]*LinkType\s*=/i)
  })

  it('returns a successful empty mapping when no Work Order exists', async () => {
    const queryAll = vi.fn(async () => result([]))
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger
    )

    const resolution = await resolver.resolve([
      makeSalesOrderGroup({ salesOrderInternalId: '10144' })
    ])

    expect(resolution).toMatchObject({
      succeeded: true,
      relationship: 'WOLine.CreatedFrom'
    })
    expect(resolution.bySalesOrderLine.size).toBe(0)
  })

  it('does not attach a CreatedFrom Work Order when the same item occurs twice', async () => {
    const queryAll = vi
      .fn()
      .mockResolvedValueOnce(result([]))
      .mockResolvedValueOnce(
        result([
          {
            sales_order_internal_id: '10144',
            assembly_item_internal_id: '44',
            work_order_internal_id: '900',
            work_order_number: 'WO777',
            work_order_status: 'Released'
          }
        ])
      )
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger
    )
    const duplicateItemSalesOrder = makeSalesOrderGroup({
      salesOrderInternalId: '10144',
      items: [
        {
          rowKey: '10144-11',
          lineId: '11',
          lineSequence: 1,
          itemInternalId: '44',
          item: 'CHAIR',
          itemDescription: 'Chair',
          quantity: 1
        },
        {
          rowKey: '10144-12',
          lineId: '12',
          lineSequence: 2,
          itemInternalId: '44',
          item: 'CHAIR',
          itemDescription: 'Chair',
          quantity: 1
        }
      ]
    })

    const resolution = await resolver.resolve([duplicateItemSalesOrder])

    expect(resolution.bySalesOrderLine.size).toBe(0)
    expect(resolution.ambiguousLineKeys).toEqual(new Set(['10144:11', '10144:12']))
  })

  it('isolates failures from both Work Order relationship queries', async () => {
    const queryAll = vi.fn(async () => {
      throw new Error('NetSuite failure')
    })
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger
    )

    const resolution = await resolver.resolve([
      makeSalesOrderGroup({ salesOrderInternalId: '10144' })
    ])

    expect(resolution.succeeded).toBe(false)
    expect(resolution.bySalesOrderLine.size).toBe(0)
    expect(queryAll).toHaveBeenCalledTimes(2)
  })
})
