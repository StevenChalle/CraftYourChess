import { Link } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProfileSearch } from '@/features/player/search'
import { m } from '@/paraglide/messages'

/**
 * Profile header: the analysis tab with its filters. A single game is analysed from the list of
 * games, where it is.
 */
export function ReviewButtons({ usernames }: { usernames: ProfileSearch }) {
  return (
    <Button size="lg" asChild className="max-sm:w-full">
      <Link to="/player/analysis" search={usernames} resetScroll={false}>
        <SlidersHorizontal data-icon="inline-start" />
        {m.review_button()}
      </Link>
    </Button>
  )
}
