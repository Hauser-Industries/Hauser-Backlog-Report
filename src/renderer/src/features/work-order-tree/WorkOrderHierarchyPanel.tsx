import type { CSSProperties } from 'react'
import type { WorkOrderNode } from '@shared/types/backlog'
import { formatDate } from '@shared/utils/date'
import { formatQuantity } from '@shared/utils/quantity'
import { StatusBadge } from '../../components/StatusBadge'

interface WorkOrderHierarchyPanelProps {
  root: WorkOrderNode
}

interface WorkOrderTreeRowsProps {
  nodes: WorkOrderNode[]
  depth?: number
}

function optionalQuantity(value?: number): string {
  return value === undefined ? '—' : formatQuantity(value)
}

function WorkOrderTreeRows({ nodes, depth = 0 }: WorkOrderTreeRowsProps) {
  return nodes.map((node) => {
    const indentation = { '--tree-depth': depth } as CSSProperties

    return (
      <div className="work-order-tree__branch" key={node.internalId} role="treeitem">
        <div className="work-order-tree__row" style={indentation}>
          <div className="work-order-tree__identity">
            <span className="work-order-tree__connector" aria-hidden="true" />
            <div>
              <strong>{node.workOrderNumber}</strong>
              <span>{node.item || '—'}</span>
            </div>
          </div>
          <span className="work-order-tree__description">{node.itemDescription || '—'}</span>
          <span className="numeric">{optionalQuantity(node.quantity)}</span>
          <span className="numeric">{optionalQuantity(node.quantityCompleted)}</span>
          <span className="numeric">{optionalQuantity(node.quantityRemaining)}</span>
          <span>{formatDate(node.createdDate)}</span>
          <span>{formatDate(node.dueDate)}</span>
          <StatusBadge label={node.statusLabel || 'Unknown'} compact />
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

export function WorkOrderHierarchyPanel({ root }: WorkOrderHierarchyPanelProps) {
  return (
    <section
      className="hierarchy-panel"
      aria-label={`Related work orders for ${root.workOrderNumber}`}
    >
      <div className="hierarchy-panel__summary">
        <div>
          <p className="eyebrow">Top-level work order</p>
          <h3>
            {root.item || 'Item not available'} <span>·</span> {root.workOrderNumber}
          </h3>
        </div>
        <StatusBadge label={root.statusLabel || 'Unknown'} />
      </div>

      <div className="hierarchy-panel__heading">
        <h4>Related Work Orders</h4>
        <span>
          {root.children.length === 1
            ? '1 direct child'
            : `${root.children.length} direct children`}
        </span>
      </div>

      {root.children.length === 0 ? (
        <div className="hierarchy-panel__empty">No related sub-work orders were found.</div>
      ) : (
        <div className="work-order-tree" role="tree" aria-label="Related Work Orders">
          <div className="work-order-tree__header" aria-hidden="true">
            <span>Work Order / Item</span>
            <span>Description</span>
            <span className="numeric">Qty</span>
            <span className="numeric">Qty Complete</span>
            <span className="numeric">Qty Remaining</span>
            <span>Created Date</span>
            <span>Due Date</span>
            <span>Status</span>
          </div>
          <WorkOrderTreeRows nodes={root.children} />
        </div>
      )}
    </section>
  )
}
