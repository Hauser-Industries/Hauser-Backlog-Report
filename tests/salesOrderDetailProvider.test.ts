import { describe, expect, it, vi } from 'vitest'

import type { NetSuiteHttpClient } from '../src/main/netsuite/client/netsuiteHttpClient'
import type { SuiteQlClient } from '../src/main/netsuite/client/suiteQlClient'
import { NetSuiteSalesOrderDetailProvider } from '../src/main/netsuite/details/salesOrderDetailProvider'

describe('NetSuiteSalesOrderDetailProvider', () => {
  it('reads optional REST line references, resolves explicit Work Orders, and caches success', async () => {
    const getRestRecord = vi.fn(async () => {
      return {
        item: {
          items: [
            {
              lineuniquekey: '11',
              line: 1,
              custcol_nscs_paintreplacementsku: { id: '50', refName: 'PAINT-BLACK' },
              custcol_nscs_fabricreplacementsku: { id: '51', refName: 'FABRIC-SLATE' },
              custcol_nscs_weltreplacement: { id: '52', refName: 'WELT-SLATE' },
              custcol_nscs_buttonreplacement: { id: '53', refName: 'BUTTON-BLACK' },
              createwo: true
            }
          ]
        }
      }
    })
    const queryAll = vi.fn(async () => ({
      items: [
        {
          item_internal_id: '50',
          item_name: 'PAINT-BLACK',
          item_description: 'Black powder coat'
        },
        {
          item_internal_id: '51',
          item_name: 'FABRIC-SLATE',
          item_description: 'Slate fabric'
        },
        {
          item_internal_id: '52',
          item_name: 'WELT-SLATE',
          item_description: 'Slate welt'
        },
        {
          item_internal_id: '53',
          item_name: 'BUTTON-BLACK',
          item_description: 'Black button'
        }
      ],
      totalResults: 4,
      pages: 1
    }))
    const provider = new NetSuiteSalesOrderDetailProvider({
      getRestRecord
    } as unknown as NetSuiteHttpClient, {
      queryAll
    } as unknown as SuiteQlClient)

    const first = await provider.getDetails('10144')
    const second = await provider.getDetails('10144')

    expect(first).toEqual({
      success: true,
      items: [
        {
          lineId: '11',
          lineSequence: 1,
          paintName: 'PAINT-BLACK',
          paintDescription: 'Black powder coat',
          fabricName: 'FABRIC-SLATE',
          fabricDescription: 'Slate fabric',
          weltName: 'WELT-SLATE',
          weltDescription: 'Slate welt',
          buttonName: 'BUTTON-BLACK',
          buttonDescription: 'Black button'
        }
      ]
    })
    expect(second).toEqual(first)
    expect(getRestRecord).toHaveBeenCalledOnce()
    expect(queryAll).toHaveBeenCalledOnce()
    expect(queryAll).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('WHERE id IN (50, 51, 52, 53)')
      })
    )
  })

  it('keeps optional detail failure localized and sanitized', async () => {
    const provider = new NetSuiteSalesOrderDetailProvider({
      getRestRecord: vi.fn(async () => {
        throw new Error('secret upstream payload')
      })
    } as unknown as NetSuiteHttpClient, {
      queryAll: vi.fn()
    } as unknown as SuiteQlClient)

    await expect(provider.getDetails('10144')).resolves.toEqual({
      success: false,
      message:
        'Optional Paint, Fabric, Welt, and Button details are unavailable for this Sales Order.'
    })
  })

  it('keeps a replacement name when the Item description is missing', async () => {
    const provider = new NetSuiteSalesOrderDetailProvider(
      {
        getRestRecord: vi.fn(async () => ({
          item: {
            items: [
              {
                line: 1,
                custcol_nscs_paintreplacementsku: { id: '50', refName: 'PAINT-BLACK' }
              }
            ]
          }
        }))
      } as unknown as NetSuiteHttpClient,
      {
        queryAll: vi.fn(async () => ({
          items: [{ item_internal_id: '50', item_name: 'PAINT-BLACK' }],
          totalResults: 1,
          pages: 1
        }))
      } as unknown as SuiteQlClient
    )

    await expect(provider.getDetails('10144')).resolves.toEqual({
      success: true,
      items: [{ lineSequence: 1, paintName: 'PAINT-BLACK' }]
    })
  })

  it('does not treat a boolean createwo value as a Work Order reference', async () => {
    const getRestRecord = vi.fn(async () => ({
      item: { items: [{ line: 1, createwo: true }] }
    }))
    const provider = new NetSuiteSalesOrderDetailProvider({
      getRestRecord
    } as unknown as NetSuiteHttpClient, {
      queryAll: vi.fn()
    } as unknown as SuiteQlClient)

    await expect(provider.getDetails('10144')).resolves.toEqual({
      success: true,
      items: [{ lineSequence: 1 }]
    })
    expect(getRestRecord).toHaveBeenCalledOnce()
  })
})
