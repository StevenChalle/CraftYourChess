import { UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { m } from '@/paraglide/messages'
import type { PlayerUsernames } from '../search'
import { PlayerOverview } from './PlayerOverview'

/**
 * After the player's name, before the favorite star: the profile of these accounts (ratings,
 * records, both platforms), in a dialog. The page itself opens on the games.
 */
export function ProfileButton({ usernames }: { usernames: PlayerUsernames }) {
  const [open, setOpen] = useState(false)
  const label = m.profile_show()

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              onClick={() => setOpen(true)}
              className="size-14 rounded-lg text-muted-foreground hover:text-primary"
            >
              <UserRound className="size-10" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl lg:max-w-5xl"
        >
          <DialogHeader>
            <DialogTitle icon={UserRound}>{m.profile_title()}</DialogTitle>
          </DialogHeader>
          <div className="-mx-4 overflow-y-auto px-4 pb-1">
            <PlayerOverview usernames={usernames} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
