/**
 * i18n.ts — Lightweight i18n for Equality desktop
 *
 * No external dependency. Uses React context + JSON dictionaries.
 */

import { createContext, useContext } from 'react'
import zh from './locales/zh-CN.json'
import en from './locales/en.json'

export type Locale = 'zh-CN' | 'en'

const dictionaries: Record<Locale, Record<string, string>> = {
  'zh-CN': zh as Record<string, string>,
  en: en as Record<string, string>,
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number> | string, fallback?: string): string {
  // Allow t(locale, key, fallback) for backward compat
  if (typeof vars === 'string') { fallback = vars; vars = undefined }
  let str = dictionaries[locale]?.[key] ?? fallback ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}

export function detectLocale(): Locale {
  const stored = localStorage.getItem('equality-locale') as Locale | null
  if (stored && dictionaries[stored]) return stored
  return navigator.language.startsWith('zh') ? 'zh-CN' : 'en'
}

export const LocaleContext = createContext<{
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number> | string, fallback?: string) => string
}>({
  locale: 'zh-CN',
  setLocale: () => {},
  t: (key) => key,
})

export function useT() {
  return useContext(LocaleContext)
}
