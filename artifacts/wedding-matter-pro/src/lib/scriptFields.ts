import type { FormState, PersonInfo, Programme } from '../types';
import { FONTS, PROGRAMME_PRESETS } from '../data/constants';
import { CARD_LANGUAGES, type CardLanguage, type LangCode } from '../data/languages';
import { cardStrings, langOf, scriptText } from './cardText';

/* Card-language helpers built on lib/cardText.ts: which customer-typed values
   need a script version, how a few composite bits of the card read in the
   card's language, and switching the language without stranding the fonts. */

/** One printed, customer-typed value that needs a version in the card's script. */
export interface ScriptField {
  /** scriptText path — see scriptText() in lib/cardText.ts. */
  path: string;
  /** What the field is, for the editor ("Bride's father"). */
  label: string;
  /** Which block of the editor it sits in ("Bride", "Haldi Ceremony"). */
  group: string;
  /** The value as the customer typed it. */
  english: string;
  multiline?: boolean;
}

/** Latin-script cards keep the studio's tracked capitals; Indic scripts have
 *  no case, and letter-spacing pulls apart the joined letters of a word. */
export function isLatinCard(form: FormState): boolean {
  return langOf(form).script === 'Latin';
}

/** A salutation as it prints ("Shri" → "श्री"); English where untranslated. */
export function salutation(form: FormState, prefix: string): string {
  const p = prefix.trim();
  return p ? (cardStrings(form).salutations[p] ?? p) : '';
}

/** A parent's or grandparent's printed name with its salutation, in the card's
 *  language. Blank when the name itself is blank, like pn(). */
export function personName(form: FormState, side: 'bride' | 'groom', role: 'father' | 'mother' | 'grandfather' | 'grandmother'): string {
  const p: PersonInfo = form[side];
  const name = p[`${role}Name` as const].trim();
  if (!name) return '';
  const n = scriptText(form, `${side}.${role}Name`, name);
  const s = salutation(form, p[`${role}Prefix` as const]);
  return s ? `${s} ${n}` : n;
}

/** A function's printed name. A preset still carrying its preset name prints
 *  the translated preset; one the customer renamed prints their own words. */
export function programmeName(form: FormState, f: Programme): string {
  const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
  if (preset && f.name.trim() === preset.name) return cardStrings(form).programmes[preset.id] ?? f.name;
  return scriptText(form, `programme.${f.id}.name`, f.name);
}

/** True when a function's name is the customer's own rather than the preset's. */
export function programmeRenamed(f: Programme): boolean {
  const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
  return !!f.name.trim() && (!preset || f.name.trim() !== preset.name);
}

/** Every filled value that prints and so needs a script version, in the order
 *  it appears on the card. Programmes count only once dated, as only dated
 *  ones print. Empty for an English card. */
export function scriptFields(form: FormState): ScriptField[] {
  if (langOf(form).code === 'en') return [];
  const out: ScriptField[] = [];
  const add = (path: string, label: string, group: string, english: string | undefined, multiline = false) => {
    const v = (english || '').trim();
    if (v) out.push({ path, label, group, english: v, multiline });
  };
  for (const side of ['bride', 'groom'] as const) {
    const p = form[side];
    const who = side === 'bride' ? 'Bride' : 'Groom';
    add(`${side}.name`, `${who}'s name`, who, p.name);
    add(`${side}.fatherName`, 'Father', who, p.fatherName);
    add(`${side}.motherName`, 'Mother', who, p.motherName);
    add(`${side}.grandfatherName`, 'Grandfather', who, p.grandfatherName);
    add(`${side}.grandmotherName`, 'Grandmother', who, p.grandmotherName);
  }
  add('family.residenceAddress', 'Residence address', 'Family & extras', form.family.residenceAddress, true);
  add('withCompliments', 'With best compliments', 'Family & extras', form.withCompliments, true);
  if (form.kidsLine === 'custom') add('kidsCustom', 'Kids message', 'Family & extras', form.kidsCustom, true);
  for (const f of form.programmes.filter(x => x.date)) {
    const group = f.name.trim() || 'Function';
    if (programmeRenamed(f)) add(`programme.${f.id}.name`, 'Function name', group, f.name);
    add(`programme.${f.id}.venue`, 'Venue', group, f.venue);
    add(`programme.${f.id}.address`, 'Address', group, f.address, true);
    add(`programme.${f.id}.note`, 'Note', group, f.note, true);
  }
  return out;
}

/** The customer's current script value for a path (blank if none yet). */
export function scriptValue(form: FormState, path: string, code = langOf(form).code): string {
  return form.scriptText?.[code]?.[path] ?? '';
}

/** Whether a FONTS family carries the glyphs for a script. A family not in
 *  FONTS (a hand-edited order) is assumed unable, so it gets replaced. */
export function fontHasScript(family: string, script: CardLanguage['script']): boolean {
  const f = FONTS.find(x => x.family === family);
  return !!f && (f.langs as readonly string[]).includes(script);
}

/** The form switched to another card language. Each of the three fonts that
 *  can't set the new script moves to that language's default; one that can is
 *  left alone, so a customer's pick survives a round trip where it still fits.
 *  Script text is kept per language, so nothing typed is lost. */
export function withLanguage(form: FormState, code: LangCode): FormState {
  const lang = CARD_LANGUAGES.find(l => l.code === code) ?? CARD_LANGUAGES[0];
  const keep = (fam: string, fallback: string) => (fontHasScript(fam, lang.script) ? fam : fallback);
  return {
    ...form,
    design: {
      ...form.design,
      language: lang.code,
      headingFont: keep(form.design.headingFont, lang.defaultFonts.heading),
      bodyFont: keep(form.design.bodyFont, lang.defaultFonts.body),
      scriptFont: keep(form.design.scriptFont, lang.defaultFonts.script),
    },
  };
}
