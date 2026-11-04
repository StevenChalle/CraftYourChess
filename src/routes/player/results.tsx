import { createFileRoute, redirect } from '@tanstack/react-router'

/** The analysis's results used to be a tab: they are under its filters now. */
export const Route = createFileRoute('/player/results')({
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/player/analysis', search, replace: true })
  },
})
