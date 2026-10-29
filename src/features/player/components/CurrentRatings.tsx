import type { ApiSource } from '@/lib/http'
import { m } from '@/paraglide/messages'
import { categoryLabel } from '../sources'
import { CATEGORIES, type AccountSummary } from '../summary'
import { Panel } from './Panel'
import { SourceLabel } from './SourceBadge'

/**
 * Current rating per category, side by side. Deliberately not merged or converted:
 * the two rating systems are not comparable.
 */
export function CurrentRatings({
  accounts,
  sources,
}: {
  accounts: AccountSummary[]
  sources: ApiSource[]
}) {
  const bySource = new Map(accounts.map((account) => [account.source, account]))
  const rows = CATEGORIES.filter((key) => accounts.some((account) => account.categories[key]))

  return (
    <Panel title={m.current_ratings()}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.no_rated_games()}</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-2 text-left font-normal">{m.time_control()}</th>
              {sources.map((source) => (
                <th key={source} className="pb-2 text-right font-normal">
                  <SourceLabel source={source} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((key) => (
              <tr key={key} className="even:bg-field">
                <td className="py-1.5 pl-1">{categoryLabel(key)}</td>
                {sources.map((source) => {
                  const stats = bySource.get(source)?.categories[key]
                  return (
                    <td
                      key={source}
                      className="num py-1.5 pr-1 text-right font-medium text-text-strong"
                    >
                      {stats?.rating ?? (
                        <span className="font-normal text-muted-foreground">—</span>
                      )}
                      {stats?.provisional && <span className="text-muted-foreground">?</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
