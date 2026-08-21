const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

export function formatDate(value?: string): string {
  if (!value) return '—'

  const dateOnly = DATE_ONLY_PATTERN.exec(value)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const monthIndex = Number(dateOnly[2]) - 1
    const day = Number(dateOnly[3])
    return DATE_FORMATTER.format(new Date(year, monthIndex, day))
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : DATE_FORMATTER.format(parsed)
}

export function formatDateTime(value?: string): string {
  if (!value) return 'Never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed)
}
