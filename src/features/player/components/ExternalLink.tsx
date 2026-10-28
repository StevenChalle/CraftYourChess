import { ExternalLink as ExternalLinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ExternalLink({
  href,
  children,
  className,
  title,
}: {
  href: string
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer"
      className={cn('inline-flex items-center gap-1 text-primary hover:underline', className)}
    >
      {children}
      <ExternalLinkIcon className="size-3" />
    </a>
  )
}
