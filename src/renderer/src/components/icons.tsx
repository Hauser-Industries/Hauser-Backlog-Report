import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const commonProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

export function ChevronIcon({
  direction = 'right',
  ...props
}: IconProps & { direction?: 'right' | 'down' }) {
  return (
    <svg {...commonProps} {...props}>
      <path d={direction === 'right' ? 'm9 18 6-6-6-6' : 'm6 9 6 6 6-6'} />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...commonProps} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...commonProps} {...props}>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.5 9A7 7 0 0 0 6.2 6.2L4 8" />
      <path d="M5.5 15A7 7 0 0 0 17.8 17.8L20 16" />
    </svg>
  )
}

export function PrintIcon(props: IconProps) {
  return (
    <svg {...commonProps} {...props}>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  )
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...commonProps} {...props}>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1 14h6" />
      <path d="M9 8h6" />
      <path d="M17 16h6" />
    </svg>
  )
}

export function SortIcon({
  sortDirection,
  ...props
}: IconProps & { sortDirection: false | 'asc' | 'desc' }) {
  return (
    <svg {...commonProps} {...props} viewBox="0 0 16 16" width="14" height="14">
      {sortDirection === 'asc' ? <path d="m4 10 4-4 4 4" /> : null}
      {sortDirection === 'desc' ? <path d="m4 6 4 4 4-4" /> : null}
      {sortDirection === false ? (
        <>
          <path d="m5 6 3-3 3 3" />
          <path d="m5 10 3 3 3-3" />
        </>
      ) : null}
    </svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...commonProps} {...props}>
      <path d="M10.3 3.6 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
