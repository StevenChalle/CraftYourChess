import { createFileRoute, redirect } from '@tanstack/react-router'

// The profile opens on its games; its overview is a dialog of the header (ProfileButton).
export const Route = createFileRoute('/player/')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/player/history', search, replace: true })
  },
})
