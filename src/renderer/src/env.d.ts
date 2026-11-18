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
    /** Set only by the web demo on the Afus website, where the whole program
     *  runs in a browser tab. Absent in the installed program. */
    __AFUS_WEB_DEMO__?: {
      /** Back to the restaurant's page on the website. */
      siteUrl?: string
      /** Straight to "order the program" on that page. */
      orderUrl?: string
      /** Reopen the guided tour. */
      tour?: () => void
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
