/** Every piece of fixed wording the printed card can carry, in one language.
 *
 *  Keyed by the ids in data/constants.ts, so the English source of truth stays
 *  there and a translation only has to say what each id reads as. A language
 *  file may leave any entry out: the card falls back to English for that one
 *  piece rather than printing nothing (see `cardStrings()` in WeddingApp). */
export interface CardStrings {
  /** INVITATION_TEMPLATES text, by template id. Keep the line breaks (\n) and
   *  the overall shape of the English; these are read aloud-style card matter,
   *  not literal translations. */
  templates: Record<number, string>;
  /** RELATION_WORDS label, by id ("Weds"). */
  relationWords: Record<string, string>;
  /** CLOSING_TAGS label, by id ("Blessings Only"). */
  closingTags: Record<string, string>;
  /** KIDS_LINES label, by id. Keep the emoji. */
  kidsLines: Record<string, string>;
  /** PROGRAMME_PRESETS name, by id ("Haldi", "Wedding Ceremony"). */
  programmes: Record<string, string>;
  /** SALUTATIONS, by the English value ("Shri" → "श्री", "Late Shri" → "स्व. श्री"). */
  salutations: Record<string, string>;
  labels: CardLabels;
}

export interface CardLabels {
  /** Heading above the residence address: "Residence:" */
  residence: string;
  /** Heading above the compliments names: "With Best Compliments:" */
  withCompliments: string;
  /** "Daughter of" with the bride's parents. Either a prefix ("D/o", printed
   *  before the parents) or a pattern containing {parents} for languages that
   *  put it after them ("{parents} यांची कन्या"). Read through childOf(). */
  daughterOf: string;
  /** "Son of" with the groom's parents; same rules as daughterOf. */
  sonOf: string;
  /** Joins two names: " & " (keep the surrounding spaces). */
  and: string;
  /** Heading of the combined programmes page: "Programmes" */
  programmes: string;
  /** How a time prints. Placeholders: {h} hour, {m} minutes, {ampm} the am/pm
   *  word below. English "{h}:{m} {ampm}"; Marathi might be "{ampm} {h}.{m} वा." */
  timePattern: string;
  am: string;
  pm: string;
  /** Optional words for 12–4:59 PM and 8 PM–3:59 AM, so a 1 PM lunch doesn't
   *  print as "evening". English leaves them out and uses am/pm throughout;
   *  a language without them falls back to pm/am, never to English. */
  afternoon?: string;
  night?: string;
  /** A reception's time with its meal: "from {time} onwards ({meal})" */
  mealFrom: string;
  dinner: string;
  lunch: string;
  /** The invitation sentence on a separate function sheet, under the
   *  function's name. One whole sentence so each language can order it
   *  naturally. Placeholders: {hosts} the host parents (removed with its
   *  spacing when there are none), {function} the function's name,
   *  {couple} the couple's names. */
  sheetInvite: string;
  /** Heading above the per-function note on a separate sheet ("Note"). */
  note: string;
}

/** What a language file exports: any subset of CardStrings, one level deep.
 *  Missing entries fall back to English. */
export type CardTranslation = { [K in Exclude<keyof CardStrings, 'labels'>]?: CardStrings[K] } & { labels?: Partial<CardLabels> };
