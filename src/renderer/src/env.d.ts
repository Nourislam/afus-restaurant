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
      invoke: <T = unknown>(channel: string, payload?: unknown) => Promise<IpcResult<T>>
      onEvent: (handler: (event: AppEvent) => void) => () => void
    }
  }
}

export {}
