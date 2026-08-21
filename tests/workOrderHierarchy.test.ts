import { describe, expect, it } from 'vitest'

import { buildWorkOrderHierarchy } from '../src/main/services/workOrderHierarchy'
import { makeWorkOrderRecord } from './helpers/testData'

describe('buildWorkOrderHierarchy', () => {
  it('builds a parent with multiple children', () => {
    const hierarchy = buildWorkOrderHierarchy(
      [
        makeWorkOrderRecord('wo-parent'),
        makeWorkOrderRecord('wo-child-a', 'wo-parent'),
        makeWorkOrderRecord('wo-child-b', 'wo-parent')
      ],
      'wo-parent'
    )

    expect(hierarchy?.children.map((node) => node.internalId)).toEqual(['wo-child-a', 'wo-child-b'])
  })

  it('supports a parent, child, and grandchild recursively', () => {
    const hierarchy = buildWorkOrderHierarchy(
      [
        makeWorkOrderRecord('wo-parent'),
        makeWorkOrderRecord('wo-child-a', 'wo-parent'),
        makeWorkOrderRecord('wo-grandchild-a1', 'wo-child-a')
      ],
      'wo-parent'
    )

    expect(hierarchy?.children[0]?.children[0]?.internalId).toBe('wo-grandchild-a1')
  })

  it('deduplicates repeated work orders by internal ID', () => {
    const hierarchy = buildWorkOrderHierarchy(
      [
        makeWorkOrderRecord('wo-parent'),
        makeWorkOrderRecord('wo-child', 'wo-parent'),
        makeWorkOrderRecord('wo-child', 'wo-parent')
      ],
      'wo-parent'
    )

    expect(hierarchy?.children).toHaveLength(1)
  })

  it('normalizes whitespace around relationship internal IDs', () => {
    const hierarchy = buildWorkOrderHierarchy(
      [makeWorkOrderRecord(' wo-parent '), makeWorkOrderRecord(' wo-child ', ' wo-parent ')],
      ' wo-parent '
    )

    expect(hierarchy?.internalId).toBe('wo-parent')
    expect(hierarchy?.children[0]?.internalId).toBe('wo-child')
  })

  it('cuts a circular WO1 -> WO2 -> WO1 relationship without recursing forever', () => {
    const hierarchy = buildWorkOrderHierarchy(
      [makeWorkOrderRecord('wo-1', 'wo-2'), makeWorkOrderRecord('wo-2', 'wo-1')],
      'wo-1'
    )

    expect(hierarchy?.internalId).toBe('wo-1')
    expect(hierarchy?.children[0]?.internalId).toBe('wo-2')
    expect(hierarchy?.children[0]?.children).toEqual([])
  })

  it('does not attach an orphan whose parent internal ID is missing', () => {
    const hierarchy = buildWorkOrderHierarchy(
      [makeWorkOrderRecord('wo-root'), makeWorkOrderRecord('wo-orphan', 'wo-missing')],
      'wo-root'
    )

    expect(hierarchy?.children).toEqual([])
  })

  it('returns undefined when the requested root is unavailable', () => {
    expect(buildWorkOrderHierarchy([makeWorkOrderRecord('wo-other')], 'wo-missing')).toBeUndefined()
  })
})
