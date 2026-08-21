import { getStatusTone } from '@shared/utils/status'

interface StatusBadgeProps {
  label: string
  compact?: boolean
}

export function StatusBadge({ label, compact = false }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge--${getStatusTone(label)}${compact ? ' status-badge--compact' : ''}`}
    >
      <span className="status-badge__dot" aria-hidden="true" />
      {label}
    </span>
  )
}
