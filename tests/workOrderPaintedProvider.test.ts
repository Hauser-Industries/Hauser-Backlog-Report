import { describe, expect, it, vi } from 'vitest'

import type { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import type { WorkOrderBuiltProvider } from '../src/main/netsuite/workOrders/workOrderBuiltProvider'
import {
  createPaintChildWorkOrderQuery,
  NetSuiteWorkOrderPaintedProvider
} from '../src/main/netsuite/workOrders/workOrderPaintedProvider'

const logger: DiagnosticLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

function result(items: Record<string, unknown>[]) {
  return { items, totalResults: items.length, pages: 1 }
}

function childRecord(
  parentWorkOrderInternalId = '900',
  componentSku = '8HS8702P',
  childWorkOrderInternalId = '901',
  childWorkOrderNumber = 'SO10097-WO1450'
): Record<string, unknown> {
  return {
    parent_work_order_internal_id: parentWorkOrderInternalId,
    parent_work_order_line_id: '22',
    component_item_internal_id: '300',
    component_sku: componentSku,
    paint_work_order_internal_id: childWorkOrderInternalId,
    paint_work_order_number: childWorkOrderNumber
  }
}

function builtProvider(value: number | null): WorkOrderBuiltProvider {
  return { getBuilt: vi.fn(async () => value), invalidate: vi.fn() }
}

describe('NetSuiteWorkOrderPaintedProvider', () => {
  it('uses the exact parent component-line transaction link and 8-prefix Item filter', () => {
    const query = createPaintChildWorkOrderQuery(['900', '902'])

    expect(query.sql).toContain('ParentWO.ID IN (900, 902)')
    expect(query.sql).toContain('ComponentItem.ID = ParentLine.Item')
    expect(query.sql).toContain('NTLL.PreviousDoc = ParentWO.ID')
    expect(query.sql).toContain('NTLL.PreviousLine = ParentLine.ID')
    expect(query.sql).toContain('ChildWO.ID = NTLL.NextDoc')
    expect(query.sql).toContain("ChildWO.Type = 'WorkOrd'")
    expect(query.sql).toContain("UPPER(ComponentItem.ItemID) LIKE '8%'")
    expect(() => createPaintChildWorkOrderQuery(['unsafe'])).toThrow()
  })

  it('resolves the linked paint child Work Order and reuses its REST Built provider', async () => {
    const queryAll = vi.fn(async () => result([childRecord()]))
    const built = builtProvider(3)
    const provider = new NetSuiteWorkOrderPaintedProvider(
      { queryAll } as unknown as SuiteQlClient,
      built,
      logger
    )

    await expect(
      provider.getPaintedValues([
        { workOrderInternalId: '900', workOrderNumber: 'SO10097-WO1449' }
      ])
    ).resolves.toEqual({
      success: true,
      values: [{ workOrderInternalId: '900', painted: 3 }]
    })
    expect(built.getBuilt).toHaveBeenCalledWith('901', 'SO10097-WO1450')
  })

  it('deduplicates parent Work Orders and caches Painted values', async () => {
    const queryAll = vi.fn(async () => result([childRecord()]))
    const built = builtProvider(2)
    const provider = new NetSuiteWorkOrderPaintedProvider(
      { queryAll } as unknown as SuiteQlClient,
      built,
      logger
    )
    const workOrder = { workOrderInternalId: '900', workOrderNumber: 'SO10097-WO1449' }

    const first = await provider.getPaintedValues([workOrder, workOrder])
    const second = await provider.getPaintedValues([workOrder])

    expect(first.values).toEqual([{ workOrderInternalId: '900', painted: 2 }])
    expect(second).toEqual(first)
    expect(queryAll).toHaveBeenCalledTimes(1)
    expect(built.getBuilt).toHaveBeenCalledTimes(1)
  })

  it('does not infer a child Work Order from a non-8 component SKU', async () => {
    const queryAll = vi.fn(async () => result([childRecord('900', '0HWG01220')]))
    const built = builtProvider(2)
    const provider = new NetSuiteWorkOrderPaintedProvider(
      { queryAll } as unknown as SuiteQlClient,
      built,
      logger
    )

    const response = await provider.getPaintedValues([
      { workOrderInternalId: '900', workOrderNumber: 'SO10097-WO1449' }
    ])

    expect(response.values[0]?.painted).toBeNull()
    expect(built.getBuilt).not.toHaveBeenCalled()
  })

  it('uses only the first linked 8-prefix child Work Order when multiple exist', async () => {
    const queryAll = vi.fn(async () =>
      result([
        childRecord('900', '8HS8702P', '901', 'SO10097-WO1450'),
        childRecord('900', '8HS8702P-ALT', '902', 'SO10097-WO1451')
      ])
    )
    const built: WorkOrderBuiltProvider = {
      getBuilt: vi.fn(async (internalId) => (internalId === '901' ? 2 : 9)),
      invalidate: vi.fn()
    }
    const provider = new NetSuiteWorkOrderPaintedProvider(
      { queryAll } as unknown as SuiteQlClient,
      built,
      logger
    )

    const response = await provider.getPaintedValues([
      { workOrderInternalId: '900', workOrderNumber: 'SO10097-WO1449' }
    ])

    expect(response.values[0]?.painted).toBe(2)
    expect(built.getBuilt).toHaveBeenCalledTimes(1)
    expect(built.getBuilt).toHaveBeenCalledWith('901', 'SO10097-WO1450')
    expect(logger.info).toHaveBeenCalledWith(
      'Additional paint child Work Orders were ignored.',
      expect.objectContaining({ parentWorkOrderInternalId: '900', ignoredCandidateCount: 1 })
    )
  })

  it('isolates a SuiteQL failure and clears its cache on refresh', async () => {
    const queryAll = vi
      .fn()
      .mockRejectedValueOnce(new Error('sanitized failure'))
      .mockResolvedValueOnce(result([childRecord()]))
    const provider = new NetSuiteWorkOrderPaintedProvider(
      { queryAll } as unknown as SuiteQlClient,
      builtProvider(1),
      logger
    )
    const workOrder = { workOrderInternalId: '900', workOrderNumber: 'SO10097-WO1449' }

    expect((await provider.getPaintedValues([workOrder])).values[0]?.painted).toBeNull()
    provider.invalidate()
    expect((await provider.getPaintedValues([workOrder])).values[0]?.painted).toBe(1)
  })
})
