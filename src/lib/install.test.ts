import { describe, expect, it } from 'vitest'
import { installWayOf } from './install'

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
}

describe('installWayOf', () => {
  it('shows the menu steps where the browser cannot prompt', () => {
    expect(installWayOf({ userAgent: UA.iphone }, false)).toBe('ios')
    // An iPad: a Mac user agent with a touch screen.
    expect(installWayOf({ userAgent: UA.macSafari, maxTouchPoints: 5 }, false)).toBe('ios')
    expect(installWayOf({ userAgent: UA.macSafari, maxTouchPoints: 0 }, false)).toBe('mac-safari')
    expect(installWayOf({ userAgent: UA.androidFirefox }, false)).toBe('android-firefox')
  })

  it('waits for the prompt in Chromium browsers, and offers nothing in Firefox on a computer', () => {
    expect(installWayOf({ userAgent: UA.macChrome }, false)).toBe('none')
    expect(installWayOf({ userAgent: UA.windowsFirefox }, false)).toBe('none')
  })

  it('offers nothing once installed', () => {
    expect(installWayOf({ userAgent: UA.iphone }, true)).toBe('none')
    expect(installWayOf({ userAgent: UA.iphone, standalone: true }, false)).toBe('none')
  })
})
