export type StatusTone = 'neutral' | 'planned' | 'active' | 'complete' | 'closed' | 'cancelled'

export function getStatusTone(label?: string): StatusTone {
  const value = label?.toLowerCase() ?? ''

  if (value.includes('cancel')) return 'cancelled'
  if (value.includes('closed')) return 'closed'
  if (value.includes('complete') || value.includes('built')) return 'complete'
  if (value.includes('released') || value.includes('process')) return 'active'
  if (value.includes('planned')) return 'planned'
  return 'neutral'
}
