/// <reference types="vite/client" />

import type { AppEvent, IpcResult } from '@shared/ipc'

declare module '*.svg' {
  const content: string
  export default content
}
declare module '*.png' {
  const content: string
  export default content
}

declare global {
  interface Window {
    afus: {
      platform?: string
      invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<IpcResult<T>>
      onEvent: (handler: (event: AppEvent) => void) => () => void
    }
  }

  /** Chromium's Window Controls Overlay, present when the window draws its own
   *  buttons over the page. It reports exactly which strip is left free. */
  interface Navigator {
    windowControlsOverlay?: {
      visible: boolean
      getTitlebarAreaRect: () => DOMRect
      addEventListener: (type: 'geometrychange', handler: () => void) => void
      removeEventListener: (type: 'geometrychange', handler: () => void) => void
    }
  }
}

export {}
