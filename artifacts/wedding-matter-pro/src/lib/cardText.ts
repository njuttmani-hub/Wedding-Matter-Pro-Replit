import type { FormState } from '../types';
import { CARD_LANGUAGES, type CardLanguage, type LangCode } from '../data/languages';
import { TRANSLATIONS, en, type CardStrings } from '../data/i18n';

/** The card's language. `design.language` held the display name 'English'
 *  before any other language existed, so anything unrecognised is English. */
export function langOf(form: FormState): CardLanguage {
  return CARD_LANGUAGES.find(l => l.code === form.design.language) ?? CARD_LANGUAGES[0];
}

const cache = new Map<LangCode, CardStrings>();

/** Every fixed piece of card wording in the card's language. Each entry falls
 *  back to English on its own, so a half-translated language still prints a
 *  whole card rather than blanks. */
export function cardStrings(form: FormState): CardStrings {
  const code = langOf(form).code;
  let s = cache.get(code);
  if (!s) {
    const t = TRANSLATIONS[code];
    s = {
      templates: { ...en.templates, ...t.templates },
      relationWords: { ...en.relationWords, ...t.relationWords },
      closingTags: { ...en.closingTags, ...t.closingTags },
      kidsLines: { ...en.kidsLines, ...t.kidsLines },
      programmes: { ...en.programmes, ...t.programmes },
      salutations: { ...en.salutations, ...t.salutations },
      labels: { ...en.labels, ...t.labels },
    };
    cache.set(code, s);
  }
  return s;
}

/** A customer-typed value (a name, a venue, an address) as it prints in the
 *  card's language: their script version if they have one, else what they
 *  typed in English. `path` identifies the field — 'bride.name',
 *  'bride.fatherName', 'family.residenceAddress', 'withCompliments',
 *  'kidsCustom', or 'programme.<id>.<field>' for a function's name, venue,
 *  address or note. */
export function scriptText(form: FormState, path: string, english: string): string {
  const code = langOf(form).code;
  if (code === 'en') return english;
  const v = form.scriptText?.[code]?.[path];
  return v && v.trim() ? v : english;
}

/** Digits in the card language's own numerals (१२ for Marathi), where it has them. */
export function localDigits(form: FormState, n: string): string {
  const { numerals, locale } = langOf(form);
  if (!numerals) return n;
  const fmt = new Intl.NumberFormat(`${locale}-u-nu-${numerals}`, { useGrouping: false });
  return n.replace(/\d/g, d => fmt.format(Number(d)));
}

/** A function's time in the card language, e.g. "7:30 PM" or "सायं. ७.३० वा." */
export function cardTime(form: FormState, hour: string, minute: string, ampm: 'AM' | 'PM'): string {
  if (!hour) return '';
  const L = cardStrings(form).labels;
  return L.timePattern
    .replace('{h}', localDigits(form, String(Number(hour))))
    .replace('{m}', localDigits(form, minute || '00'))
    .replace('{ampm}', ampm === 'AM' ? L.am : L.pm)
    .trim();
}

/** A function's date in the card language, with its weekday. */
export function cardDate(form: FormState, isoDate: string, long = false): string {
  if (!isoDate) return '';
  const { locale, numerals } = langOf(form);
  const tag = numerals ? `${locale}-u-nu-${numerals}` : locale;
  return new Date(isoDate + 'T00:00:00').toLocaleDateString(tag, long
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
