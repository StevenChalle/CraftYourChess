import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useImportedGames } from '@/features/import/store'
import type { ProfileSearch } from '@/features/player/search'
import { parseGameRef } from '@/features/review/gameRef'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { StudyView } from '@/features/study/components/StudyView'
import { shouldRetry } from '@/lib/http'
import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/player/review')({
  component: ReviewPage,
})

/**
 * A game on its own page, to study it (StudyView): any game of the profile's accounts, fetched
 * from its platform, or of the imported batch (gone once the page is reloaded).
 */
function ReviewPage() {
  const search = Route.useSearch()
  const { library, accounts } = useAnalysisSession()
  const imported = useImportedGames()
  const ref = parseGameRef(search.review)
  const usernames: ProfileSearch = search.import
    ? { import: true }
    : { lichess: search.lichess, chesscom: search.chesscom }
  const query = useQuery({
    queryKey: ['study-game', search.import ? `import-${imported?.id}` : 'accounts', search.review],
    queryFn: async ({ signal }) => {
      const found = await library.findOne(ref!, signal)
      const failure = found.failures[0]
      if (failure) throw failure.error
      return found.games[0] ?? null
    },
    enabled: ref !== undefined,
    staleTime: Infinity,
    retry: shouldRetry,
  })

  const back = (
    <Link
      to={search.import ? '/player/history' : '/player'}
      search={usernames}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-4" />
      {search.import ? m.study_back_import() : m.study_back_profile()}
    </Link>
  )
  const message = (text: string, tone = 'text-muted-foreground') => (
    <div className="space-y-3">
      {back}
      <p className={tone}>{text}</p>
    </div>
  )

  if (!ref) return message(m.study_not_found())
  if (query.isPending) return message(m.study_loading())
  if (query.isError) return message(m.study_not_found(), 'text-loss')
  const game = query.data
  if (!game) return message(search.import ? m.study_lost_import() : m.study_not_found())
  const player = search.import
    ? imported?.names[0]
    : accounts.find((account) => account.source === game.source)?.username
  return (
    <StudyView
      key={search.review}
      game={game}
      ply={search.ply ?? 0}
      usernames={usernames}
      player={player}
      back={back}
    />
  )
}
