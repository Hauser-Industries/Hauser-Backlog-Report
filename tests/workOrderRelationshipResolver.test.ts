import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import type { WorkOrderBuiltProvider } from '../src/main/netsuite/workOrders/workOrderBuiltProvider'
import {
  createCreatedFromWorkOrderQuery,
  createNextTransactionWorkOrderQuery,
  NetSuiteWorkOrderRelationshipResolver
} from '../src/main/netsuite/workOrders/workOrderRelationshipResolver'
import type { SalesOrderGroup } from '../src/shared/types/backlog'
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

function relationshipRecord(
  lineId = '1',
  workOrderInternalId = '900',
  workOrderNumber = 'WO777'
): Record<string, unknown> {
  return {
    sales_order_internal_id: '10144',
    sales_order_line_id: lineId,
    work_order_internal_id: workOrderInternalId,
    work_order_number: workOrderNumber,
    work_order_status_raw: 'B',
    work_order_status: 'Released'
  }
}

function builtProvider(value: number | null): WorkOrderBuiltProvider {
  return { getBuilt: vi.fn(async () => value), invalidate: vi.fn() }
}

function twoLineSalesOrder(): SalesOrderGroup {
  return makeSalesOrderGroup({
    salesOrderInternalId: '10144',
    items: [
      {
        rowKey: '10144-11',
        lineId: '11',
        lineSequence: 1,
        itemInternalId: '44',
        item: 'CHAIR-A',
        itemDescription: 'A',
        quantity: 4
      },
      {
        rowKey: '10144-12',
        lineId: '12',
        lineSequence: 2,
        itemInternalId: '45',
        item: 'CHAIR-B',
        itemDescription: 'B',
        quantity: 4
      }
    ]
  })
}

describe('NetSuiteWorkOrderRelationshipResolver', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the exact SO-line relationship and attaches REST Built', async () => {
    const queryAll = vi.fn(async () =>
      result([relationshipRecord('11', '900', 'WO777'), relationshipRecord('12', '901', 'WO778')])
    )
    const provider: WorkOrderBuiltProvider = {
      getBuilt: vi.fn(async (internalId) => (internalId === '900' ? 2 : 0)),
      invalidate: vi.fn()
    }
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger,
      provider
    )

    const resolution = await resolver.resolve([twoLineSalesOrder()])

    expect(resolution.relationship).toBe('NextTransactionLineLink')
    expect(resolution.bySalesOrderLine.get('10144:11')).toMatchObject({
      internalId: '900',
      number: 'WO777',
      status: 'Released',
      built: 2
    })
    expect(resolution.bySalesOrderLine.get('10144:12')).toMatchObject({
      internalId: '901',
      number: 'WO778',
      built: 0
    })
    expect(queryAll).toHaveBeenCalledTimes(1)
  })

  it('leaves both existing SO-to-WO SuiteQL relationship queries unchanged', () => {
    const exactQuery = createNextTransactionWorkOrderQuery(['10144']).sql
    const createdFromQuery = createCreatedFromWorkOrderQuery(['10144']).sql

    expect(exactQuery).toContain('NTLL.PreviousLine AS sales_order_line_id')
    expect(exactQuery).toContain('ON WO.ID = NTLL.NextDoc')
    expect(exactQuery).toContain("AND WO.Type = 'WorkOrd'")
    expect(exactQuery).not.toMatch(/WHERE[\s\S]*LinkType\s*=/i)
    expect(exactQuery).not.toMatch(/BuildLine|WOCompl|QuantityBuilt/i)
    expect(createdFromQuery).toContain('WOLine.CreatedFrom AS sales_order_internal_id')
    expect(createdFromQuery).toContain('ON WOLine.Transaction = WO.ID')
    expect(createdFromQuery).toContain("AND NVL(WOLine.MainLine, 'F') = 'T'")
    expect(createdFromQuery).not.toMatch(/BuildLine|WOCompl|QuantityBuilt/i)
  })

  it('deduplicates repeated Work Order IDs before REST Built lookup', async () => {
    const queryAll = vi.fn(async () =>
      result([relationshipRecord('11', '900', 'WO777'), relationshipRecord('12', '900', 'WO777')])
    )
    const provider = builtProvider(2)
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger,
      provider
    )

    const resolution = await resolver.resolve([twoLineSalesOrder()])

    expect(provider.getBuilt).toHaveBeenCalledTimes(1)
    expect(provider.getBuilt).toHaveBeenCalledWith('900', 'WO777')
    expect(resolution.bySalesOrderLine.get('10144:11')?.built).toBe(2)
    expect(resolution.bySalesOrderLine.get('10144:12')?.built).toBe(2)
  })

  it('preserves a REST Built value of zero', async () => {
    const queryAll = vi.fn(async () => result([relationshipRecord()]))
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger,
      builtProvider(0)
    )

    const resolution = await resolver.resolve([
      makeSalesOrderGroup({ salesOrderInternalId: '10144' })
    ])

    expect(resolution.bySalesOrderLine.get('10144:1')?.built).toBe(0)
  })

  it('keeps Work Order number and status when REST Built is unavailable', async () => {
    const queryAll = vi.fn(async () => result([relationshipRecord()]))
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger,
      builtProvider(null)
    )

    const resolution = await resolver.resolve([
      makeSalesOrderGroup({ salesOrderInternalId: '10144' })
    ])

    expect(resolution.bySalesOrderLine.get('10144:1')).toMatchObject({
      internalId: '900',
      number: 'WO777',
      status: 'Released'
    })
    expect(resolution.bySalesOrderLine.get('10144:1')?.built).toBeUndefined()
  })

  it('isolates an unexpected Built provider failure from the resolved Work Order', async () => {
    const queryAll = vi.fn(async () => result([relationshipRecord()]))
    const provider: WorkOrderBuiltProvider = {
      getBuilt: vi.fn(async () => {
        throw new Error('REST Built failure')
      }),
      invalidate: vi.fn()
    }
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger,
      provider
    )

    const resolution = await resolver.resolve([
      makeSalesOrderGroup({ salesOrderInternalId: '10144' })
    ])

    expect(resolution.bySalesOrderLine.get('10144:1')?.number).toBe('WO777')
    expect(resolution.bySalesOrderLine.get('10144:1')?.status).toBe('Released')
    expect(resolution.bySalesOrderLine.get('10144:1')?.built).toBeUndefined()
  })

  it('returns a successful empty mapping when no Work Order exists', async () => {
    const queryAll = vi.fn(async () => result([]))
    const provider = builtProvider(2)
    const resolver = new NetSuiteWorkOrderRelationshipResolver(
      { queryAll } as unknown as SuiteQlClient,
      logger,
      provider
    )

    const resolution = await resolver.resolve([
      makeSalesOrderGroup({ salesOrderInternalId: '10144' })
    ])

    expect(resolution).toMatchObject({ succeeded: true, relationship: 'WOLine.CreatedFrom' })
    expect(resolution.bySalesOrderLine.size).toBe(0)
    expect(queryAll).toHaveBeenCalledTimes(2)
    expect(provider.getBuilt).not.toHaveBeenCalled()
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
      logger,
      builtProvider(2)
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
      logger,
      builtProvider(2)
    )

    const resolution = await resolver.resolve([
      makeSalesOrderGroup({ salesOrderInternalId: '10144' })
    ])

    expect(resolution.succeeded).toBe(false)
    expect(resolution.bySalesOrderLine.size).toBe(0)
    expect(queryAll).toHaveBeenCalledTimes(2)
  })
})
