/** Wire envelope shared by preload, main and the renderer api client. */
export type IpcResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; details?: unknown } }

export type AppEvent =
  | { channel: string; type: 'result'; data: unknown }
  | { channel: string; type: 'error'; data: unknown; error: { code: string; message: string } }

export const BRIDGE_CHANNEL = 'afus:bridge'
