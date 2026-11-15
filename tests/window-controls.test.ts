import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAC_TRAFFIC_LIGHTS, windowControlsInset } from '../src/renderer/src/lib/windowControls'

const rect = (x: number, width: number) => ({ getTitlebarAreaRect: () => ({ x, width }), visible: true })

describe('room left for the system window buttons', () => {
  it('reserves the macOS traffic lights on the left', () => {
    expect(windowControlsInset('darwin', null, 1280)).toEqual({ left: MAC_TRAFFIC_LIGHTS, right: 0 })
  })

  it('reserves nothing on Windows and Linux, which keep their own frame', () => {
    expect(windowControlsInset('win32', null, 1280)).toEqual({ left: 0, right: 0 })
    expect(windowControlsInset('linux', null, 1280)).toEqual({ left: 0, right: 0 })
    expect(windowControlsInset(undefined, null, 1280)).toEqual({ left: 0, right: 0 })
  })

  it('measures the free strip when the window reports an overlay', () => {
    /* Windows-style overlay: buttons on the right, 146px of them. */
    expect(windowControlsInset('win32', rect(0, 1134), 1280)).toEqual({ left: 0, right: 146 })
    /* A macOS-style overlay: buttons on the left. */
    expect(windowControlsInset('darwin', rect(82, 1198), 1280)).toEqual({ left: 82, right: 0 })
    /* Buttons on both sides are handled too. */
    expect(windowControlsInset('win32', rect(80, 1060), 1280)).toEqual({ left: 80, right: 140 })
  })

  it('falls back to the platform default when the overlay is hidden or broken', () => {
    expect(windowControlsInset('darwin', { visible: false, getTitlebarAreaRect: () => ({ x: 0, width: 0 }) }, 1280))
      .toEqual({ left: MAC_TRAFFIC_LIGHTS, right: 0 })
    const broken = {
      visible: true,
      getTitlebarAreaRect: () => {
        throw new Error('no rect')
      }
    }
    expect(windowControlsInset('darwin', broken, 1280)).toEqual({ left: MAC_TRAFFIC_LIGHTS, right: 0 })
    expect(windowControlsInset('darwin', rect(0, 0), 1280)).toEqual({ left: MAC_TRAFFIC_LIGHTS, right: 0 })
  })

  it('never returns a negative inset', () => {
    const inset = windowControlsInset('win32', rect(-20, 2000), 1280)
    expect(inset.left).toBeGreaterThanOrEqual(0)
    expect(inset.right).toBeGreaterThanOrEqual(0)
  })
})

describe('the window bar reserves that room on the physical sides', () => {
  const source = readFileSync('src/renderer/src/components/TitleBar.tsx', 'utf8')

  it('uses paddingLeft/paddingRight, never the logical properties', () => {
    /* A logical padding flips in Arabic, which put the macOS traffic lights on
       top of the program's own buttons. This is the guard against that. */
    expect(source).toContain('paddingLeft: inset.left')
    expect(source).toContain('paddingRight: inset.right')
    expect(source).not.toContain('paddingInlineStart')
    expect(source).not.toContain('paddingInlineEnd')
  })

  it('pins the clock inside the free strip rather than the whole bar', () => {
    expect(source).toContain('left: inset.left, right: inset.right')
  })
})
