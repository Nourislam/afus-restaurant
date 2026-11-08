import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { Delete } from 'lucide-react'

/**
 * On-screen number pad for a short PIN, matching Afus Boutique/Hanout. The dots
 * show how many digits are entered; the pad auto-submits once the PIN is full.
 * Physical number keys, Backspace and Enter work too.
 */
export function PinPad({
  value,
  onChange,
  onEnter,
  pinLength = 4,
  disabled,
  autoFocus = true
}: {
  value: string
  onChange: (value: string) => void
  onEnter: (value: string) => void
  pinLength?: number
  disabled?: boolean
  autoFocus?: boolean
}) {
  const enteredRef = useRef(onEnter)
  enteredRef.current = onEnter
  const valueRef = useRef(value)
  valueRef.current = value

  const push = (digit: string) => {
    if (disabled) return
    const next = (valueRef.current + digit).slice(0, pinLength)
    onChange(next)
    if (next.length === pinLength) {
      // let the dot fill paint before the parent swaps the screen
      setTimeout(() => enteredRef.current(next), 90)
    }
  }
  const backspace = () => !disabled && onChange(valueRef.current.slice(0, -1))
  const clear = () => !disabled && onChange('')

  useEffect(() => {
    if (!autoFocus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') push(event.key)
      else if (event.key === 'Backspace') backspace()
      else if (event.key === 'Enter' && valueRef.current.length === pinLength) enteredRef.current(valueRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, pinLength, disabled])

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="mx-auto w-full max-w-[17rem] select-none">
      <div className="mb-6 flex items-center justify-center gap-3" aria-hidden="true">
        {Array.from({ length: pinLength }).map((_, index) => (
          <span
            key={index}
            className={clsx(
              'h-3.5 w-3.5 rounded-full border-2 transition-all duration-150',
              index < value.length
                ? 'scale-110 border-brand-600 bg-brand-600'
                : 'border-ink-300 bg-transparent dark:border-ink-600'
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => push(key)}
            className="flex h-16 items-center justify-center rounded-xl bg-ink-100 text-2xl font-semibold text-ink-800 transition active:scale-95 hover:bg-ink-200 disabled:opacity-50 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={clear}
          className="flex h-16 items-center justify-center rounded-xl text-sm font-semibold text-ink-400 transition active:scale-95 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
        >
          C
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => push('0')}
          className="flex h-16 items-center justify-center rounded-xl bg-ink-100 text-2xl font-semibold text-ink-800 transition active:scale-95 hover:bg-ink-200 disabled:opacity-50 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={backspace}
          className="flex h-16 items-center justify-center rounded-xl text-ink-500 transition active:scale-95 hover:bg-ink-100 disabled:opacity-50 dark:text-ink-300 dark:hover:bg-ink-800"
          aria-label="backspace"
        >
          <Delete className="h-6 w-6 flip-rtl" />
        </button>
      </div>
    </div>
  )
}
