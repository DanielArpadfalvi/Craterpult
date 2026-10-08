import { de } from './de';
import { en, type TranslationKey } from './en';
import { es } from './es';
import { hu } from './hu';
import { pt } from './pt';

export type { TranslationKey };
/** Interface languages, in the order the settings list them. */
export const LANGUAGES = ['en', 'hu', 'de', 'es', 'pt'] as const;
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(x: unknown): x is Language {
  return (LANGUAGES as readonly unknown[]).includes(x);
}

const DICTS: Record<Language, Record<TranslationKey, string>> = { en, hu, de, es, pt };
let current: Language = deviceLanguage();
const listeners = new Set<() => void>();

/** The device / browser language when the game has it, else English. */
export function deviceLanguage(): Language {
  const nav = (globalThis.navigator?.language ?? 'en').toLowerCase();
  return LANGUAGES.find((l) => nav === l || nav.startsWith(`${l}-`)) ?? 'en';
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
