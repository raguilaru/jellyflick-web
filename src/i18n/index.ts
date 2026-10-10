import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { en, type MessageKey, type Messages } from './en';

export type { MessageKey, Messages };

/** The locales that ship. English is the fallback for everything else. */
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'en';

/**
 * Looks up one message. The parameters argument exists only for the keys whose
 * message takes one, so a missing or misspelled parameter fails the typecheck.
 */
export type Translate = <K extends MessageKey>(
  key: K,
  ...params: Messages[K] extends (params: infer P) => string ? [P] : []
) => string;

export function createTranslate(messages: Messages): Translate {
  return ((key, params) => {
    const message = messages[key];
    return typeof message === 'function'
      ? (message as (p: unknown) => string)(params)
      : (message as string);
  }) as Translate;
}

/**
 * Picks the locale to use from the languages the User's device prefers, in
 * order. Matches on the language subtag, so `es-419` and `es-MX` both pick
 * Spanish.
 */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const language = tag.toLowerCase().split('-')[0];
    const match = LOCALES.find((locale) => locale === language);
    if (match !== undefined) return match;
  }
  return FALLBACK_LOCALE;
}

/** Each locale is its own lazy chunk, so a User downloads one dictionary. */
const loaders: Readonly<Record<Locale, () => Promise<Messages>>> = {
  en: () => Promise.resolve(en),
  es: () => import('./es').then((module) => module.es),
};

export function loadMessages(locale: Locale): Promise<Messages> {
  return loaders[locale]();
}

const TranslateContext = createContext<Translate>(createTranslate(en));

export const TranslateProvider = TranslateContext.Provider;

/** The hook every component uses to get its text. No string is ever inline. */
export function useTranslate(): Translate {
  return useContext(TranslateContext);
}
