import { useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowLeft, ArrowRight, History, Search } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { FieldButtons } from '@/components/FieldButtons'
import { Button } from '@/components/ui/button'
import type { ApiSource } from '@/lib/http'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { cleanUsername, copySource, otherSource, type PlayerUsernames } from '../search'
import { SOURCE_LABELS } from '../summary'
import { SourceDot } from './SourceBadge'

const TIGHT = 'gap-1.5 px-3 has-data-[icon=inline-start]:pl-2.5'

const INPUT_CLASS =
  'h-control w-full rounded-sm border border-input bg-field px-3 text-sm text-text-strong outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none'

/**
 * One username per platform, either or both. Accounts may have different names:
 * a "same username" shortcut copies one field into the other.
 */
export function AccountSearchForm({
  initial = {},
  variant = 'full',
  autoFocus,
  className,
}: {
  initial?: PlayerUsernames
  variant?: 'full' | 'compact'
  autoFocus?: boolean
  className?: string
}) {
  const [values, setValues] = useState<Record<ApiSource, string>>({
    lichess: initial.lichess ?? '',
    chesscom: initial.chesscom ?? '',
  })
  const [lastEdited, setLastEdited] = useState<ApiSource | null>(null)
  const navigate = useNavigate()
  const lichess = cleanUsername(values.lichess)
  const chesscom = cleanUsername(values.chesscom)
  const canSubmit = Boolean(lichess || chesscom)
  const compact = variant === 'compact'

  const setValue = (source: ApiSource, value: string) => {
    setValues((current) => ({ ...current, [source]: value }))
    setLastEdited(source)
  }

  /** Fills `target` with the other field's username. */
  const copyInto = (target: ApiSource) => {
    setValues((current) => ({ ...current, [target]: current[otherSource(target)].trim() }))
  }

  const canCopyInto = (target: ApiSource) => {
    const from = cleanUsername(values[otherSource(target)])
    return Boolean(from) && from !== cleanUsername(values[target])
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    void navigate({ to: '/player/history', search: { lichess, chesscom } })
  }

  /** Skips the profile: straight to the review of the last game. */
  function reviewLastGame() {
    if (!canSubmit) return
    void navigate({ to: '/player/results', search: { lichess, chesscom, start: 'last' } })
  }

  // Full form: a single button on the Chess.com field copies the Lichess username above it.
  const copyButton = (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={!canCopyInto('chesscom')}
      onClick={() => copyInto('chesscom')}
      title={m.search_copy_title({ from: SOURCE_LABELS.lichess })}
      aria-label={m.search_copy_label({ from: SOURCE_LABELS.lichess, to: SOURCE_LABELS.chesscom })}
      className="text-muted-foreground"
    >
      <ArrowDown />
      {m.search_same_username()}
    </Button>
  )

  if (compact) {
    // A single button between the fields copies from the last edited one.
    const from = copySource(values, lastEdited)
    const to = from && otherSource(from)
    return (
      <form
        onSubmit={handleSubmit}
        role="search"
        className={cn('flex items-center gap-1', className)}
      >
        <UsernameInput source="lichess" value={values.lichess} onChange={setValue} compact />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!from}
          onClick={() => to && copyInto(to)}
          title={
            from && to
              ? m.search_copy_title_to({ from: SOURCE_LABELS[from], to: SOURCE_LABELS[to] })
              : m.search_copy_title_any()
          }
          aria-label={
            from && to
              ? m.search_copy_label({ from: SOURCE_LABELS[from], to: SOURCE_LABELS[to] })
              : m.search_copy_title_any()
          }
          className="text-muted-foreground"
        >
          {from === 'chesscom' ? <ArrowLeft /> : <ArrowRight />}
        </Button>
        <UsernameInput source="chesscom" value={values.chesscom} onChange={setValue} compact />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          disabled={!canSubmit}
          aria-label={m.search_submit()}
        >
          <Search />
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={cn('space-y-3', className)}>
      <UsernameInput
        source="lichess"
        value={values.lichess}
        onChange={setValue}
        autoFocus={autoFocus}
      />
      <UsernameInput
        source="chesscom"
        value={values.chesscom}
        onChange={setValue}
        labelAside={copyButton}
      />
      <p className="text-xs text-muted-foreground">{m.search_one_is_enough()}</p>
      {/* Tighter than other large buttons: both fit on one line, beside the import column */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg" disabled={!canSubmit} className={TIGHT}>
          <Search data-icon="inline-start" />
          {m.search_find_profile()}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={!canSubmit}
          onClick={reviewLastGame}
          className={TIGHT}
        >
          <History data-icon="inline-start" />
          {m.review_button_last()}
        </Button>
      </div>
    </form>
  )
}

function UsernameInput({
  source,
  value,
  onChange,
  autoFocus,
  labelAside,
  compact,
}: {
  source: ApiSource
  value: string
  onChange: (source: ApiSource, value: string) => void
  autoFocus?: boolean
  labelAside?: ReactNode
  compact?: boolean
}) {
  const id = useId()
  const label = SOURCE_LABELS[source]

  const input = (
    <input
      id={id}
      value={value}
      onChange={(event) => onChange(source, event.target.value)}
      placeholder={compact ? label : m.search_username_placeholder({ platform: label })}
      aria-label={compact ? m.search_username_placeholder({ platform: label }) : undefined}
      autoFocus={autoFocus}
      spellCheck={false}
      autoComplete="off"
      autoCapitalize="off"
      className={cn(INPUT_CLASS, compact ? 'pl-6' : 'pr-15')}
    />
  )

  if (compact) {
    return (
      <div className="relative w-36">
        <SourceDot source={source} className="absolute top-1/2 left-2.5 -translate-y-1/2" />
        {input}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex h-6 items-center justify-between">
        <label htmlFor={id} className="inline-flex items-center gap-1.5 text-sm">
          <SourceDot source={source} />
          {label}
        </label>
        {labelAside}
      </div>
      {/* While focused: clear it, or paste the clipboard (a username copied from the platform) */}
      <div className="group relative">
        {input}
        <FieldButtons
          hasValue={value !== ''}
          onClear={() => onChange(source, '')}
          onPaste={(text) => onChange(source, text.trim())}
          className="top-1/2 right-1.5 -translate-y-1/2"
        />
      </div>
    </div>
  )
}
