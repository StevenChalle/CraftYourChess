import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/http'
import { fetchPlayer } from './client'

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('fetchPlayer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps an account whose stats Chess.com fails to serve, without ratings', async () => {
    const profile = { username: 'alice', url: 'https://www.chess.com/member/Alice' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/stats')
          ? respond(404, { code: 0, message: 'An internal error has occurred.' })
          : respond(200, profile),
      ),
    )
    expect(await fetchPlayer('Alice')).toEqual({ profile, stats: {} })
  })

  it('still fails with a 404 when the profile is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(404, { code: 0, message: 'User "alice" not found.' })),
    )
    await expect(fetchPlayer('alice')).rejects.toSatisfy(
      (error) => error instanceof ApiError && error.isNotFound,
    )
  })
})
