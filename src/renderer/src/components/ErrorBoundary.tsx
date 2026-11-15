import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from './ui'

interface Props {
  children: ReactNode
  /** Changing this resets the boundary — we pass the route, so leaving a broken screen heals it. */
  resetKey?: string
  labels: { title: string; hint: string; retry: string }
}
interface State {
  error: Error | null
}

/**
 * One screen must never take the whole program down. Without this, a single
 * render fault leaves the cashier looking at a white window with no way back;
 * with it they get a message and a button, and the menu stays usable.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[afus] screen failed:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    const { labels } = this.props
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <p className="text-sm font-bold text-ink-800 dark:text-ink-100">{labels.title}</p>
        <p className="max-w-sm text-xs text-ink-500">{labels.hint}</p>
        <Button icon={RotateCcw} variant="secondary" onClick={() => this.setState({ error: null })}>
          {labels.retry}
        </Button>
        <p className="mt-1 max-w-lg truncate font-mono text-[10px] text-ink-400" dir="ltr" title={error.message}>
          {error.message}
        </p>
      </div>
    )
  }
}
