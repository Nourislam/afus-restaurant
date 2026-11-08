import { create } from 'zustand'
import type { AppSettings, UserSession } from '@shared/types'
import type { Lang } from '@shared/constants'
import type { Permission } from '@shared/permissions'
import { api } from '../lib/api'

const LANG_KEY = 'afus.language'
const THEME_KEY = 'afus.theme'

function storedLang(): Lang {
  const value = localStorage.getItem(LANG_KEY)
  return value === 'fr' ? 'fr' : 'ar'
}

function storedTheme(): 'light' | 'dark' {
  /* Dark is the Afus default across every program; light is opt-in. */
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

interface AppState {
  user: UserSession | null
  settings: AppSettings | null
  language: Lang
  theme: 'light' | 'dark'
  booting: boolean
  setUser: (user: UserSession | null) => void
  setSettings: (settings: AppSettings) => void
  setLanguage: (language: Lang) => void
  setTheme: (theme: 'light' | 'dark') => void
  setBooting: (booting: boolean) => void
  reset: () => void
  can: (permission: Permission) => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  settings: null,
  language: storedLang(),
  theme: storedTheme(),
  booting: true,
  setUser: (user) => set({ user }),
  setSettings: (settings) => set({ settings }),
  setLanguage: (language) => {
    localStorage.setItem(LANG_KEY, language)
    set({ language })
  },
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    set({ theme })
  },
  setBooting: (booting) => set({ booting }),
  reset: () => set({ user: null }),
  can: (permission) => Boolean(get().user?.permissions.includes(permission))
}))

export async function refreshSession(): Promise<UserSession | null> {
  const user = await api.me()
  useAppStore.getState().setUser(user)
  return user
}	 
