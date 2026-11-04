import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

const BACK_CLASS =
  'inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary'

/** "← Back to …" above a page of the profile: a link, or a button doing the going back itself. */
export function BackLink({
  label,
  to,
  search,
  onClick,
}: {
  label: string
  to?: string
  search?: Record<string, unknown>
  onClick?: () => void
}): ReactNode {
  const content = (
    <>
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </>
  )
  if (onClick || !to) {
    return (
      <button type="button" onClick={onClick} className={BACK_CLASS}>
        {content}
      </button>
    )
  }
  return (
    <Link to={to} search={search} className={BACK_CLASS}>
      {content}
    </Link>
  )
}
