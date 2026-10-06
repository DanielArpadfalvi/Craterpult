import { en, type TranslationKey } from './en';
import { hu } from './hu';

export type { TranslationKey };
export type Language = 'en' | 'hu';

const DICTS: Record<Language, Record<TranslationKey, string>> = { en, hu };
const STORAGE_KEY = 'craterpult:lang';

let current: Language = detect();
const listeners = new Set<() => void>();

function detect(): Language {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'hu') return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  const nav = globalThis.navigator?.language ?? 'en';
  return nav.toLowerCase().startsWith('hu') ? 'hu' : 'en';
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  current = lang;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
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
