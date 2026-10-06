import { en, type TranslationKey } from './en';
import { hu } from './hu';

export type { TranslationKey };
export type Language = 'en' | 'hu';

const DICTS: Record<Language, Record<TranslationKey, string>> = { en, hu };
let current: Language = deviceLanguage();
const listeners = new Set<() => void>();

/** The device / browser language (Hungarian or English). The choice is stored in the save. */
export function deviceLanguage(): Language {
  const nav = globalThis.navigator?.language ?? 'en';
  return nav.toLowerCase().startsWith('hu') ? 'hu' : 'en';
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  for (const l of listeners) l();
}

export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate `key`, substituting `{name}` placeholders from `params`. */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  return format(DICTS[current][key] ?? en[key], params);
}

export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export const DICTIONARIES = DICTS;
