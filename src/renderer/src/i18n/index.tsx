import type { Lang } from '@shared/constants'
import { MESSAGES } from './messages'
import { useAppStore } from '../store/app'

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

export function translate(language: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = MESSAGES[key]
  let text: string = entry ? entry[language] || entry.ar : key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
    }
  }
  return text
}

export function useT(): {
  t: TranslateFn
  language: Lang
  dir: 'rtl' | 'ltr'
  setLanguage: (language: Lang) => void
} {
  const language = useAppStore((state) => state.language)
  const setLanguage = useAppStore((state) => state.setLanguage)
  return {
    t: (key, vars) => translate(language, key, vars),
    language,
    dir: language === 'ar' ? 'rtl' : 'ltr',
    setLanguage
  }
}

export function localized(language: Lang, value: { ar: string; fr: string } | null | undefined): string {
  if (!value) return ''
  return value[language] || value.ar || value.fr
}

export function errorText(language: Lang, code: string): string {
  const key = `errors.${code}`
  const translated = translate(language, key)
  if (translated !== key) return translated
  /* Nothing is ever a dead end: an unmapped code still shows itself, so the
     owner can say what happened and it can be traced. A raw sentence from a
     thrown JavaScript error is shown as it is rather than as a code. */
  const generic = translate(language, 'common.error')
  const looksLikeCode = /^[A-Z][A-Z0-9_]{2,}$/.test(code)
  return looksLikeCode ? `${generic} (${code})` : generic
}
