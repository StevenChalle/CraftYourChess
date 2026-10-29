import type { ReactNode } from 'react'

/** A figure of the period, on one line: its label, its value, then `children` (the change). */
export function Figure({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="label-etabli text-[11px]">{label}</span>
      <span className="num text-base font-semibold text-text-strong">{value}</span>
      {children}
    </span>
  )
}
