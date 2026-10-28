import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { countryName } from '@/lib/format'
import { m } from '@/paraglide/messages'
import type { PlayerUsernames } from '../search'
import { SOURCE_LABELS, type AccountSummary } from '../summary'
import { ExternalLink } from './ExternalLink'
import { SourceDot } from './SourceBadge'

/**
 * Name, titles, avatar and country, gathered from whichever accounts were found, with a link to
 * each account on its platform (its username when they differ); `nameAction`
 * right after the name and country, `actions` on the right. The name always leads to the profile of
 * these accounts (`profileLink`).
 */
export function PlayerHeader({
  accounts,
  nameAction,
  actions,
  profileLink,
}: {
  accounts: AccountSummary[]
  nameAction?: ReactNode
  actions?: ReactNode
  profileLink: PlayerUsernames
}) {
  const avatarUrl = accounts.find((account) => account.avatarUrl)?.avatarUrl
  const country = accounts.map((account) => countryName(account.countryCode)).find(Boolean)
  const titles = accounts.filter((account) => account.title)
  const sameTitle =
    titles.length > 1 && titles.every((account) => account.title === titles[0]!.title)
  const sameName =
    accounts.length > 1 &&
    accounts.every(
      (account) => account.username.toLowerCase() === accounts[0]!.username.toLowerCase(),
    )
  const [main, ...others] = accounts

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        {avatarUrl && (
          <img src={avatarUrl} alt="" className="size-14 rounded-md bg-card object-cover" />
        )}
        <div>
          <h1 className="flex flex-wrap items-center gap-x-2.5">
            {(sameTitle ? titles.slice(0, 1) : titles).map((account) => (
              <span
                key={account.source}
                className="title-badge"
                title={
                  sameTitle
                    ? undefined
                    : m.player_title_on({ platform: SOURCE_LABELS[account.source] })
                }
              >
                {account.title}
              </span>
            ))}
            <Link to="/player" search={profileLink} className="hover:text-primary">
              {main?.username}
            </Link>
          </h1>

          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            {country && <span>{country}</span>}
            {[main, ...others].map(
              (account) =>
                account && (
                  <ExternalLink
                    key={account.source}
                    href={account.url}
                    title={m.view_on({ platform: SOURCE_LABELS[account.source] })}
                    className="gap-1.5 text-muted-foreground hover:text-primary"
                  >
                    <SourceDot source={account.source} />
                    {sameName || accounts.length === 1
                      ? SOURCE_LABELS[account.source]
                      : account.username}
                  </ExternalLink>
                ),
            )}
          </p>
        </div>
        {nameAction}
      </div>
      {actions}
    </div>
  )
}
