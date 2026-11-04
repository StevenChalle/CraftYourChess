import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, loadPageSize, savePageSize } from './pageSize'

describe('the games per page', () => {
  beforeEach(() => localStorage.clear())

  it('is 20 until chosen, then remembered', () => {
    expect(loadPageSize()).toBe(DEFAULT_PAGE_SIZE)
    savePageSize(50)
    expect(loadPageSize()).toBe(50)
  })

  it('ignores a value it does not offer', () => {
    localStorage.setItem('craftyourchess:games-page-size', '7')
    expect(loadPageSize()).toBe(DEFAULT_PAGE_SIZE)
  })
})
