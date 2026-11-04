import { describe, expect, it } from 'vitest'
import { exportParams, readNdjson } from './client'

function streamOf(...chunks: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of generator) items.push(item)
  return items
}

describe('readNdjson', () => {
  it('yields one object per line', async () => {
    const items = await collect(readNdjson(streamOf('{"id":"a"}\n{"id":"b"}\n')))
    expect(items).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('handles lines split across chunks', async () => {
    const items = await collect(readNdjson(streamOf('{"id":', '"a"}\n{"i', 'd":"b"}\n')))
    expect(items).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('handles a last line without trailing newline and skips blank lines', async () => {
    const items = await collect(readNdjson(streamOf('{"id":"a"}\n\n{"id":"b"}')))
    expect(items).toEqual([{ id: 'a' }, { id: 'b' }])
  })
})

describe('exportParams', () => {
  it('asks for the given perfs, rated and casual, with evaluations', () => {
    expect(exportParams({ perfTypes: ['ultraBullet', 'bullet'] })).toEqual({
      perfType: 'ultraBullet,bullet',
      evals: 'true',
      clocks: 'true',
      opening: 'true',
    })
  })

  it('adds the optional limit, dates, color and rated filter', () => {
    expect(
      exportParams({
        perfTypes: ['blitz'],
        max: 50,
        since: 1,
        until: 2,
        color: 'black',
        rated: true,
      }),
    ).toEqual({
      rated: 'true',
      perfType: 'blitz',
      evals: 'true',
      clocks: 'true',
      opening: 'true',
      max: '50',
      since: '1',
      until: '2',
      color: 'black',
    })
  })
})

describe('exportParams, casual only', () => {
  it('asks for casual games', () => {
    expect(exportParams({ perfTypes: ['blitz'], rated: false }).rated).toBe('false')
  })
})
