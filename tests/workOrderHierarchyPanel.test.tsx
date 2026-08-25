import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WorkOrderHierarchyPanel } from '../src/renderer/src/features/work-order-tree/WorkOrderHierarchyPanel'
import type { WorkOrderNode } from '../src/shared/types/backlog'

const hierarchy: WorkOrderNode = {
  internalId: 'demo-root',
  workOrderNumber: 'WO1000',
  item: 'DEMO-ASSEMBLY',
  statusLabel: 'Released',
  children: [
    {
      internalId: 'demo-child',
      workOrderNumber: 'WO1001',
      item: 'ABC123',
      statusLabel: 'Complete',
      children: []
    },
    {
      internalId: 'demo-component-without-work-order',
      workOrderNumber: '',
      item: 'ABC456',
      statusLabel: 'No Work Order',
      children: []
    }
  ]
}

describe('WorkOrderHierarchyPanel', () => {
  it('renders expandable demo content without retired quantity columns', () => {
    const markup = renderToStaticMarkup(<WorkOrderHierarchyPanel root={hierarchy} source="demo" />)

    expect(markup).toContain('Demo hierarchy')
    expect(markup).toContain('Sub Item')
    expect(markup).toContain('Work Order')
    expect(markup).toContain('Status')
    expect(markup).toContain('ABC123')
    expect(markup).toContain('WO1001')
    expect(markup).toContain('Complete')
    expect(markup).toContain('ABC456')
    expect(markup).toContain('No Work Order')
    expect(markup).not.toMatch(/Qty Shipped|Qty Remaining/i)
  })
})
