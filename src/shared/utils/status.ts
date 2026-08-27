export type StatusTone = 'neutral' | 'planned' | 'active' | 'complete' | 'closed' | 'cancelled'

export function getStatusTone(label?: string): StatusTone {
  const value = label?.toLowerCase() ?? ''

  if (value.includes('cancel') || value.includes('planned') || value.includes('released')) {
    return 'cancelled'
  }
  if (value.includes('closed') || value.includes('complete') || value.includes('built')) {
    return 'complete'
  }
  if (value.includes('process')) return 'planned'
  return 'neutral'
}
