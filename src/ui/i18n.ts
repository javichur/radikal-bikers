import { en } from './locales/en';
import { es, type MessageKey } from './locales/es';

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'];

const DICTS: Record<Locale, Record<MessageKey, string>> = { es, en };

export const detectLocale = (languages: readonly string[]): Locale => {
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'es' || base === 'en') return base;
  }
  return 'en';
};

export class I18n {
  constructor(public locale: Locale) {}

  t(key: MessageKey, params: Record<string, string | number> = {}): string {
    const raw = DICTS[this.locale][key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
  }

  /** Looser variant for keys coming from content data. */
  tk(key: string): string {
    return key in es ? this.t(key as MessageKey) : key;
  }
}

export type { MessageKey };
