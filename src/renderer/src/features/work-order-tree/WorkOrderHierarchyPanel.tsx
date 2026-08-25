import type { CSSProperties } from 'react'
import type { WorkOrderNode } from '@shared/types/backlog'
import { StatusBadge } from '../../components/StatusBadge'

interface WorkOrderHierarchyPanelProps {
  root: WorkOrderNode
  source?: 'live-rest' | 'demo'
}

function WorkOrderTreeRows({ nodes, depth = 0 }: { nodes: WorkOrderNode[]; depth?: number }) {
  return nodes.map((node) => {
    const indentation = { '--tree-depth': depth } as CSSProperties
    const hasWorkOrder = Boolean(node.workOrderNumber.trim())
    return (
      <div className="work-order-tree__branch" key={node.internalId} role="treeitem">
        <div className="work-order-tree__row" style={indentation}>
          <span className="work-order-tree__item">
            <span className="work-order-tree__connector" aria-hidden="true" />
            {node.item || '—'}
          </span>
          <strong>{hasWorkOrder ? node.workOrderNumber : '—'}</strong>
          {hasWorkOrder ? (
            <StatusBadge label={node.statusLabel || 'Unknown'} compact />
          ) : (
            <span className="no-work-order">No Work Order</span>
          )}
        </div>
        {node.children.length > 0 ? (
          <div role="group">
            <WorkOrderTreeRows nodes={node.children} depth={depth + 1} />
          </div>
        ) : null}
      </div>
    )
  })
}

export function WorkOrderHierarchyPanel({ root, source }: WorkOrderHierarchyPanelProps) {
  return (
    <section
      className="hierarchy-panel"
      aria-label={`Related work orders for ${root.workOrderNumber}`}
    >
      <div className="hierarchy-panel__summary">
        <div>
          <p className="eyebrow">Top-level Work Order</p>
          <h3>
            {root.item || 'Assembly item unavailable'} <span>·</span> {root.workOrderNumber}
          </h3>
        </div>
        <div className="hierarchy-panel__status">
          {source === 'demo' ? <span className="demo-hierarchy-badge">Demo hierarchy</span> : null}
          <StatusBadge label={root.statusLabel || 'Unknown'} />
        </div>
      </div>

      <div className="hierarchy-panel__heading">
        <h4>Subitem Work Orders</h4>
        <span>{root.children.length} direct subitems</span>
      </div>

      {root.children.length === 0 ? (
        <div className="hierarchy-panel__empty">No linked subitem Work Orders were found.</div>
      ) : (
        <div className="work-order-tree" role="tree" aria-label="Subitem Work Orders">
          <div className="work-order-tree__header" aria-hidden="true">
            <span>Sub Item</span>
            <span>Work Order</span>
            <span>Status</span>
          </div>
          <WorkOrderTreeRows nodes={root.children} />
        </div>
      )}
    </section>
  )
}
