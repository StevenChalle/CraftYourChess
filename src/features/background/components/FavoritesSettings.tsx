import { Link } from '@tanstack/react-router'
import { ChevronRight, X } from 'lucide-react'
import { Accordion } from 'radix-ui'
import { useState } from 'react'
import { SourceDot } from '@/features/player/components/SourceBadge'
import { SOURCE_LABELS } from '@/features/player/summary'
import type { ReviewAccount } from '@/features/review/fetch'
import { formatList, formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'
import {
  playerAccounts,
  playerName,
  setFavorites,
  useFavorites,
  withOptions,
  type FavoriteOptions,
  type Favorites,
} from '../favorites'
import { FavoriteOptionsFields } from './FavoriteOptionsFields'

/**
 * The favorite players (added from their profile, removed with their cross), each folding open on
 * their own options, one at a time; the last one added is open at first, so the options are easy
 * to find (docs/background-analysis.md). The name leads to their profile. Changes apply at once.
 */
export function FavoritesSettings({
  onRemove,
  onOpenProfile,
}: {
  /** Opens the removal dialog, outside the popover (whose content unmounts when it takes focus) */
  onRemove: (accounts: ReviewAccount[]) => void
  /** A favorite's profile is being opened: closes the popover */
  onOpenProfile: () => void
}) {
  const favorites = useFavorites()
  if (!favorites) {
    return (
      <div className="space-y-0.5 text-sm">
        <p className="text-text-strong">{m.favorites_none()}</p>
        <p className="text-xs text-muted-foreground">{m.favorites_empty()}</p>
      </div>
    )
  }
  return <FavoritesList favorites={favorites} onRemove={onRemove} onOpenProfile={onOpenProfile} />
}

function FavoritesList({
  favorites,
  onRemove,
  onOpenProfile,
}: {
  favorites: Favorites
  onRemove: (accounts: ReviewAccount[]) => void
  onOpenProfile: () => void
}) {
  const keyOf = (index: number) => playerName(favorites.players[index]!).toLowerCase()
  // Controlled: the summary toggles its favorite too, the name being a link.
  const [open, setOpen] = useState(() => keyOf(favorites.players.length - 1))
  const toggle = (key: string) => setOpen((current) => (current === key ? '' : key))

  return (
    <Accordion.Root
      type="single"
      collapsible
      value={open}
      onValueChange={setOpen}
      className="-mx-2 space-y-0.5 text-sm"
    >
      {favorites.players.map((player, index) => {
        const accounts = playerAccounts(player)
        const name = playerName(player)
        const platforms = formatList(accounts.map(({ source }) => SOURCE_LABELS[source]))
        return (
          <Accordion.Item key={keyOf(index)} value={keyOf(index)} className="group/favorite">
            <Accordion.Header className="flex items-center gap-1 rounded-sm pr-1 hover:bg-muted/60">
              <Accordion.Trigger
                aria-label={name}
                className="flex shrink-0 cursor-pointer items-center gap-2 py-1 pl-2"
              >
                <ChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/favorite:rotate-90"
                />
                {/* The platforms as dots: the same name on both sites is one row. */}
                <span title={platforms} className="flex w-5 shrink-0 gap-1">
                  {accounts.map(({ source }) => (
                    <SourceDot key={source} source={source} />
                  ))}
                  <span className="sr-only">{platforms}</span>
                </span>
              </Accordion.Trigger>
              <Link
                to="/player/history"
                search={{ lichess: player.lichess, chesscom: player.chesscom }}
                title={m.favorite_open_profile({ player: name })}
                onClick={onOpenProfile}
                className="min-w-0 truncate rounded-sm py-1 font-medium text-text-strong hover:text-primary hover:underline"
              >
                {name}
              </Link>
              {/* The rest of the row folds too (for the mouse: the chevron does it for the keyboard). */}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={() => toggle(keyOf(index))}
                className="flex min-w-0 flex-1 cursor-pointer justify-end self-stretch pl-2 text-xs text-muted-foreground"
              >
                <span className="self-center">{optionsSummary(player)}</span>
              </button>
              <button
                type="button"
                aria-label={m.favorite_remove_named({ player: name })}
                title={m.favorite_remove_named({ player: name })}
                onClick={() => onRemove(accounts)}
                className="rounded-sm p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-text-strong"
              >
                <X className="size-3.5" />
              </button>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <div className="px-2 pt-2 pb-3">
                <FavoriteOptionsFields
                  options={player}
                  onChange={(options) => setFavorites(withOptions(favorites, index, options))}
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        )
      })}
    </Accordion.Root>
  )
}

/** A favorite's options in a few words: "500 · deep". */
function optionsSummary({ depth, deep }: FavoriteOptions): string {
  const count = formatNumber(depth)
  return deep ? m.favorite_summary_deep({ count }) : m.favorite_summary({ count })
}
