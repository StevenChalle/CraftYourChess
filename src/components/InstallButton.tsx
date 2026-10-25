import { Download, EllipsisVertical, Share, SquarePlus, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { promptInstall, useInstallWay, type InstallWay } from '@/lib/install'
import { m } from '@/paraglide/messages'

/** Where the browser cannot prompt: the two steps of its menus, each with the icon to look for. */
const GUIDES: Record<
  Exclude<InstallWay, 'prompt' | 'none'>,
  { icon: LucideIcon; text: () => string }[]
> = {
  ios: [
    { icon: Share, text: m.install_ios_step1 },
    { icon: SquarePlus, text: m.install_ios_step2 },
  ],
  'mac-safari': [
    { icon: Share, text: m.install_mac_step1 },
    { icon: SquarePlus, text: m.install_mac_step2 },
  ],
  'android-firefox': [
    { icon: EllipsisVertical, text: m.install_firefox_step1 },
    { icon: SquarePlus, text: m.install_firefox_step2 },
  ],
}

/**
 * Header: "Install", while the app can still be installed (lib/install.ts). In Chromium browsers
 * it opens their own install dialog; in Safari and in Firefox on Android, the steps of their menus.
 * Hidden once installed, in the installed app, and where installing is not possible.
 */
export function InstallButton() {
  const way = useInstallWay()
  const [guide, setGuide] = useState(false)
  if (way === 'none') return null
  const steps = way === 'prompt' ? [] : GUIDES[way]

  return (
    <>
      <button
        type="button"
        title={m.install_title()}
        onClick={() => (way === 'prompt' ? void promptInstall() : setGuide(true))}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-text-strong"
      >
        <Download aria-hidden className="size-4" />
        <span className="max-sm:sr-only">{m.install_button()}</span>
      </button>
      <Dialog open={guide} onOpenChange={setGuide}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle icon={Download}>{m.install_title()}</DialogTitle>
            <DialogDescription>{m.install_body()}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 text-sm">
            {steps.map(({ icon: Icon, text }, index) => (
              <li key={index} className="flex items-center gap-3 rounded-sm bg-muted/40 px-3 py-2">
                <span className="num w-4 text-muted-foreground">{index + 1}</span>
                <Icon aria-hidden className="size-4 shrink-0 text-primary" />
                <span className="text-text-strong">{text()}</span>
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button onClick={() => setGuide(false)}>{m.install_ok()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
