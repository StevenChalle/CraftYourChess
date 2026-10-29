import { m } from '@/paraglide/messages'
import { profileKey } from '../profileSettings'
import { RatingHistory } from '../rating/RatingHistory'
import type { PlayerUsernames } from '../search'
import { SOURCE_LABELS } from '../summary'
import { usePlayerAccounts } from '../usePlayerAccounts'
import { SourceStatus } from './SourceStatus'

/**
 * The profile, kept to what helps follow one's progress: the rating chart, with the period's
 * results under it. A platform searched but not shown says why; the links to the accounts are in
 * the header.
 */
export function PlayerOverview({ usernames }: { usernames: PlayerUsernames }) {
  const { states, linked, accounts: allAccounts } = usePlayerAccounts(usernames)
  // Closed accounts have no rating to follow.
  const accounts = allAccounts.filter((account) => !account.closed)

  return (
    <div className="space-y-4">
      {linked.map((source) => {
        const state = states[source]
        if (state.status === 'unlinked') return null
        if (state.status !== 'found')
          return <SourceStatus key={source} source={source} state={state} />
        if (!state.account.closed) return null
        return (
          <p key={source} className="text-sm text-loss">
            {SOURCE_LABELS[source]} ·{' '}
            {state.account.flagged ? m.account_closed_tos() : m.account_closed()}
          </p>
        )
      })}
      {accounts.length > 0 && <RatingHistory profile={profileKey(usernames)} accounts={accounts} />}
    </div>
  )
}
