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
  return translated === key ? translate(language, 'common.error') : translated
}
