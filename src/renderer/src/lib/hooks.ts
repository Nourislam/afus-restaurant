import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppEvent } from '@shared/ipc'
import { ApiError } from './api'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {}
): AsyncState<T> & { reload: () => Promise<void>; setData: (value: T | null) => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: options.enabled ?? true, error: null })
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const enabled = options.enabled ?? true

  const run = useCallback(async () => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null })
      return
    }
    setState((previous) => ({ ...previous, loading: true, error: null }))
    try {
      const data = await loaderRef.current()
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({ data: null, loading: false, error: error instanceof ApiError ? error.code : 'UNEXPECTED_ERROR' })
    }
  }, [enabled])

  useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return {
    ...state,
    reload: run,
    setData: (value) => setState((previous) => ({ ...previous, data: value }))
  }
}

/** Subscribe to main-process domain events (orders, kitchen, stock…). */
export function useAppEvent(handler: (event: AppEvent) => void): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    if (!window.afus) return
    return window.afus.onEvent((event) => handlerRef.current(event))
  }, [])
}

export function useInterval(callback: () => void, delay: number | null): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  useEffect(() => {
    if (delay === null) return
    const timer = setInterval(() => callbackRef.current(), delay)
    return () => clearInterval(timer)
  }, [delay])
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
