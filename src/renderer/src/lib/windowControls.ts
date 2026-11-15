/**
 * How much room the system's own window buttons (close, minimise, maximise)
 * take over the page.
 *
 * The two numbers are **physical** left and right, never start and end: the
 * macOS traffic lights stay at the far left of the window even when the program
 * is running in Arabic, so reserving the space with a logical property puts it
 * on the wrong side and the system buttons land on top of ours.
 */
export interface WindowControlsInset {
  left: number
  right: number
}

/** The strip macOS reserves for its three traffic lights in `hiddenInset`. */
export const MAC_TRAFFIC_LIGHTS = 82

export interface OverlayLike {
  visible: boolean
  getTitlebarAreaRect: () => { x: number; width: number }
}

/**
 * @param platform  'darwin' | 'win32' | 'linux' | anything else
 * @param overlay   Chromium's Window Controls Overlay, when the window has one
 * @param viewportWidth  the window's inner width, to turn the free strip into a
 *                       right-hand inset
 */
export function windowControlsInset(
  platform: string | undefined,
  overlay: OverlayLike | undefined | null,
  viewportWidth: number
): WindowControlsInset {
  /* When the window exposes an overlay it reports exactly which strip is free,
     so no per-platform constant is needed or trusted. */
  if (overlay?.visible) {
    try {
      const free = overlay.getTitlebarAreaRect()
      if (free && free.width > 0 && viewportWidth > 0) {
        return {
          left: Math.max(0, Math.round(free.x)),
          right: Math.max(0, Math.round(viewportWidth - (free.x + free.width)))
        }
      }
    } catch {
      /* a broken overlay falls back to the platform defaults below */
    }
  }
  /* macOS runs `titleBarStyle: 'hiddenInset'`: the lights float over our bar. */
  if (platform === 'darwin') return { left: MAC_TRAFFIC_LIGHTS, right: 0 }
  /* Windows and Linux keep their own frame above the page, so their buttons
     never cover anything of ours. If that window ever becomes an overlay, the
     branch above measures it and nothing here has to change. */
  return { left: 0, right: 0 }
}
