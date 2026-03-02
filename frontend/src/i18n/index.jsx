import { createContext, useContext, useState } from 'react'
import vi from './vi'
import en from './en'

const translations = { vi, en }

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const savedLang = typeof localStorage !== 'undefined'
    ? (localStorage.getItem('lang') || 'vi')
    : 'vi'
  const [lang, setLang] = useState(savedLang)

  function switchLang(l) {
    setLang(l)
    localStorage.setItem('lang', l)
  }

  const t = (key) => translations[lang]?.[key] ?? translations['en']?.[key] ?? key

  return (
    <I18nContext.Provider value={{ lang, switchLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
