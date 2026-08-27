import { describe, expect, it, vi } from 'vitest'

import type { NetSuiteHttpClient } from '../src/main/netsuite/client/netsuiteHttpClient'
import type { DiagnosticLogger } from '../src/main/netsuite/diagnostics/sanitizedLogger'
import { NetSuiteRestWorkOrderBuiltProvider } from '../src/main/netsuite/workOrders/workOrderBuiltProvider'

function logger(): DiagnosticLogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('NetSuiteRestWorkOrderBuiltProvider', () => {
  it.each([
    ['0', 0],
    ['2', 2],
    [2, 2],
    [null, null]
  ])('normalizes REST built %j as %j', async (raw, expected) => {
    const getRestRecord = vi.fn(async () => ({ built: raw }))
    const provider = new NetSuiteRestWorkOrderBuiltProvider(
      { getRestRecord } as unknown as NetSuiteHttpClient,
      logger()
    )

    await expect(provider.getBuilt('900', 'WO777')).resolves.toBe(expected)
  })

  it('deduplicates and caches repeated Work Order REST requests', async () => {
    const getRestRecord = vi.fn(async () => ({ built: '2' }))
    const provider = new NetSuiteRestWorkOrderBuiltProvider(
      { getRestRecord } as unknown as NetSuiteHttpClient,
      logger()
    )

    const values = await Promise.all([
      provider.getBuilt('900', 'WO777'),
      provider.getBuilt('900', 'WO777'),
      provider.getBuilt('900', 'WO777')
    ])

    expect(values).toEqual([2, 2, 2])
    expect(getRestRecord).toHaveBeenCalledTimes(1)
    expect(getRestRecord).toHaveBeenCalledWith(
      '/services/rest/record/v1/workOrder/900?fields=built',
      expect.anything()
    )
  })

  it('batches unique Work Order IDs for the expansion-time REST lookup', async () => {
    const getRestRecord = vi.fn(async (path: string) => ({
      built: path.includes('/900?') ? '2' : '0'
    }))
    const provider = new NetSuiteRestWorkOrderBuiltProvider(
      { getRestRecord } as unknown as NetSuiteHttpClient,
      logger()
    )

    const result = await provider.getBuiltValues([
      { workOrderInternalId: '900', workOrderNumber: 'WO777' },
      { workOrderInternalId: '900', workOrderNumber: 'WO777' },
      { workOrderInternalId: '901', workOrderNumber: 'WO778' }
    ])

    expect(getRestRecord).toHaveBeenCalledTimes(2)
    expect(result.values).toEqual([
      { workOrderInternalId: '900', built: 2 },
      { workOrderInternalId: '901', built: 0 }
    ])
  })

  it('logs only the safe Work Order Built diagnostics', async () => {
    const getRestRecord = vi.fn(async () => ({ built: '2' }))
    const diagnosticLogger = logger()
    const provider = new NetSuiteRestWorkOrderBuiltProvider(
      { getRestRecord } as unknown as NetSuiteHttpClient,
      diagnosticLogger
    )

    await provider.getBuilt('900', 'WO777')

    expect(diagnosticLogger.info).toHaveBeenCalledWith(
      'Work Order REST Built value inspected.',
      {
        workOrderInternalId: '900',
        workOrderNumber: 'WO777',
        builtRawValue: '2',
        builtNormalizedValue: 2
      }
    )
  })

  it('inspects Work Order metadata once when built is absent', async () => {
    const getRestRecord = vi.fn(async (path: string) =>
      path.includes('metadata-catalog') ? { properties: { built: { type: 'number' } } } : {}
    )
    const diagnosticLogger = logger()
    const provider = new NetSuiteRestWorkOrderBuiltProvider(
      { getRestRecord } as unknown as NetSuiteHttpClient,
      diagnosticLogger
    )

    await provider.getBuilt('900', 'WO777')
    await provider.getBuilt('901', 'WO778')

    expect(getRestRecord).toHaveBeenCalledTimes(3)
    expect(diagnosticLogger.info).toHaveBeenCalledWith('Work Order REST metadata inspected.', {
      builtExposed: true
    })
  })

  it('returns null without breaking the report when REST fails', async () => {
    const getRestRecord = vi.fn(async () => {
      throw new Error('NetSuite REST failure')
    })
    const provider = new NetSuiteRestWorkOrderBuiltProvider(
      { getRestRecord } as unknown as NetSuiteHttpClient,
      logger()
    )

    await expect(provider.getBuilt('900', 'WO777')).resolves.toBeNull()
  })

  it('clears cached Built values on refresh invalidation', async () => {
    const getRestRecord = vi.fn(async () => ({ built: 2 }))
    const provider = new NetSuiteRestWorkOrderBuiltProvider(
      { getRestRecord } as unknown as NetSuiteHttpClient,
      logger()
    )

    await provider.getBuilt('900', 'WO777')
    provider.invalidate()
    await provider.getBuilt('900', 'WO777')

    expect(getRestRecord).toHaveBeenCalledTimes(2)
  })
})
