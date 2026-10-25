import {
  ChessKnight,
  Grid3x3,
  Languages,
  Palette,
  Settings,
  Star,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import '@/components/board/boardStyles.css'
import {
  BOARD_COLORS,
  BOARD_PRESETS,
  PIECE_SETS,
  pieceImage,
  setBoardStyle,
  useBoardStyle,
  type BoardColor,
  type BoardStyle,
  type PieceSet,
} from '@/components/board/boardStyle'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FavoriteDialog } from '@/features/background/components/FavoriteDialog'
import { FavoritesSettings } from '@/features/background/components/FavoritesSettings'
import type { ReviewAccount } from '@/features/review/fetch'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { getLocale, locales, setLocale, type Locale } from '@/paraglide/runtime'

/** Endonyms: each language is named in itself, whatever the current locale. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' }

const COLOR_LABELS: Record<BoardColor, () => string> = {
  brown: m.board_color_brown,
  blue: m.board_color_blue,
  green: m.board_color_green,
  purple: m.board_color_purple,
  grey: m.board_color_grey,
}

/** Piece sets keep their own names (Lichess's), as brands do. */
const PIECE_LABELS: Record<PieceSet, string> = {
  cburnett: 'Cburnett',
  merida: 'Merida',
  chessnut: 'Chessnut',
  mpchess: 'MPChess',
}

const PRESET_LABELS: Record<keyof typeof BOARD_PRESETS, string> = {
  lichess: 'Lichess',
  chesscom: 'Chess.com',
}

const SELECTED = 'ring-2 ring-primary'

/** A section of the menu: an icon and a label, separated from the next by a line. */
function Group({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2.5 py-3.5 first:pt-0 last:pb-0">
      <p className="label-etabli flex items-center gap-1.5">
        <Icon aria-hidden className="size-3.5" />
        {title}
      </p>
      {children}
    </section>
  )
}

function Swatch({ board, className }: { board: BoardColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('board-swatch block rounded-sm', `board-${board}`, className)}
    />
  )
}

const sameStyle = (a: BoardStyle, b: BoardStyle) => a.board === b.board && a.pieces === b.pieces

/**
 * The gear at the top right: language, how boards look (a whole style in one click, or colors
 * and pieces one by one) and the favorite players. The look is remembered (boardStyle.ts); changing
 * the language reloads the page (Paraglide's model).
 */
export function SettingsMenu() {
  const style = useBoardStyle()
  const currentLocale = getLocale()
  const [removing, setRemoving] = useState<ReviewAccount[] | undefined>(undefined)
  const [open, setOpen] = useState(false)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={m.settings()}
            title={m.settings()}
            className="text-muted-foreground hover:text-text-strong"
          >
            <Settings />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-[85dvh] w-80 max-w-[calc(100vw-2rem)] gap-0 divide-y divide-border-strong/35 overflow-y-auto"
        >
          <Group icon={Languages} title={m.settings_language()}>
            <div className="grid grid-cols-2 gap-2">
              {locales.map((locale) => (
                <button
                  key={locale}
                  type="button"
                  lang={locale}
                  aria-pressed={locale === currentLocale}
                  onClick={() => locale !== currentLocale && setLocale(locale)}
                  className={cn(
                    'rounded-md border border-border px-2 py-1.5 text-sm transition-colors hover:bg-muted',
                    locale === currentLocale && SELECTED,
                  )}
                >
                  {LANGUAGE_NAMES[locale]}
                </button>
              ))}
            </div>
          </Group>

          <Group icon={Palette} title={m.settings_style()}>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(BOARD_PRESETS) as (keyof typeof BOARD_PRESETS)[]).map((preset) => {
                const presetStyle = BOARD_PRESETS[preset]
                const on = sameStyle(style, presetStyle)
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setBoardStyle(presetStyle)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border border-border p-2 text-sm transition-colors hover:bg-muted',
                      on && SELECTED,
                    )}
                  >
                    <span className="relative size-9 shrink-0">
                      <Swatch board={presetStyle.board} className="size-full" />
                      <img
                        src={pieceImage(presetStyle.pieces, 'wN')}
                        alt=""
                        className="absolute inset-0 size-full p-0.5"
                      />
                    </span>
                    {PRESET_LABELS[preset]}
                  </button>
                )
              })}
            </div>
          </Group>

          <Group icon={Grid3x3} title={m.settings_board()}>
            <div className="flex gap-2">
              {BOARD_COLORS.map((board) => (
                <button
                  key={board}
                  type="button"
                  aria-pressed={style.board === board}
                  aria-label={COLOR_LABELS[board]()}
                  title={COLOR_LABELS[board]()}
                  onClick={() => setBoardStyle({ board })}
                  className={cn('rounded-sm', style.board === board && SELECTED)}
                >
                  <Swatch board={board} className="size-8" />
                </button>
              ))}
            </div>
          </Group>

          <Group icon={ChessKnight} title={m.settings_pieces()}>
            <div className="flex gap-2">
              {PIECE_SETS.map((pieces) => (
                <button
                  key={pieces}
                  type="button"
                  aria-pressed={style.pieces === pieces}
                  aria-label={PIECE_LABELS[pieces]}
                  title={PIECE_LABELS[pieces]}
                  onClick={() => setBoardStyle({ pieces })}
                  className={cn(
                    'rounded-sm bg-muted p-0.5 transition-colors hover:bg-secondary',
                    style.pieces === pieces && SELECTED,
                  )}
                >
                  <img src={pieceImage(pieces, 'wN')} alt="" className="size-8" />
                </button>
              ))}
            </div>
          </Group>

          <Group icon={Star} title={m.settings_favorites()}>
            <FavoritesSettings onRemove={setRemoving} onOpenProfile={() => setOpen(false)} />
          </Group>
        </PopoverContent>
      </Popover>
      {removing && (
        <FavoriteDialog
          mode="remove"
          accounts={removing}
          open
          onOpenChange={(open) => !open && setRemoving(undefined)}
        />
      )}
    </>
  )
}
