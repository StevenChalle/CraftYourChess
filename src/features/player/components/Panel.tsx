import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('panel-etabli p-4 sm:p-5', className)}>
      {/* The aside under the title when they do not fit side by side */}
      {(title || aside) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {title && <h2 className="label-etabli">{title}</h2>}
          {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
