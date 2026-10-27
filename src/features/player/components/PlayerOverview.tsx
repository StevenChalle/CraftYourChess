import { formatMonthYear, formatNumber, formatRelative } from '@/lib/format'
import { InfoTip } from '@/components/InfoTip'
import { m } from '@/paraglide/messages'
import type { PlayerUsernames } from '../search'
import { earliestJoin, latestActivity, SOURCE_LABELS, sumRecords, totalGames } from '../summary'
import { usePlayerAccounts } from '../usePlayerAccounts'
import { AccountCard } from './AccountCard'
import { CurrentRatings } from './CurrentRatings'
import { RatingHistory } from '../rating/RatingHistory'
import { GamesByCategory } from './GamesByCategory'
import { Panel, StatTile } from './Panel'
import { ResultBar } from './ResultBar'
import { SourceLabel } from './SourceBadge'

export function PlayerOverview({ usernames }: { usernames: PlayerUsernames }) {
  const { states, linked, accounts: allAccounts } = usePlayerAccounts(usernames)
  // Closed accounts expose no stats: keep them out of the combined figures.
  const accounts = allAccounts.filter((account) => !account.closed)
  const withRecord = accounts.filter((account) => account.record)
  const record = sumRecords(withRecord.map((account) => account.record))
  const oldest = earliestJoin(accounts)
  const latest = latestActivity(accounts)
  // Chess.com only publishes the records of rated games: its casual games are not counted.
  const hasChessCom = withRecord.some((account) => account.source === 'chesscom')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Always show both platforms, so a missing link stays visible */}
        <AccountCard source="lichess" state={states.lichess} />
        <AccountCard source="chesscom" state={states.chesscom} />
      </div>

      {accounts.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label={
                hasChessCom ? (
                  <span className="inline-flex items-center gap-1.5">
                    {m.games_played()}
                    <InfoTip text={m.chesscom_rated_only()} />
                  </span>
                ) : (
                  m.games_played()
                )
              }
              value={formatNumber(totalGames(record))}
              hint={
                withRecord.length > 1 &&
                withRecord
                  .map(
                    (account) =>
                      `${SOURCE_LABELS[account.source]} ${formatNumber(totalGames(account.record!))}`,
                  )
                  .join(' · ')
              }
            />
            <StatTile
              label={m.playing_since()}
              text
              value={oldest?.joinedAt ? formatMonthYear(oldest.joinedAt) : '—'}
              hint={
                oldest &&
                accounts.length > 1 &&
                m.on_platform({ platform: SOURCE_LABELS[oldest.source] })
              }
            />
            <StatTile
              label={m.last_activity()}
              text
              value={latest?.lastSeenAt ? formatRelative(latest.lastSeenAt) : '—'}
              hint={
                latest &&
                accounts.length > 1 &&
                m.on_platform({ platform: SOURCE_LABELS[latest.source] })
              }
            />
          </div>

          <RatingHistory accounts={accounts} />

          <div className="grid gap-4 lg:grid-cols-2">
            <CurrentRatings accounts={accounts} sources={linked} />
            <div className="space-y-4">
              <Panel
                title={m.overall_record()}
                aside={
                  (withRecord.length > 1 || hasChessCom) && (
                    <span className="inline-flex items-center gap-1.5">
                      {withRecord.length > 1 && m.all_games_both_sites()}
                      {hasChessCom && <InfoTip text={m.chesscom_rated_only()} />}
                    </span>
                  )
                }
              >
                <ResultBar record={record} />
                {withRecord.length > 1 && (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    {withRecord.map((account) => (
                      <div key={account.source} className="space-y-1.5">
                        <div className="text-xs">
                          <SourceLabel source={account.source} />
                        </div>
                        <ResultBar record={account.record!} compact />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
              <GamesByCategory accounts={accounts} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
