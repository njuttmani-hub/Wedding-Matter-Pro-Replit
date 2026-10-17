/** The languages a whole card can be printed in. `code` is what
 *  `form.design.language` stores (older forms hold 'English', which reads as
 *  'en' — see langOf() in WeddingApp). */
export type LangCode = 'en' | 'mr' | 'hi' | 'gu' | 'pa' | 'bn' | 'ta' | 'te' | 'kn' | 'ml';

export interface CardLanguage {
  code: LangCode;
  /** Name in English, for the studio and the export. */
  name: string;
  /** Name in its own script, for the picker. */
  native: string;
  /** Matches the `langs` tags on FONTS, which decide which fonts can set it. */
  script: 'Latin' | 'Devanagari' | 'Gujarati' | 'Gurmukhi' | 'Bengali' | 'Tamil' | 'Telugu' | 'Kannada' | 'Malayalam';
  /** Intl locale for dates (month and weekday names). */
  locale: string;
  /** Intl numbering system so dates and times use the script's own digits
   *  (१२, ૧૨…); undefined keeps 0-9, which Tamil and Malayalam cards use. */
  numerals?: string;
  /** Google Input Tools code used to suggest names in this script. */
  inputTools?: string;
  /** Fonts picked automatically when the customer switches to this language,
   *  as FONTS `family` strings. Every one must carry this script. */
  defaultFonts: { heading: string; body: string; script: string };
}

export const CARD_LANGUAGES: CardLanguage[] = [
  { code: 'en', name: 'English',   native: 'English',  script: 'Latin',      locale: 'en-IN',
    defaultFonts: { heading: "'Cormorant Garamond', serif", body: "'EB Garamond', serif", script: "'Tangerine', cursive" } },
  { code: 'mr', name: 'Marathi',   native: 'मराठी',     script: 'Devanagari', locale: 'mr-IN', numerals: 'deva', inputTools: 'mr-t-i0-und',
    defaultFonts: { heading: "'Tiro Devanagari Marathi', serif", body: "'Noto Serif Devanagari', serif", script: "'Kalam', cursive" } },
  { code: 'hi', name: 'Hindi',     native: 'हिन्दी',     script: 'Devanagari', locale: 'hi-IN', numerals: 'deva', inputTools: 'hi-t-i0-und',
    defaultFonts: { heading: "'Tiro Devanagari Hindi', serif", body: "'Noto Serif Devanagari', serif", script: "'Kalam', cursive" } },
  { code: 'gu', name: 'Gujarati',  native: 'ગુજરાતી',   script: 'Gujarati',   locale: 'gu-IN', numerals: 'gujr', inputTools: 'gu-t-i0-und',
    defaultFonts: { heading: "'Noto Serif Gujarati', serif", body: "'Noto Serif Gujarati', serif", script: "'Kumar One', serif" } },
  { code: 'pa', name: 'Punjabi',   native: 'ਪੰਜਾਬੀ',     script: 'Gurmukhi',   locale: 'pa-IN', numerals: 'guru', inputTools: 'pa-t-i0-und',
    defaultFonts: { heading: "'Noto Serif Gurmukhi', serif", body: "'Noto Serif Gurmukhi', serif", script: "'Noto Serif Gurmukhi', serif" } },
  { code: 'bn', name: 'Bengali',   native: 'বাংলা',      script: 'Bengali',    locale: 'bn-IN', numerals: 'beng', inputTools: 'bn-t-i0-und',
    defaultFonts: { heading: "'Noto Serif Bengali', serif", body: "'Noto Serif Bengali', serif", script: "'Noto Serif Bengali', serif" } },
  { code: 'ta', name: 'Tamil',     native: 'தமிழ்',      script: 'Tamil',      locale: 'ta-IN', inputTools: 'ta-t-i0-und',
    defaultFonts: { heading: "'Noto Serif Tamil', serif", body: "'Noto Serif Tamil', serif", script: "'Noto Serif Tamil', serif" } },
  { code: 'te', name: 'Telugu',    native: 'తెలుగు',     script: 'Telugu',     locale: 'te-IN', numerals: 'telu', inputTools: 'te-t-i0-und',
    defaultFonts: { heading: "'Noto Serif Telugu', serif", body: "'Noto Serif Telugu', serif", script: "'Noto Serif Telugu', serif" } },
  { code: 'kn', name: 'Kannada',   native: 'ಕನ್ನಡ',      script: 'Kannada',    locale: 'kn-IN', numerals: 'knda', inputTools: 'kn-t-i0-und',
    defaultFonts: { heading: "'Noto Serif Kannada', serif", body: "'Noto Serif Kannada', serif", script: "'Noto Serif Kannada', serif" } },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം',    script: 'Malayalam',  locale: 'ml-IN', inputTools: 'ml-t-i0-und',
    defaultFonts: { heading: "'Noto Serif Malayalam', serif", body: "'Noto Serif Malayalam', serif", script: "'Noto Serif Malayalam', serif" } },
];
