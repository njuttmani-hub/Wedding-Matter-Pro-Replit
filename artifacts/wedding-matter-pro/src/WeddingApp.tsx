import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Session } from '@supabase/supabase-js';
import {
  Sparkles, ChevronRight, ChevronLeft, Check, Plus, Trash2,
  Heart, Calendar, FileText, Type, Eye, Send, Copy, Search,
  Sun, Moon, LayoutDashboard, Clock, CheckCircle2, Edit3, X,
  Smartphone, Monitor, Printer, ArrowUp, ArrowDown, User, Package,
  Bell, Palette as PaletteIcon, Star, BookOpen, Minus,
  MessageCircle, Zap, Info, ArrowLeftRight, CloudOff, Save, Maximize2,
  LogOut, Lock, Loader2, Download, EyeOff, ShieldCheck, AlertTriangle, ChevronDown, Mail
} from 'lucide-react';
import type { Palette, FormState, PersonInfo, Programme, SubmittedOrder, CardSize } from './types';
import {
  INVITATION_TEMPLATES, DEITIES, RELATION_WORDS, CLOSING_TAGS, KIDS_LINES,
  PROGRAMME_PRESETS, FONTS, CARD_SIZES, SALUTATIONS, DEFAULT_CARD_SIZE
} from './data/constants';
import { fetchOrders, insertOrder, updateOrderStatus, deleteOrder as deleteOrderRow, subscribeToOrders } from './lib/orders';
import { getSession, onAuthChange, signIn, signOut } from './lib/auth';
import { CARD_LANGUAGES } from './data/languages';
import { langOf, cardStrings, scriptText, cardDate, cardTime, childOf } from './lib/cardText';
import { scriptFields, scriptValue, isLatinCard, personName, programmeName, fontHasScript, withLanguage, type ScriptField } from './lib/scriptFields';
import { useScriptSuggestions, type ScriptSuggestions } from './lib/useScriptSuggestions';
import { fontsUsed, familyName } from './lib/fontsUsed';
import type { CardMatter } from './lib/docxExport';

/* ─── Storage keys ───────────────────────────────────────────────────────── */
const DRAFT_KEY = 'wmp_draft_v3';

/* ─── Colour palette ─────────────────────────────────────────────────────── */
/* ── Midnight & Champagne ────────────────────────────────────────────────────
   `dark` is the product's identity: a near-black studio in which the white
   card is by far the brightest object on screen (~17:1). `light` is a
   champagne daylight variant of the same system.

   Two constraints every value here has to satisfy:
   1. Buttons are filled with `linear-gradient(primary -> gold)` and labelled
      with `onAccent`. In Midnight that fill is champagne, so onAccent is
      near-black; in daylight the fill is deep bronze, so onAccent is white.
   2. `gold` doubles as an accent *text* colour, so it must stay legible on
      that theme's own surface — light on midnight, dark on daylight.

   Every value is a 6-digit hex except `surface`/`border`, because several
   call sites append an alpha byte (e.g. `${c.subtext}38`), which only parses
   on hex — an rgba() value there produced invalid CSS and a silently
   missing background. */
const palette: { light: Palette; dark: Palette } = {
  light: {
    bg1: '#F2EEE7', bg2: '#E6DFD3',
    surface: '#FAF6F0',
    border: 'rgba(122, 92, 40, 0.22)',
    text: '#221F1A', subtext: '#5E574C',
    primary: '#6B4A22', primaryDark: '#422C11',
    gold: '#7A5C28', goldLight: '#C6A15B', goldDeep: '#4E3813',
    accent: '#B5342A', ink: '#1A1712',
    onAccent: '#FFFFFF',
  },
  dark: {
    bg1: '#14131A', bg2: '#1B1A23',
    surface: '#1E1D26',
    border: 'rgba(217, 192, 140, 0.18)',
    text: '#F2EEE6', subtext: '#A8A196',
    primary: '#B08A4A', primaryDark: '#7A5C28',
    gold: '#D9C08C', goldLight: '#F0E2C4', goldDeep: '#C6A15B',
    accent: '#C9503A', ink: '#F2EEE6',
    onAccent: '#14131A',
  }
};

/* ─── UI Constants ───────────────────────────────────────────────────────── */

const STEPS = [
  { id: 0, label: 'Family',          short: 'Family', icon: User,         tip: 'Enter names exactly as they should appear. Add a prefix (Shri, Smt., etc.) for parents and grandparents.' },
  { id: 1, label: 'Deities',         short: 'Deities',icon: Star,         tip: 'Tap a deity to add it to the top row. Numbers show order.' },
  { id: 2, label: 'Invitation Text', short: 'Text',   icon: BookOpen,     tip: 'Pick the invitation paragraph — no typing needed!' },
  { id: 3, label: 'Programmes',      short: 'Events', icon: Calendar,     tip: 'Add all wedding functions. Date is required for each.' },
  { id: 4, label: 'Extras',          short: 'Extras', icon: FileText,     tip: 'Closing line, kids message, and with-best-compliments section.' },
  { id: 5, label: 'Typography',      short: 'Type',   icon: Type,         tip: 'Choose fonts and layout style.' },
  { id: 6, label: 'Preview',         short: 'View',   icon: Eye,          tip: 'See exactly how the card will look.' },
  { id: 7, label: 'Submit',          short: 'Send',   icon: Send,         tip: 'Tick the confirmation box and submit.' },
];

const VALIDATION_HINTS: Record<number, string> = {
  0: "Please enter both the bride's name and the groom's name to continue.",
  1: 'Please select at least one deity.',
  2: 'Please pick an invitation template.',
  3: 'Every function needs a date, and none of them can be in the past.',
};

/* ─── Chrome helpers ─────────────────────────────────────────────────────── */

/** Semantic (non-brand) status colours. Deliberately NOT in Palette —
 *  these must read as "error / ok / warning" in both light and dark. */
const UI_ALERT = '#C4362B';
const UI_OK    = '#2E8B57';
const UI_WARN  = '#B7791F';

/** Safely produce an rgba() string from any hex / rgb() / rgba() palette value,
 *  so we can tint from `c.ink` / `c.text` without assuming a 6-digit hex. */
function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (!color) return `rgba(0,0,0,${a})`;
  const s = String(color).trim();
  if (s.charAt(0) === '#') {
    const raw = s.slice(1);
    const hex = raw.length === 3 ? raw.split('').map(x => x + x).join('') : raw.slice(0, 6);
    const n = parseInt(hex, 16);
    if (Number.isNaN(n) || hex.length !== 6) return s;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    if (p.length >= 3) return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})`;
  }
  return s;
}

type ControlSize = 'md' | 'sm';

/** True when a caller passed their own unprefixed width utility (e.g. `w-[118px]`).
 *  The controls default to `w-full`, and because `w-full` and `w-[118px]` carry
 *  identical specificity the winner is decided by stylesheet order rather than by
 *  the order they appear in the class string. That silently blew the salutation
 *  select out to full width and pushed the name input off the edge of the card,
 *  so the base width is now simply omitted when the caller supplies one. */
function hasWidthClass(className: string): boolean {
  return /(^|\s)!?w-/.test(className);
}

/** Resting / hover / focus / invalid treatment shared by Input, Textarea and
 *  Select. Tints from `c.ink`, which inverts between palettes, so it adapts to
 *  dark mode without needing a `dark` prop. */
function useControlChrome(c: Palette, opts?: { invalid?: boolean; size?: ControlSize }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const invalid = !!opts?.invalid;
  const size: ControlSize = opts?.size ?? 'md';

  const borderColor = invalid ? UI_ALERT
    : focused ? c.gold
    : hovered ? withAlpha(c.gold, 0.55)
    : c.border;

  const boxShadow = invalid ? `0 0 0 3px ${withAlpha(UI_ALERT, 0.16)}`
    : focused ? `0 0 0 3px ${withAlpha(c.gold, 0.20)}`
    : `inset 0 1px 0 ${withAlpha(c.ink, 0.03)}`;

  const style: React.CSSProperties = {
    // MUST stay `backgroundColor`, never the `background` shorthand. Select
    // draws its chevron with backgroundImage/Repeat/Position in the same style
    // object; React re-applies only the properties that changed between
    // renders, so a changing shorthand here wiped repeat/position on hover and
    // focus and never restored them — the chevron tiled across the control.
    backgroundColor: focused ? withAlpha(c.ink, 0.015)
      : hovered ? withAlpha(c.ink, 0.065)
      : withAlpha(c.ink, 0.04),
    border: `1.5px solid ${borderColor}`,
    color: c.text,
    boxShadow,
    // 16px minimum stops iOS Safari zooming the page on focus.
    fontSize: size === 'sm' ? 14 : 16,
    minHeight: size === 'sm' ? 40 : 48,
    transition: 'border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease',
  };

  const on = {
    focus: () => setFocused(true),
    blur: () => setFocused(false),
    enter: () => setHovered(true),
    leave: () => setHovered(false),
  };

  return { style, on, focused };
}

/** True when the OS asks for reduced motion. Decorative animation is gated on this. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return reduced;
}

/**
 * Keyboard focus ring for elements whose colour comes from the palette
 * (Tailwind can't express a runtime colour). Spread onto a button:
 *   <button {...focusRing(`${c.gold}55`)} />
 * `resting` is the box-shadow to return to on blur — leave it '' when the
 * resting shadow comes from a Tailwind class, so the class wins again.
 */
function focusRing(color: string, resting = '') {
  return {
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) e.currentTarget.style.boxShadow = `0 0 0 3px ${color}`;
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      e.currentTarget.style.boxShadow = resting;
    },
  };
}

/* ─── Date helpers ───────────────────────────────────────────────────────── */
/** A Date rendered as YYYY-MM-DD in the browser's own timezone. `toISOString()`
 *  answers in UTC, which is a different calendar day for anyone east or west of
 *  it — enough to block today or allow yesterday in the programme date field. */
function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** `min` on a date input only greys days out in the picker — a typed or pasted
 *  value still reaches state, so dates are re-checked here too. YYYY-MM-DD
 *  sorts lexicographically, so a plain string compare is enough. */
function isPastDate(date: string): boolean {
  return !!date && date < todayISO();
}

/* ─── Empty data ─────────────────────────────────────────────────────────── */
const emptyPerson = (): PersonInfo => ({
  name: '',
  fatherName: '', fatherPrefix: 'Shri',
  motherName: '', motherPrefix: 'Smt.',
  grandfatherName: '', grandfatherPrefix: 'Late Shri',
  grandmotherName: '', grandmotherPrefix: 'Late Smt.',
});

const emptyProgramme = (preset = 'wedding'): Programme => {
  const p = PROGRAMME_PRESETS.find(x => x.id === preset);
  return { id: Date.now(), preset, name: p?.name || 'Our Function', date: '', hour: '07', minute: '00', ampm: 'PM', venue: '', address: '', mealType: 'none' };
};

/** Stringified once at module load so the "has the customer started?" check in
 *  CustomerFlow doesn't re-serialise the pristine form on every render. */
const initialForm: FormState = {
  bride: emptyPerson(),
  groom: emptyPerson(),
  aboveWeds: 'bride',
  family: { title: '', nativePlace: '', residenceAddress: '' },
  hostType: 'parents',
  childRelation: 'son',
  deities: ['ganesh'],
  selectedTemplate: 1,
  relationWord: 'weds',
  closingTag: 'k',
  kidsLine: '',
  kidsCustom: '',
  programmes: [emptyProgramme('wedding')],
  withCompliments: '',
  blessingsOnly: true,
  design: {
    language: 'en',
    headingFont: "'Cormorant Garamond', serif",
    bodyFont: "'EB Garamond', serif",
    scriptFont: "'Tangerine', cursive",
    fontSize: 16,
    letterSpacing: 0.5,
    lineHeight: 1.7,
    layout: 'royal',
    cardSize: DEFAULT_CARD_SIZE,
    pageMode: 'combined',
  },
  preview: { device: 'desktop' },
  meta: { accepted: false }
};

const INITIAL_FORM_JSON = JSON.stringify(initialForm);

const sampleForm: FormState = {
  ...initialForm,
  bride: {
    name: 'Aditi Sharma',
    fatherName: 'Rajesh Sharma', fatherPrefix: 'Shri',
    motherName: 'Sunita Sharma', motherPrefix: 'Smt.',
    grandfatherName: 'Ram Prasad Sharma', grandfatherPrefix: 'Late Shri',
    grandmotherName: 'Savitri Sharma',   grandmotherPrefix: 'Late Smt.',
  },
  groom: {
    name: 'Rohan Mehta',
    fatherName: 'Mahesh Mehta', fatherPrefix: 'Shri',
    motherName: 'Kavita Mehta', motherPrefix: 'Smt.',
    grandfatherName: 'Govind Mehta',  grandfatherPrefix: 'Late Shri',
    grandmotherName: 'Parvati Mehta', grandmotherPrefix: 'Late Smt.',
  },
  aboveWeds: 'bride',
  family: { title: 'Parivaar', nativePlace: 'Jaipur, Rajasthan', residenceAddress: '12-B, Rose Garden, Sector 5, Jaipur - 302001' },
  deities: ['ganesh', 'shiva', 'lakshmi', 'om', 'krishna'],
  selectedTemplate: 1,
  // Relative so the sample never loads with a date that has since passed.
  programmes: [
    { id: 1, preset: 'mehendi',   name: 'Mehendi Party',    date: daysFromToday(90), hour: '04', minute: '00', ampm: 'PM', venue: 'Sharma Residence',  address: '12-B Rose Garden, Jaipur' },
    { id: 2, preset: 'haldi',     name: 'Haldi Ceremony',   date: daysFromToday(91), hour: '10', minute: '00', ampm: 'AM', venue: 'Sharma Residence',  address: '12-B Rose Garden, Jaipur' },
    { id: 3, preset: 'wedding',   name: 'Wedding Ceremony', date: daysFromToday(92), hour: '07', minute: '00', ampm: 'PM', venue: 'Taj Mahal Palace',  address: 'Ajmer Road, Jaipur - 302001' },
    { id: 4, preset: 'reception', name: 'Reception',        date: daysFromToday(93), hour: '07', minute: '30', ampm: 'PM', venue: 'Taj Mahal Palace',  address: 'Ajmer Road, Jaipur - 302001' },
  ],
  withCompliments: 'Sharma & Mehta Families',
  kidsCustom: '',
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function pn(prefix: string, name: string) {
  const p = prefix.trim(); const n = name.trim();
  if (!n) return '';
  return p ? `${p} ${n}` : n;
}

function fmtTime(h: string, m: string, ap: string) {
  if (!h) return '';
  return `${h}:${m} ${ap}`;
}

/** Puts the couple's names into a template, as they print in the card's language. */
function fillTemplate(text: string, form: FormState): string {
  const bride = scriptText(form, 'bride.name', form.bride.name || '');
  const groom = scriptText(form, 'groom.name', form.groom.name || '');
  return text.replace(/\{bride\}/g, bride).replace(/\{groom\}/g, groom);
}

/** The chosen template's paragraph in the card's language, names filled in. */
function templateText(form: FormState, id: number | null): string {
  const t = INVITATION_TEMPLATES.find(x => x.id === id);
  return t ? fillTemplate(cardStrings(form).templates[t.id] ?? t.text, form) : '';
}

/** The relation word ("Weds") in the card's language. */
function relationText(form: FormState): string {
  const r = RELATION_WORDS.find(x => x.id === form.relationWord);
  return r ? (cardStrings(form).relationWords[r.id] ?? r.label) : (cardStrings(form).relationWords.weds ?? 'Weds');
}

/** The closing line in the card's language, or '' for none. */
function closingText(form: FormState): string {
  const t = CLOSING_TAGS.find(x => x.id === form.closingTag);
  return t ? (cardStrings(form).closingTags[t.id] ?? t.label) : '';
}

const KIDS_CUSTOM = 'custom';  // sentinel kidsLine id — the KIDS_LINES presets use numeric ids, so it can't collide

/** The kids line as it should print, in the card's language: the couple's own
 *  words when they chose to write one, otherwise the chosen preset. Blank
 *  custom text means no line. */
function kidsLineText(form: FormState): string {
  if (form.kidsLine === KIDS_CUSTOM) {
    const own = (form.kidsCustom || '').trim();
    return own ? scriptText(form, 'kidsCustom', own) : '';
  }
  const t = KIDS_LINES.find(x => x.id === form.kidsLine);
  return t ? (cardStrings(form).kidsLines[t.id] ?? t.label) : '';
}

/** Whether the card gets one sheet per programme. A saved 'separate' choice
 *  only takes effect with two or more dated programmes — with one, its own
 *  sheet would just be the combined page under another name, and the wizard
 *  greys the toggle out then, so preview, export and summary all agree. */
function separateSheets(form: FormState): boolean {
  return form.design.pageMode === 'separate' && form.programmes.filter(p => p.date).length >= 2;
}

/** A programme's printed date and time, in the card's language (English when
 *  no form is given). A reception with a meal prints its time as "from 7:30 PM
 *  onwards (dinner)" in place of the bare time. Shared by the combined page and
 *  the per-programme sheets so the two never drift. */
function progWhen(f: Programme, long = false, form?: FormState): { date: string; time: string } {
  const card = form ?? initialForm;   // initialForm is an English card
  const date = cardDate(card, f.date, long);
  const L = cardStrings(card).labels;
  const at = cardTime(card, f.hour, f.minute, f.ampm);
  const meal = f.preset === 'reception' && f.mealType && f.mealType !== 'none' && at;
  const time = meal ? L.mealFrom.replace('{time}', at).replace('{meal}', f.mealType === 'lunch' ? L.lunch : L.dinner) : at;
  return { date, time };
}

/* ─── Separate function sheets: wording ──────────────────────────────────────
   Everything a per-function sheet prints, in the card's language. Shared by
   the sheet in CardPreview and the CorelDRAW export so the two never drift. */

/** The function's printed name: the card language's preset name unless the
 *  customer renamed it, in which case their own wording (in script if given). */
function sheetFunctionName(form: FormState, f: Programme): string {
  const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
  const typed = f.name.trim();
  if (typed && typed !== preset?.name) return scriptText(form, `programme.${f.id}.name`, typed);
  return cardStrings(form).programmes[f.preset] ?? (typed || preset?.name || '');
}

/** The couple in card order (aboveWeds first), in the card's script. */
function sheetCouple(form: FormState): [string, string] {
  const [a, b] = form.aboveWeds === 'bride' ? ['bride', 'groom'] as const : ['groom', 'bride'] as const;
  return [scriptText(form, `${a}.name`, form[a].name.trim()), scriptText(form, `${b}.name`, form[b].name.trim())];
}

/** The host parents exactly as page 1's host line builds them — a mother and
 *  a father, each taken from the above-weds side first — or '' when the card
 *  isn't hosted by parents. */
function sheetHosts(form: FormState): string {
  if (form.hostType !== 'parents') return '';
  const S = cardStrings(form);
  const [a, b] = form.aboveWeds === 'bride' ? ['bride', 'groom'] as const : ['groom', 'bride'] as const;
  const person = (side: 'bride' | 'groom', who: 'mother' | 'father') => {
    const name = form[side][`${who}Name`].trim();
    if (!name) return '';
    const prefix = form[side][`${who}Prefix`].trim();
    const n = scriptText(form, `${side}.${who}Name`, name);
    return prefix ? `${S.salutations[prefix] ?? prefix} ${n}` : n;
  };
  const mother = person(a, 'mother') || person(b, 'mother');
  const father = person(a, 'father') || person(b, 'father');
  return [mother, father].filter(Boolean).join(S.labels.and);
}

/** The invitation sentence split around {couple}, so the sheet can set the
 *  names large in the middle of it. `hasCouple` is false when a translation
 *  left the placeholder out; the names then follow the sentence. */
function sheetInviteParts(form: FormState, f: Programme): { before: string; after: string; hasCouple: boolean } {
  const L = cardStrings(form).labels;
  const hosts = sheetHosts(form);
  let s = L.sheetInvite.replace('{function}', sheetFunctionName(form, f));
  s = hosts ? s.replace('{hosts}', hosts) : s.replace(/\s*\{hosts\}\s*/, ' ');
  const i = s.indexOf('{couple}');
  const tidy = (t: string) => t.replace(/\s+/g, ' ').trim();
  const before = tidy(i < 0 ? s : s.slice(0, i));
  const after = tidy(i < 0 ? '' : s.slice(i + '{couple}'.length));
  // With no hosts the English starts "request the…"; a sentence still starts with a capital.
  return { before: before.charAt(0).toUpperCase() + before.slice(1), after, hasCouple: i >= 0 };
}

/** The whole invitation sentence as one line, for the export. */
function sheetInviteText(form: FormState, f: Programme): string {
  const { before, after } = sheetInviteParts(form, f);
  const couple = sheetCouple(form).filter(Boolean).join(cardStrings(form).labels.and);
  return [before, couple, after].filter(Boolean).join(' ').replace(/\s+([.,।])/g, '$1');
}

/** A sheet's date, time (with a reception's meal) and note in the card's language. */
function sheetWhen(form: FormState, f: Programme): { date: string; time: string; note: string } {
  const L = cardStrings(form).labels;
  const t = cardTime(form, f.hour, f.minute, f.ampm);
  const meal = f.preset === 'reception' && t && (f.mealType === 'dinner' || f.mealType === 'lunch');
  return {
    date: cardDate(form, f.date, true),
    time: meal ? L.mealFrom.replace('{time}', t).replace('{meal}', L[f.mealType as 'dinner' | 'lunch']) : t,
    note: f.note?.trim() ? scriptText(form, `programme.${f.id}.note`, f.note.trim()) : '',
  };
}

/* ─── Card size ──────────────────────────────────────────────────────────── */
const CM_PER_IN = 2.54;
// Smaller than 3" and the matter can't be set legibly at any scale; larger
// than 20" is a poster, not a card, and its export canvas gets unwieldy.
const CARD_MIN_IN = 3, CARD_MAX_IN = 20;
// The card is laid out at real physical size, so 1in is always 96 CSS px and
// a 16px body font means the same printed size on every card.
const PX_PER_IN = 96;

function isValidCardSize(s: CardSize | undefined): s is CardSize {
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= CARD_MIN_IN && n <= CARD_MAX_IN;
  return !!s && ok(s.widthIn) && ok(s.heightIn);
}

/** e.g. "7 × 9 in (17.8 × 22.9 cm)" — the customer's own unit first. */
function cardSizeText(s: CardSize): string {
  const inch = `${+s.widthIn.toFixed(2)} × ${+s.heightIn.toFixed(2)} in`;
  const cm = `${(s.widthIn * CM_PER_IN).toFixed(1)} × ${(s.heightIn * CM_PER_IN).toFixed(1)} cm`;
  return s.unit === 'cm' ? `${cm} (${inch})` : `${inch} (${cm})`;
}

/** The preset's name ("Square 7×7\"") or "Custom" — paired with cardSizeText. */
function cardSizeName(s: CardSize): string {
  return CARD_SIZES.find(p => p.id === s.preset)?.label || 'Custom';
}

/** The matter as the designer types it into CorelDRAW: every value in the
 *  card's language, every section header in English so the studio can follow
 *  a card in any script. */
function generateCorelText(form: FormState): string {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = kidsLineText(form);
  const deityNames = form.deities.map(id => DEITIES.find(d => d.id === id)?.name).join(' · ');
  const deityGlyphs = form.deities.map(id => DEITIES.find(d => d.id === id)?.glyph).join(' ');
  const lang = langOf(form);
  const L = cardStrings(form).labels;
  const fontName = (fam: string) => FONTS.find(f => f.family === fam)?.name || fam;

  const aboveSide = form.aboveWeds;
  const belowSide = form.aboveWeds === 'bride' ? 'groom' : 'bride';
  const role = (side: 'bride' | 'groom', pos: string) => `${side.toUpperCase()} (${pos} WEDS)`;

  const personBlock = (label: string, side: 'bride' | 'groom') => {
    const p = form[side];
    // The English name in the header lets the studio match a script card to its order.
    let s = `─── ${label}${lang.code !== 'en' && p.name ? ` · ${p.name}` : ''} ───\n`;
    s += `${scriptText(form, `${side}.name`, p.name)}\n`;
    // Both parents on one line, as the card prints them: the "daughter of"
    // wording sits after them in most Indian languages, so it can't split.
    const parents = [p.fatherName && personName(form, side, 'father'), p.motherName && personName(form, side, 'mother')].filter(Boolean).join(L.and);
    if (parents) s += `${childOf(form, side, parents)}\n`;
    if (p.grandfatherName) s += `G/o ${personName(form, side, 'grandfather')}\n`;
    if (p.grandmotherName) s += `${personName(form, side, 'grandmother')}\n`;
    return s + '\n';
  };

  let s = '';
  s += `╔══════════════════════════════════╗\n║   WEDDING CARD MATTER EXPORT     ║\n╚══════════════════════════════════╝\n\n`;
  s += `─── CARD LANGUAGE ───\n${lang.name}${lang.code !== 'en' ? ` (${lang.native})` : ''} · ${lang.script} script · set in ${fontName(form.design.headingFont)} / ${fontName(form.design.bodyFont)} / ${fontName(form.design.scriptFont)}\n\n`;
  s += `─── CARD ORDER ───\n${form.aboveWeds === 'bride' ? 'Bride ABOVE Weds · Groom BELOW' : 'Groom ABOVE Weds · Bride BELOW'}\n\n`;
  s += `─── DEITIES ───\n${deityGlyphs}\n${deityNames}\nMantra: ${DEITIES.find(d => d.id === form.deities[0])?.mantra || '—'}\n\n`;
  s += `─── DESIGN ───\nLayout: ${form.design.layout.toUpperCase()} | Language: ${lang.name}\nHeading: ${form.design.headingFont}\nBody: ${form.design.bodyFont}\nScript: ${form.design.scriptFont}\nSize ${form.design.fontSize}px\n\n`;
  s += `─── CARD SIZE ───\n${cardSizeName(form.design.cardSize)}: ${cardSizeText(form.design.cardSize)}\n\n`;
  s += `─── INVITATION TEMPLATE #${template?.id} (${template?.category}) ───\n${templateText(form, form.selectedTemplate)}\n\n`;
  s += personBlock(role(aboveSide, 'ABOVE'), aboveSide);
  s += `─── RELATION ───\n${relationText(form)}\n\n`;
  s += personBlock(role(belowSide, 'BELOW'), belowSide);
  const progBlock = (f: Programme, head: string) => {
    const when = progWhen(f, true, form);
    // The ISO date too on a script card, so the studio can check it at a glance.
    let b = `\n${head}\n  Date: ${when.date}${lang.code !== 'en' && f.date ? ` [${f.date}]` : ''}\n`;
    if (f.hour) b += `  Time: ${when.time}\n`;
    if (f.venue) b += `  Venue: ${scriptText(form, `programme.${f.id}.venue`, f.venue)}\n`;
    if (f.address) b += `  Address: ${scriptText(form, `programme.${f.id}.address`, f.address)}\n`;
    return b;
  };
  if (separateSheets(form)) {
    // The designer lays out exactly these sheets, so number them the way the
    // preview labels its pages: the invitation is sheet 1.
    const dated = form.programmes.filter(f => f.date);
    s += `─── PROGRAMMES · SEPARATE SHEETS ───\nSheet 1 is the invitation. Each function below gets its own sheet (${dated.length + 1} sheets in all).\n`;
    // Each sheet's own extras, in the order the sheet prints them. The base
    // block stays as the combined list's so the two layouts read alike.
    dated.forEach((f, i) => {
      const when = sheetWhen(form, f);
      const couple = sheetCouple(form).filter(Boolean).join(cardStrings(form).labels.and);
      s += progBlock(f, `═══ SHEET ${i + 2} — ${f.name} ═══`);
      s += `  Artwork: ${PROGRAMME_PRESETS.find(p => p.id === f.preset)?.name || 'Function'} motif (${PROGRAMME_PRESETS.find(p => p.id === f.preset)?.color || '#C0892E'})\n`;
      s += `  Heading: ${sheetFunctionName(form, f)}\n`;
      s += `  Invitation: ${sheetInviteText(form, f)}\n`;
      if (couple) s += `  Couple: ${couple}\n`;
      s += `  Printed date: ${when.date}\n`;
      if (when.time) s += `  Printed time: ${when.time}\n`;
      if (when.note) s += `  Note: ${when.note}\n`;
    });
    const undated = form.programmes.filter(f => !f.date);
    if (undated.length) s += `\nNo date, so not on any sheet: ${undated.map(f => f.name).join(', ')}\n`;
  } else {
    s += `─── PROGRAMMES ───\n`;
    if (lang.code !== 'en') s += `Heading: ${L.programmes}\n`;
    form.programmes.forEach((f, i) => {
      const name = programmeName(form, f);
      s += progBlock(f, `[${i + 1}] ${name}${name !== f.name ? ` (${f.name})` : ''}`);
    });
  }
  if (form.family.residenceAddress) s += `\n─── RESIDENCE ───\n${lang.code !== 'en' ? `${L.residence}\n` : ''}${scriptText(form, 'family.residenceAddress', form.family.residenceAddress)}\n`;
  if (form.withCompliments) s += `\n─── WITH COMPLIMENTS ───\n${lang.code !== 'en' ? `${L.withCompliments}\n` : ''}${scriptText(form, 'withCompliments', form.withCompliments)}\n`;
  if (kidsLine) s += `\n─── KIDS LINE ───\n${kidsLine}\n`;
  if (closing) s += `\n─── CLOSING TAG ───\n[${closing.id.toUpperCase()}] ${closingText(form)}\n`;
  return s;
}

/** The card's matter as the Word export lays it out: page 1, then the
 *  programmes page or one sheet per function, then a details page for the
 *  studio. Worded by the same helpers as CardPreview and generateCorelText,
 *  so the three never drift; lib/docxExport.ts only sets type. `order` adds
 *  the order's own details when there is one. */
function cardMatter(form: FormState, order?: { orderId: string; at: string; status?: string }): CardMatter {
  const lang = langOf(form);
  const L = cardStrings(form).labels;
  const aboveSide = form.aboveWeds;
  const belowSide = form.aboveWeds === 'bride' ? 'groom' : 'bride';
  const pair = (a: string, b: string) => (a && b ? `${a}${L.and}${b}` : a || b);
  // Exactly the lines CardPreview prints under each name.
  const person = (side: 'bride' | 'groom') => {
    const p = form[side];
    return {
      name: scriptText(form, `${side}.name`, p.name),
      childOf: p.fatherName || p.motherName ? childOf(form, side, pair(personName(form, side, 'father'), personName(form, side, 'mother'))) : '',
      grandparents: p.grandfatherName ? pair(personName(form, side, 'grandfather'), personName(form, side, 'grandmother')) : '',
    };
  };
  const hostLine = form.hostType === 'parents'
    ? pair(personName(form, aboveSide, 'mother') || personName(form, belowSide, 'mother'), personName(form, aboveSide, 'father') || personName(form, belowSide, 'father'))
    : '';
  const dated = form.programmes.filter(f => f.date);
  const separate = separateSheets(form);
  const size = isValidCardSize(form.design.cardSize) ? form.design.cardSize : DEFAULT_CARD_SIZE;
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const typed = (path: string, v: string) => (v.trim() ? scriptText(form, path, v.trim()) : '');
  const couple = [form.bride.name, form.groom.name].filter(Boolean).join(' & ');

  const details: [string, string][] = [];
  if (order) {
    details.push(['Order', order.orderId], ['Submitted', order.at]);
    if (order.status) details.push(['Status', order.status]);
  }
  details.push(
    ['Bride', form.bride.name || '—'],
    ['Groom', form.groom.name || '—'],
    ['Card size', `${cardSizeName(size)}: ${cardSizeText(size)}`],
    ['Card language', `${lang.name}${lang.code !== 'en' ? ` (${lang.native})` : ''} · ${lang.script} script`],
    ['Pages', !dated.length ? '1 — the invitation only (no dated functions)'
      : separate ? `${dated.length + 1} — the invitation, then one sheet per function`
      : '2 — the invitation, then every function on one page'],
    ['Invitation template', template ? `#${template.id} (${template.category})` : '—'],
    ['Layout', form.design.layout],
    ['Type', `${form.design.fontSize}px body · letter spacing ${form.design.letterSpacing}px · line height ${form.design.lineHeight}`],
  );
  const undated = form.programmes.filter(f => !f.date);
  if (undated.length) details.push(['Not on the card (no date)', undated.map(f => f.name).join(', ')]);

  return {
    locale: lang.locale,
    latin: isLatinCard(form),
    fonts: {
      heading: familyName(form.design.headingFont),
      body: familyName(form.design.bodyFont),
      script: familyName(form.design.scriptFont || "'Tangerine', cursive"),
    },
    deityNames: form.deities.map(id => DEITIES.find(d => d.id === id)?.name).filter(Boolean).join(' · '),
    mantra: (form.deities[0] && DEITIES.find(d => d.id === form.deities[0])?.mantra) || '',
    hostLine,
    template: templateText(form, form.selectedTemplate).replace(/\n\n\n/g, '\n\n'),
    above: person(aboveSide),
    relation: relationText(form),
    below: person(belowSide),
    residence: form.family.residenceAddress ? { label: L.residence, text: scriptText(form, 'family.residenceAddress', form.family.residenceAddress) } : null,
    compliments: form.withCompliments ? { label: L.withCompliments, text: scriptText(form, 'withCompliments', form.withCompliments) } : null,
    kidsLine: kidsLineText(form),
    closing: closingText(form),
    programmesHeading: L.programmes,
    mode: separate ? 'separate' : 'combined',
    programmes: separate ? [] : dated.map(f => {
      const when = progWhen(f, false, form);
      return { name: programmeName(form, f), date: when.date, time: when.time, venue: typed(`programme.${f.id}.venue`, f.venue), address: typed(`programme.${f.id}.address`, f.address) };
    }),
    sheets: !separate ? [] : dated.map(f => {
      const invite = sheetInviteParts(form, f);
      const when = sheetWhen(form, f);
      return {
        name: sheetFunctionName(form, f),
        // A translation without {couple} has the names after the sentence, as the sheet sets them.
        inviteBefore: invite.before,
        inviteAfter: invite.hasCouple ? invite.after : '',
        coupleLast: !invite.hasCouple,
        couple: sheetCouple(form), and: L.and.trim(),
        date: when.date, time: when.time,
        venue: typed(`programme.${f.id}.venue`, f.venue), address: typed(`programme.${f.id}.address`, f.address),
        noteLabel: L.note, note: when.note,
      };
    }),
    details,
    fontsUsed: fontsUsed(form),
    footer: [order?.orderId, couple].filter(Boolean).join(' · '),
  };
}

/** The matter as a Word file. `docx` is loaded on first use only. */
async function matterDocxFile(form: FormState, base: string, order?: { orderId: string; at: string; status?: string }): Promise<File> {
  const { buildMatterDocx } = await import('./lib/docxExport');
  const blob = await buildMatterDocx(cardMatter(form, order));
  return new File([blob], `${base}-matter.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// Lets a headless check build the Word file from the current form without
// submitting an order. Dev server only; production builds drop it.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__wmpMatterDocx = matterDocxFile;

function loadDraft(): FormState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FormState;
      // `design` merges one level deeper: a draft saved before cardSize and
      // pageMode existed would otherwise replace the whole object and drop them.
      return { ...initialForm, ...parsed, design: { ...initialForm.design, ...parsed.design }, meta: { accepted: false } };
    }
  } catch { /* ignore */ }
  return initialForm;
}

/* ─── Root App ───────────────────────────────────────────────────────────── */
export default function WeddingApp() {
  const [mode, setMode] = useState<'customer' | 'admin'>('customer');
  // Midnight is the product's identity, not an opt-in. Daylight stays available.
  const [dark, setDark] = useState(true);
  const [orders, setOrders] = useState<SubmittedOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const c = dark ? palette.dark : palette.light;

  const refreshOrders = useCallback(async () => {
    setOrders(await fetchOrders());
  }, []);

  useEffect(() => {
    refreshOrders().finally(() => setOrdersLoading(false));
    return subscribeToOrders(refreshOrders);
  }, [refreshOrders]);

  useEffect(() => {
    // Refetch on every auth change too — the orders RLS policy only allows
    // `select` for a signed-in admin, so a fresh sign-in needs a refetch to
    // actually see any rows (an anonymous fetch just returns an empty list).
    getSession().then(s => { setSession(s); setSessionLoading(false); if (s) refreshOrders(); });
    return onAuthChange(s => { setSession(s); refreshOrders(); });
  }, [refreshOrders]);

  const addOrder = useCallback(async (couple: string, form: FormState): Promise<SubmittedOrder | null> => {
    const order = await insertOrder(couple, form);
    if (order) setOrders(prev => [order, ...prev]);
    return order;
  }, []);

  // Optimistic update, then reconcile with the server on failure — realtime
  // keeps every other open tab/device in sync automatically on success.
  const changeOrderStatus = useCallback(async (orderId: string, status: SubmittedOrder['status']) => {
    setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, status } : o));
    if (!(await updateOrderStatus(orderId, status))) refreshOrders();
  }, [refreshOrders]);

  const removeOrder = useCallback(async (orderId: string) => {
    setOrders(prev => prev.filter(o => o.orderId !== orderId));
    if (!(await deleteOrderRow(orderId))) refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    const id = 'wmp-fonts-v3';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    // Inter + Playfair Display + Italianno are the APP's type system; the rest
    // are the fonts customers can choose for the printed card itself.
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400&family=Cormorant+Garamond:wght@400;500;600;700&family=Cinzel:wght@400;700;900&family=Cinzel+Decorative:wght@400;700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Marcellus&family=Tangerine:wght@400;700&family=Great+Vibes&family=Italianno&family=Pinyon+Script&family=Allura&family=Tiro+Devanagari+Hindi&family=Noto+Serif+Devanagari:wght@400;700&family=Rozha+One&family=Yatra+One&family=Sahitya:wght@400;700&family=Modak&family=Noto+Serif+Gujarati:wght@400;700&family=Rasa:wght@400;600&family=Hind+Vadodara:wght@400;600&family=Parisienne&family=Petit+Formal+Script&family=Mrs+Saint+Delafield&family=Alex+Brush&family=Sacramento&family=Dancing+Script:wght@400;700&family=Yellowtail&family=Herr+Von+Muellerhoff&family=Monsieur+La+Doulaise&family=Ephesis&family=Meddon&family=Cormorant+SC:wght@400;600;700&family=Forum&family=Italiana&family=Prata&family=Bodoni+Moda:wght@400;700&family=Gilda+Display&family=Bellefair&family=Lora:wght@400;600;700&family=Crimson+Text:wght@400;600;700&family=Libre+Baskerville:wght@400;700&family=Vollkorn:wght@400;600;700&family=Neuton:wght@300;400;700&family=Domine:wght@400;700&family=Cardo:wght@400;700&family=Spectral:wght@400;600;700&family=Baloo+Bhai+2:wght@400;600;700&family=Mukta:wght@400;600;700&family=Khand:wght@400;600;700&family=Kalam:wght@400;700&family=Martel:wght@400;700&family=Halant:wght@400;600;700&family=Amita:wght@400;700&family=Anek+Devanagari:wght@400;600;700&family=Anek+Gujarati:wght@400;600;700&family=Tiro+Devanagari+Marathi&family=Eczar:wght@400;600;700&family=Laila:wght@400;600;700&family=Mukta+Vaani:wght@400;600;700&family=Shrikhand&family=Kumar+One&family=Farsan&family=Noto+Serif+Gurmukhi:wght@400;600;700&family=Tiro+Gurmukhi&family=Mukta+Mahee:wght@400;600;700&family=Baloo+Paaji+2:wght@400;600;700&family=Anek+Gurmukhi:wght@400;600;700&family=Noto+Sans+Gurmukhi:wght@400;600;700&family=Noto+Serif+Bengali:wght@400;600;700&family=Tiro+Bangla&family=Hind+Siliguri:wght@400;600;700&family=Baloo+Da+2:wght@400;600;700&family=Galada&family=Atma:wght@400;600;700&family=Anek+Bangla:wght@400;600;700&family=Mina:wght@400;700&family=Noto+Serif+Tamil:wght@400;600;700&family=Tiro+Tamil&family=Catamaran:wght@400;600;700&family=Baloo+Thambi+2:wght@400;600;700&family=Arima:wght@400;600;700&family=Hind+Madurai:wght@400;600;700&family=Anek+Tamil:wght@400;600;700&family=Mukta+Malar:wght@400;600;700&family=Noto+Serif+Telugu:wght@400;600;700&family=Tiro+Telugu&family=Sree+Krushnadevaraya&family=Suranna&family=Ramabhadra&family=Gidugu&family=Mallanna&family=Baloo+Tammudu+2:wght@400;600;700&family=Anek+Telugu:wght@400;600;700&family=Hind+Guntur:wght@400;600;700&family=Noto+Serif+Kannada:wght@400;600;700&family=Tiro+Kannada&family=Hubballi&family=Baloo+Tamma+2:wght@400;600;700&family=Anek+Kannada:wght@400;600;700&family=Noto+Sans+Kannada:wght@400;600;700&family=Noto+Serif+Malayalam:wght@400;600;700&family=Manjari:wght@400;700&family=Gayathri:wght@400;700&family=Chilanka&family=Baloo+Chettan+2:wght@400;600;700&family=Anek+Malayalam:wght@400;600;700&display=swap';
    document.head.appendChild(link);
    // The deity symbols that aren't emoji — see DeityGlyph. `text=` makes
    // Google send only these few glyphs, a few KB instead of a whole CJK font.
    const symbols = document.createElement('link');
    symbols.rel = 'stylesheet';
    symbols.href = `https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols&family=Noto+Serif+SC&family=Noto+Serif+Devanagari&text=${encodeURIComponent(TEXT_GLYPHS.join(''))}`;
    document.head.appendChild(symbols);
  }, []);

  return (
    <div className="min-h-screen relative transition-colors duration-700" style={{ background: c.bg1, color: c.text, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Atmosphere c={c} />
      <Nav mode={mode} setMode={setMode} dark={dark} setDark={setDark} c={c} orderCount={orders.filter(o => o.status === 'New').length} session={session} onSignOut={signOut} />
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-32 pt-6">
        <AnimatePresence mode="wait">
          {mode === 'customer' ? (
            <motion.div key="c" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <CustomerFlow c={c} dark={dark} addOrder={addOrder} />
            </motion.div>
          ) : sessionLoading ? (
            <motion.div key="a-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-24">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: c.gold }} />
            </motion.div>
          ) : session ? (
            <motion.div key="a" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <AdminDashboard c={c} dark={dark} orders={orders} ordersLoading={ordersLoading} onStatusChange={changeOrderStatus} onDelete={removeOrder} />
            </motion.div>
          ) : (
            <motion.div key="a-login" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <AdminLogin c={c} />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Twemoji (deity icons) is CC-BY 4.0, which asks for a visible credit. */}
        <footer className="mt-16 text-center text-[10px]" style={{ color: c.subtext, opacity: 0.7 }}>
          Deity icons: <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer" className="underline">Twemoji</a>, CC-BY 4.0
        </footer>
      </main>
    </div>
  );
}

/* ─── Atmosphere ─────────────────────────────────────────────────────────── */
function Atmosphere({ c }: { c: Palette }) {
  // Derive the theme from the palette rather than adding a prop — the signature
  // is part of the shared contract and must stay `{ c }`.
  const isDark = useMemo(() => {
    const h = c.bg1.replace('#', '');
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return r * 0.299 + g * 0.587 + b * 0.114 < 128;
  }, [c.bg1]);

  const grainOpacity = isDark ? 0.06 : 0.05;
  const mandalaOpacity = isDark ? 0.022 : 0.03;
  const vignette = isDark
    ? 'radial-gradient(ellipse 120% 85% at 50% 42%, transparent 42%, rgba(0,0,0,0.42) 100%)'
    : 'radial-gradient(ellipse 120% 88% at 50% 40%, transparent 46%, rgba(74, 48, 20, 0.20) 100%)';

  return (
    <div className="wmp-atmosphere fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {/* 1 — ground */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(168deg, ${c.bg1} 0%, ${c.bg1} 18%, ${c.bg2} 62%, ${c.bg1} 100%),
            linear-gradient(90deg, ${c.bg2} 0%, transparent 22%, transparent 78%, ${c.bg2} 100%)`,
        }}
      />

      {/* 2 — gold bloom, upper left */}
      <div
        className="wmp-bloom absolute"
        style={{
          top: '-24vh', left: '-18vw', width: '78vw', height: '78vh',
          background: `radial-gradient(circle at 50% 50%, ${c.goldLight}${isDark ? '2E' : '46'} 0%, ${c.gold}1A 34%, transparent 68%)`,
        }}
      />

      {/* 3 — maroon bloom, lower right */}
      <div
        className="wmp-bloom wmp-bloom--alt absolute"
        style={{
          bottom: '-30vh', right: '-22vw', width: '86vw', height: '84vh',
          background: `radial-gradient(circle at 50% 50%, ${c.primary}${isDark ? '30' : '24'} 0%, ${c.primary}10 38%, transparent 70%)`,
        }}
      />

      {/* 4 — mandalas */}
      <svg
        className="wmp-spin-slow absolute -top-40 -right-40 w-[620px] h-[620px]"
        viewBox="0 0 200 200" style={{ opacity: mandalaOpacity }}
      >
        <defs>
          <path id="wmp-petal-a" d="M100 22 Q 112 60 100 92 Q 88 60 100 22" fill={c.gold} />
        </defs>
        <circle cx="100" cy="100" r="96" fill="none" stroke={c.gold} strokeWidth="0.28" />
        <circle cx="100" cy="100" r="80" fill="none" stroke={c.gold} strokeWidth="0.28" />
        <circle cx="100" cy="100" r="52" fill="none" stroke={c.gold} strokeWidth="0.5" strokeDasharray="1 3" />
        {Array.from({ length: 24 }).map((_, i) => (
          <use key={i} href="#wmp-petal-a" transform={`rotate(${i * 15} 100 100)`} />
        ))}
      </svg>

      <svg
        className="wmp-spin-slow wmp-spin-slow--rev absolute -bottom-56 -left-52 w-[720px] h-[720px] hidden sm:block"
        viewBox="0 0 200 200" style={{ opacity: mandalaOpacity * 0.8 }}
      >
        <defs>
          <path id="wmp-petal-b" d="M100 34 Q 108 62 100 86 Q 92 62 100 34" fill={c.primary} />
        </defs>
        <circle cx="100" cy="100" r="92" fill="none" stroke={c.primary} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="66" fill="none" stroke={c.gold} strokeWidth="0.3" />
        {Array.from({ length: 16 }).map((_, i) => (
          <use key={i} href="#wmp-petal-b" transform={`rotate(${i * 22.5} 100 100)`} />
        ))}
      </svg>

      {/* 5 — paper grain (tiled inline-SVG turbulence, defined in index.css) */}
      <div className="wmp-grain absolute inset-0" style={{ opacity: grainOpacity }} />

      {/* 6 — vignette: darkens the edges so the centre column reads as lit */}
      <div className="absolute inset-0" style={{ background: vignette }} />
    </div>
  );
}

/* ─── Navigation ─────────────────────────────────────────────────────────── */
function Nav({ mode, setMode, dark, setDark, c, orderCount, session, onSignOut }: { mode: string; setMode: (m: 'customer' | 'admin') => void; dark: boolean; setDark: (d: boolean) => void; c: Palette; orderCount: number; session: Session | null; onSignOut: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  // Only paint-level properties change on scroll. This used to also animate
  // padding, logo width/height and title font-size, which forces a full layout
  // pass mid-scroll — the single worst offender for scroll smoothness here.
  useEffect(() => {
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setScrolled(window.scrollY > 10);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Publish the theme to the document so the global stylesheet can theme the
  // things inline styles can't reach: scrollbars, selection, focus rings,
  // native form-control rendering.
  useEffect(() => {
    document.documentElement.dataset.wmpTheme = dark ? 'dark' : 'light';
  }, [dark]);

  const modes: { key: 'customer' | 'admin'; label: string; Icon: React.ElementType }[] = [
    { key: 'customer', label: 'Customer', Icon: Heart },
    { key: 'admin', label: 'Admin', Icon: LayoutDashboard },
  ];

  const iconBtn =
    'w-10 h-10 rounded-full flex items-center justify-center border shrink-0 transition-colors duration-200';

  return (
    <nav
      className="wmp-nav sticky top-0 z-40"
      style={{
        background: scrolled ? c.surface : c.bg1,
        borderBottom: `1px solid ${scrolled ? c.border : 'transparent'}`,
        boxShadow: scrolled ? `0 10px 30px -24px ${withAlpha(c.ink, 0.8)}` : 'none',
        transition: 'background-color .3s ease, border-color .3s ease, box-shadow .3s ease',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-2">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div
            className="wmp-gold-sweep relative rounded-full flex items-center justify-center shrink-0"
            style={{
              width: 38,
              height: 38,
              background: `linear-gradient(140deg, ${c.primary} 0%, ${c.primaryDark} 45%, ${c.gold} 100%)`,
              boxShadow: `0 6px 18px -8px ${c.primary}, inset 0 0 0 1px ${c.goldLight}55`,
            }}
          >
            <Heart className="w-4 h-4" style={{ color: c.onAccent }} strokeWidth={2} fill="currentColor" />
          </div>
          <div className="min-w-0">
            <div
              className="leading-none truncate"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 600,
                letterSpacing: '0.005em',
                fontSize: 'clamp(1.05rem, 4vw, 1.35rem)',
                color: c.text,
              }}
            >
              Wedding Matter Pro
            </div>
            <div className="hidden sm:flex items-center gap-2 mt-1">
              <span className="h-px w-5" style={{ background: `linear-gradient(90deg, ${c.gold}, transparent)` }} />
              <span
                className="text-[10px] uppercase whitespace-nowrap"
                style={{ letterSpacing: '0.3em', color: c.gold, fontWeight: 600 }}
              >
                Invitation Atelier
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="relative flex rounded-full p-1 border"
            style={{ borderColor: c.border, background: withAlpha(c.ink, 0.05) }}
          >
            {modes.map(({ key, label, Icon }) => {
              const active = mode === key;
              return (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  aria-pressed={active}
                  aria-label={`${label} mode`}
                  className="relative flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-[12px] transition-colors duration-200"
                  style={{
                    background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                    color: active ? c.onAccent : c.subtext,
                    fontWeight: active ? 700 : 600,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  {key === 'admin' && orderCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                      style={{ background: c.accent, boxShadow: `0 0 0 2px ${c.bg1}` }}
                      aria-label={`${orderCount} new orders`}
                    >
                      {orderCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {mode === 'admin' && session && (
            <button
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className={iconBtn}
              style={{ borderColor: c.border, background: withAlpha(c.ink, 0.05), color: c.subtext }}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setDark(!dark)}
            title={dark ? 'Switch to daylight' : 'Switch to candlelight'}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            className={iconBtn}
            style={{ borderColor: c.border, background: withAlpha(c.ink, 0.05) }}
          >
            {dark
              ? <Sun className="w-4 h-4" style={{ color: c.gold }} />
              : <Moon className="w-4 h-4" style={{ color: c.primary }} />}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ─── Admin Login ────────────────────────────────────────────────────────── */
function AdminLogin({ c }: { c: Palette }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const reduce = usePrefersReducedMotion();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
    // On success, onAuthChange (wired in the root component) flips the
    // screen to the dashboard automatically — nothing else to do here.
  };

  // Supabase's raw messages are developer-speak; translate the ones the owner
  // will actually hit, and fall back to the original so nothing is ever swallowed.
  const friendly = (raw: string): string => {
    const m = raw.toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'That email and password don’t match. Check both — the password is case-sensitive.';
    if (m.includes('email not confirmed')) return 'This account hasn’t been confirmed yet. Confirm the invitation email, then sign in.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts just now. Please wait a minute and try again.';
    if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach the server. Check your internet connection and try again.';
    return raw;
  };

  const corner = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 22, height: 22, pointerEvents: 'none', opacity: 0.75, ...pos,
  });

  return (
    <div className="max-w-md mx-auto px-1 pt-6 sm:pt-14 pb-20">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: 'easeOut' }}
        className="relative rounded-3xl border shadow-2xl overflow-hidden"
        style={{ borderColor: c.border, background: c.surface }}
      >
        {/* gold hairline along the top edge */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.gold}, transparent)` }} />

        <div className="relative px-6 sm:px-9 pt-9 pb-8">
          {/* corner ornaments */}
          <div style={corner({ top: 14, left: 14, borderTop: `1.5px solid ${c.gold}`, borderLeft: `1.5px solid ${c.gold}`, borderTopLeftRadius: 8 })} />
          <div style={corner({ top: 14, right: 14, borderTop: `1.5px solid ${c.gold}`, borderRight: `1.5px solid ${c.gold}`, borderTopRightRadius: 8 })} />
          <div style={corner({ bottom: 14, left: 14, borderBottom: `1.5px solid ${c.gold}`, borderLeft: `1.5px solid ${c.gold}`, borderBottomLeftRadius: 8 })} />
          <div style={corner({ bottom: 14, right: 14, borderBottom: `1.5px solid ${c.gold}`, borderRight: `1.5px solid ${c.gold}`, borderBottomRightRadius: 8 })} />

          {/* seal */}
          <div className="relative mx-auto mb-5" style={{ width: 74, height: 74 }}>
            <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${c.gold}55` }} />
            <div
              className="absolute inset-[7px] rounded-full flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 14px 34px -14px ${c.primary}` }}
            >
              <Lock className="w-6 h-6" style={{ color: c.onAccent }} strokeWidth={2} aria-hidden="true" />
            </div>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.34em] mb-2" style={{ color: c.gold }}>Wedding Matter Pro</div>
            <h1 className="font-medium leading-none" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.9rem, 6vw, 2.4rem)', color: c.text }}>
              Studio Sign In
            </h1>
            <p className="text-sm mt-3 leading-snug font-medium" style={{ color: c.subtext }}>
              Private access for the studio. Customer orders are only ever visible from here.
            </p>
          </div>

          <Divider c={c} w="w-16" />

          <form onSubmit={submit} className="space-y-4 mt-6">
            <Field label="Email" c={c}>
              <Input
                c={c}
                type="email"
                required
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loading}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourstudio.com"
              />
            </Field>

            <Field label="Password" c={c}>
              <div className="flex items-stretch gap-2">
                <Input
                  c={c}
                  className="flex-1"
                  type={showPw ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  title={showPw ? 'Hide password' : 'Show password'}
                  className="w-12 shrink-0 rounded-xl border flex items-center justify-center transition hover:opacity-80"
                  style={{ borderColor: c.border, background: `${c.gold}10`, color: c.gold }}
                  {...focusRing(`${c.gold}55`)}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <div aria-live="polite" role="alert">
              {error && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.25, ease: 'easeOut' }}
                  className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl text-xs font-semibold leading-snug"
                  style={{ background: `${c.primary}12`, border: `1px solid ${c.primary}45`, color: c.primary }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                  <span>{friendly(error)}</span>
                </motion.div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 rounded-full text-sm font-bold tracking-wide transition disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                minHeight: 54,
                background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`,
                color: c.onAccent,
                boxShadow: `0 16px 38px -16px ${c.primary}`,
              }}
              {...focusRing(`${c.gold}66`)}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-4 h-4" aria-hidden="true" />}
              {loading ? 'Signing you in…' : 'Enter the Studio'}
            </button>
          </form>
        </div>

        <div className="px-6 sm:px-9 py-4 border-t text-center" style={{ borderColor: c.border, background: `${c.gold}0A` }}>
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold" style={{ color: c.subtext }}>
            <Lock className="w-3 h-3" style={{ color: c.gold }} aria-hidden="true" />
            Encrypted sign-in · you stay signed in on this device
          </div>
        </div>
      </motion.div>

      <p className="text-center text-[11px] mt-5 leading-relaxed font-medium px-4" style={{ color: c.subtext }}>
        Forgotten the password? It can be reset from your Supabase project under
        <span className="whitespace-nowrap"> Authentication → Users</span>. There is no public sign-up.
      </p>
    </div>
  );
}

/* ─── Customer Flow ──────────────────────────────────────────────────────── */
function CustomerFlow({ c, dark, addOrder, onBack }: { c: Palette; dark: boolean; addOrder: (couple: string, form: FormState) => Promise<SubmittedOrder | null>; onBack?: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [submitted, setSubmitted] = useState<SubmittedOrder | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    setSaving(true);
    const id = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* ignore */ }
      setSaving(false);
    }, 600);
    return () => clearTimeout(id);
  }, [form]);

  // Clones only the objects along `path` rather than deep-cloning the whole
  // FormState. The old JSON.parse(JSON.stringify(prev)) round-tripped every
  // programme, deity and design setting on each individual keystroke, which is
  // what made typing feel heavy.
  const update = (path: string, value: unknown) => {
    setForm(prev => {
      const keys = path.split('.');
      const next = { ...prev } as FormState;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] };
        cur = cur[k];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  // Suggests every printed value in the card's script, whichever step it was typed on.
  const script = useScriptSuggestions(form, setForm);

  // Keeps the card language already chosen, so a Marathi customer sees a Marathi sample.
  const fillSample = () => { setForm(prev => withLanguage(sampleForm, langOf(prev).code)); showToast('Sample card loaded!'); };
  const clearDraft = () => { setForm(initialForm); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

  const canNext = useMemo(() => {
    if (step === 0) return !!(form.bride.name.trim() && form.groom.name.trim());
    if (step === 1) return form.deities.length > 0;
    if (step === 2) return form.selectedTemplate !== null;
    if (step === 3) return form.programmes.length > 0
      && form.programmes.some(p => p.date)
      && !form.programmes.some(p => isPastDate(p.date));
    return true;
  }, [step, form]);

  const showToast = (msg: string, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); };
  const next = () => { if (!canNext) { showToast(VALIDATION_HINTS[step] || 'Please complete this step.', 'error'); return; } setStep(s => Math.min(STEPS.length - 1, s + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const prev = () => { setStep(s => Math.max(0, s - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submit = async () => {
    if (!form.meta.accepted) { showToast('Please tick the confirmation checkbox.', 'error'); return; }
    if (submitting) return;
    setSubmitting(true);
    const couple = `${form.bride.name}${form.groom.name ? ` & ${form.groom.name}` : ''}`;
    const order = await addOrder(couple, JSON.parse(JSON.stringify(form)));
    setSubmitting(false);
    if (!order) { showToast('Could not save your order — check your connection and try again.', 'error'); return; }
    setSubmitted(order);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const coupleNames = form.bride.name && form.groom.name ? `${form.bride.name} & ${form.groom.name}` : null;

  // Re-keys the sheen overlay so it replays on every edit — the customer SEES the card update.
  const hasDraft = useMemo(() => JSON.stringify(form) !== INITIAL_FORM_JSON, [form]);
  const stageBg = dark
    ? 'linear-gradient(165deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.34) 100%)'
    : `linear-gradient(165deg, ${c.ink}16 0%, ${c.ink}08 100%)`;
  const stageInset = `inset 0 1px 0 ${c.gold}26, inset 0 18px 34px -22px rgba(0,0,0,0.75)`;

  if (submitted) return <Success submitted={submitted} c={c} form={form} dark={dark} onReset={() => { setSubmitted(null); setForm(initialForm); setStep(0); }} />;

  return (
    <div className="pt-4 sm:pt-6">
      {onBack && (
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5 border transition-all hover:scale-105" style={{ borderColor: c.border, color: c.subtext, background: c.surface }}>
          <ChevronLeft className="w-3.5 h-3.5" /> Change method
        </button>
      )}
      <Hero c={c} onFillSample={fillSample} onClear={clearDraft} hasDraft={hasDraft} compact={step > 0} />
      <Stepper step={step} setStep={setStep} c={c} dark={dark} saving={saving} offline={offline} />

      {/* ── Mobile live-preview peek bar ─────────────────────────────────────
          Sits directly above the grid so it can actually stick while the form
          scrolls (a sticky element inside a grid *item* can't travel). ───── */}
      <div className="lg:hidden sticky top-[3.5rem] z-30 mt-6">
        <button
          type="button"
          onClick={() => setPreviewExpanded(true)}
          className="w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-xl transition active:scale-[0.99]"
          style={{ borderColor: c.border, background: c.surface }}
        >
          {/* miniature card glyph */}
          <div className="relative w-9 h-[2.75rem] rounded-md shrink-0 overflow-hidden"
            style={{ background: '#FFFFFF', boxShadow: '0 2px 7px rgba(0,0,0,0.28)' }}>
            <div className="absolute inset-[3px] rounded-[3px]" style={{ border: '1px solid rgba(192,137,46,0.55)' }} />
            <div className="absolute left-1/2 -translate-x-1/2 top-[9px] w-4 h-px" style={{ background: '#C0892E' }} />
            <div className="absolute left-1/2 -translate-x-1/2 top-[15px] w-5 h-[2px] rounded-full" style={{ background: '#111111', opacity: 0.5 }} />
            <div className="absolute left-1/2 -translate-x-1/2 top-[22px] w-3 h-px" style={{ background: '#C0892E' }} />
            <div className="absolute left-1/2 -translate-x-1/2 top-[28px] w-5 h-[2px] rounded-full" style={{ background: '#111111', opacity: 0.5 }} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ background: c.gold }} />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: c.gold }} />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.28em]" style={{ color: c.gold }}>Live preview</span>
            </div>
            <div className="text-[13px] font-bold truncate mt-0.5" style={{ color: c.text }}>
              {coupleNames || 'Your card is taking shape'}
            </div>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0"
            style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, color: c.onAccent }}>
            <Maximize2 className="w-3 h-3" /> View
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 mt-4 lg:mt-6 items-start">
        <div className="min-w-0 lg:col-span-7 xl:col-span-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28 }}>
              {step === 0 && <StepFamily form={form} update={update} setForm={setForm} c={c} dark={dark} script={script} />}
              {step === 1 && <StepDeities form={form} setForm={setForm} c={c} />}
              {step === 2 && <StepInvitation form={form} update={update} c={c} dark={dark} />}
              {step === 3 && <StepProgrammes form={form} setForm={setForm} c={c} />}
              {step === 4 && <StepExtras form={form} update={update} c={c} />}
              {step === 5 && <StepDesign form={form} update={update} setForm={setForm} c={c} dark={dark} />}
              {step === 6 && <StepPreview form={form} update={update} c={c} dark={dark} script={script} />}
              {step === 7 && <StepSubmit form={form} update={update} c={c} onSubmit={submit} setStep={setStep} submitting={submitting} script={script} />}
            </motion.div>
          </AnimatePresence>
          <NavButtons step={step} prev={prev} next={next} onSubmit={submit} c={c} canNext={canNext} submitting={submitting} />
        </div>

        <div className="min-w-0 lg:col-span-5 xl:col-span-6">
          <div className="lg:sticky lg:top-[4.5rem]">
            <div className="rounded-[1.75rem] border overflow-hidden shadow-2xl"
              style={{ borderColor: c.border, background: c.surface }}>

              {/* ── Header ─────────────────────────────────────────────── */}
              {/* Wraps the controls under the names when the column is narrow (around
                  1024px) rather than squeezing "Live Preview" onto two lines. */}
              <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-4 sm:px-5 py-3 border-b" style={{ borderColor: c.border }}>
                <div className="min-w-[13rem] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="relative flex w-1.5 h-1.5">
                      <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ background: c.gold }} />
                      <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: c.gold }} />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] whitespace-nowrap" style={{ color: c.gold }}>Live Preview</span>
                  </div>
                  <div className="truncate leading-tight mt-0.5"
                    style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.15rem', color: coupleNames ? c.text : c.subtext }}>
                    {coupleNames || 'Untitled invitation'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <ZoomControls zoom={previewZoom} setZoom={setPreviewZoom} c={c} className="hidden sm:flex" />
                  <button
                    type="button"
                    onClick={() => setPreviewExpanded(true)}
                    aria-label="Open full card"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition hover:opacity-75 active:scale-95"
                    style={{ color: c.gold, background: `${c.gold}14`, border: `1px solid ${c.border}` }}
                  >
                    <Maximize2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Expand</span>
                  </button>
                </div>
              </div>

              {/* ── The stage ──────────────────────────────────────────── */}
              <div className="relative px-3 sm:px-6 pt-5 pb-6"
                style={{ background: stageBg, boxShadow: stageInset }}>
                {/* warm overhead light */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(115% 65% at 50% -8%, ${c.gold}16 0%, transparent 62%)` }} />

                <div className={`relative ${previewZoom > 1 ? 'overflow-x-auto overflow-y-hidden' : ''}`}>
                  <div style={{ zoom: previewZoom } as React.CSSProperties}>
                    <CardPreview form={form} c={c} dark={dark} compact />
                  </div>
                </div>


              </div>

              {/* ── Footer ─────────────────────────────────────────────── */}
              <div className="px-4 sm:px-5 py-3 border-t" style={{ borderColor: c.border }}>
                <button
                  type="button"
                  onClick={() => setPreviewExpanded(true)}
                  className="w-full py-2.5 rounded-2xl text-[12px] font-bold tracking-wide transition hover:opacity-90 active:scale-[0.98] lg:hidden"
                  style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, color: c.onAccent }}
                >
                  View Full Card
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewExpanded(true)}
                  className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.24em] transition hover:opacity-70"
                  style={{ color: c.subtext }}
                >
                  <Maximize2 className="w-3 h-3" /> Open full screen
                </button>
              </div>
            </div>

            <div className="hidden lg:block text-center text-[10px] font-medium mt-3 tracking-wide" style={{ color: c.subtext }}>
              Updates live as you type · shown at true print proportions
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {previewExpanded && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            onClick={() => setPreviewExpanded(false)}
            className="fixed inset-0 z-50 overflow-auto"
            style={{
              background: 'radial-gradient(125% 95% at 50% -5%, rgba(20,19,26,0.97) 0%, rgba(9,8,12,0.99) 55%, rgba(0,0,0,0.995) 100%)',
            }}
          >
            {/* museum plaque bar */}
            <div
              onClick={e => e.stopPropagation()}
              className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-3"
              style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.0) 100%)' }}
            >
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] min-w-0" style={{ color: c.goldLight }}>
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Full Card</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ZoomControls zoom={previewZoom} setZoom={setPreviewZoom} c={c} onDark className="hidden sm:flex" />
                <button
                  type="button" onClick={() => window.print()} aria-label="Print card"
                  className="w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-75 active:scale-90"
                  style={{ color: c.goldLight, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)' }}
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button" onClick={() => setPreviewExpanded(false)} aria-label="Close preview"
                  className="w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-75 active:scale-90"
                  style={{ color: c.goldLight, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="min-h-[calc(100vh-3.5rem)] flex items-start lg:items-center justify-center px-4 pt-1 pb-16">
              <motion.div
                initial={{ opacity: 0, scale: 0.965, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.975, y: 8 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-xl"
              >
                {coupleNames && (
                  <div className="text-center mb-6">
                    <div style={{ fontFamily: "'Italianno', cursive", fontSize: 'clamp(2.4rem, 8vw, 3.6rem)', color: c.goldLight, lineHeight: 1 }}>
                      {coupleNames}
                    </div>
                    <div className="mx-auto mt-3 h-px w-28" style={{ background: `linear-gradient(90deg, transparent, ${c.gold}, transparent)` }} />
                  </div>
                )}

                <div className="wmp-print-area wmp-print-modal" style={{ zoom: previewZoom } as React.CSSProperties}>
                  <CardPreview form={form} c={c} dark={dark} />
                </div>

                <div className="sm:hidden mt-6 flex justify-center">
                  <ZoomControls zoom={previewZoom} setZoom={setPreviewZoom} c={c} onDark />
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewExpanded(false)}
                  className="mt-6 w-full py-3.5 rounded-full font-bold text-sm tracking-wide transition hover:opacity-90 active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, color: c.onAccent }}
                >
                  ✓ Close Preview
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key="wm-toast"
            role="status"
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            initial={{ opacity: 0, y: 22, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
            className="fixed left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm px-0"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)' }}
          >
            <div
              className="flex items-start gap-3 rounded-2xl px-4 py-3.5 border"
              style={{
                background: c.bg1,
                borderColor: toast.type === 'error' ? withAlpha(UI_ALERT, 0.5) : withAlpha(c.gold, 0.5),
                boxShadow: `0 24px 54px -20px ${withAlpha(c.ink, 0.65)}`,
              }}
            >
              <span
                aria-hidden
                className="shrink-0 grid place-items-center rounded-full"
                style={{
                  width: 28, height: 28,
                  background: toast.type === 'error' ? withAlpha(UI_ALERT, 0.16) : withAlpha(c.gold, 0.16),
                  color: toast.type === 'error' ? UI_ALERT : c.gold,
                }}
              >
                {toast.type === 'error' ? <Info className="w-4 h-4" /> : <Check className="w-4 h-4" strokeWidth={3} />}
              </span>
              <p className="flex-1 font-semibold leading-snug pt-1" style={{ color: c.text, fontSize: 14 }}>
                {toast.msg}
              </p>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Dismiss message"
                className="shrink-0 -mr-1.5 -mt-1 grid place-items-center rounded-full transition-opacity duration-200 opacity-60 hover:opacity-100"
                style={{ width: 32, height: 32, color: c.text }}
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────── */
function Hero({ c, onFillSample, onClear, hasDraft, compact = false }: { c: Palette; onFillSample: () => void; onClear: () => void; hasDraft: boolean; compact?: boolean }) {
  const ghostBtn: React.CSSProperties = {
    borderColor: withAlpha(c.gold, 0.45),
    color: c.gold,
    background: withAlpha(c.gold, 0.08),
  };

  return (
    <AnimatePresence initial={false} mode="wait">
      {compact ? (
        /* Collapsed: one slim line, so the wizard + card own the fold */
        <motion.div
          key="hero-compact"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
          className="flex items-center justify-between gap-3 mb-4"
        >
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.32em] shrink-0" style={{ color: withAlpha(c.gold, 0.9) }}>
              Card Studio
            </span>
            <span aria-hidden className="hidden sm:block h-px w-7 shrink-0 self-center" style={{ background: withAlpha(c.gold, 0.5) }} />
            <span className="truncate" style={{ fontFamily: "'Italianno', cursive", fontSize: '2rem', lineHeight: 0.9, color: c.gold, fontWeight: 700 }}>
              wedding matter
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button" onClick={onFillSample} title="Fill the whole form with a sample card"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 sm:px-4 text-[12px] font-bold transition-colors duration-200"
              style={{ ...ghostBtn, minHeight: 40 }}
            >
              <Zap className="w-3.5 h-3.5" aria-hidden />
              <span className="hidden sm:inline">Sample</span>
              <span className="sr-only sm:hidden">Load a sample card</span>
            </button>
            {hasDraft && (
              <button
                type="button" onClick={onClear} title="Clear everything and start fresh"
                className="inline-flex items-center justify-center rounded-full border transition-colors duration-200"
                style={{ borderColor: c.border, color: withAlpha(c.text, 0.55), width: 40, height: 40 }}
              >
                <X className="w-3.5 h-3.5" aria-hidden />
                <span className="sr-only">Clear and start fresh</span>
              </button>
            )}
          </div>
        </motion.div>
      ) : (
        /* Full: short enough that the Stepper still lands above the fold */
        <motion.div
          key="hero-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          className="text-center mb-6 sm:mb-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
            className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] mb-4"
            style={{ borderColor: withAlpha(c.gold, 0.4), color: c.gold, background: withAlpha(c.gold, 0.08) }}
          >
            <Sparkles className="w-3 h-3" aria-hidden /> Premium Card Studio
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.06, ease: 'easeOut' }}
            className="font-medium leading-[1.04] tracking-tight"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(2.1rem, 6.4vw, 3.5rem)', color: c.text }}
          >
            Pick your perfect
            <br />
            <span style={{ fontFamily: "'Italianno', cursive", color: c.gold, fontSize: '1.38em', fontWeight: 700, lineHeight: 0.82 }}>
              wedding matter
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.55, delay: 0.14 }}
            className="mt-3 max-w-xs sm:max-w-sm mx-auto leading-relaxed font-medium"
            style={{ color: c.subtext, fontSize: '0.95rem' }}
          >
            15 ready invitation texts · 12 deities · nothing to write yourself
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.22 }}
            className="mt-5 flex items-center justify-center gap-2 flex-wrap"
          >
            <button
              type="button" onClick={onFillSample}
              className="inline-flex items-center gap-2 rounded-full border px-5 text-sm font-bold transition-colors duration-200"
              style={{ ...ghostBtn, minHeight: 48 }}
            >
              <Zap className="w-4 h-4" aria-hidden /> See a sample card first
            </button>
            {hasDraft && (
              <button
                type="button" onClick={onClear}
                className="inline-flex items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors duration-200"
                style={{ borderColor: c.border, color: c.subtext, minHeight: 48 }}
              >
                <X className="w-3.5 h-3.5" aria-hidden /> Clear &amp; start fresh
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Divider({ c, w = 'w-28' }: { c: Palette; w?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 mt-6 select-none" aria-hidden="true">
      <span className={`h-px ${w}`} style={{ background: `linear-gradient(90deg, transparent, ${c.gold}59 55%, ${c.gold})` }} />
      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: c.gold, opacity: 0.55 }} />
      <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0 overflow-visible">
        {/* four-petal lotus mark: solid core, hairline outer for depth */}
        <path d="M12 2.6 C 13.6 7.8 16.2 10.4 21.4 12 C 16.2 13.6 13.6 16.2 12 21.4 C 10.4 16.2 7.8 13.6 2.6 12 C 7.8 10.4 10.4 7.8 12 2.6 Z" fill={c.gold} />
        <path d="M12 6.6 C 12.9 9.9 14.1 11.1 17.4 12 C 14.1 12.9 12.9 14.1 12 17.4 C 11.1 14.1 9.9 12.9 6.6 12 C 9.9 11.1 11.1 9.9 12 6.6 Z" fill={c.goldLight} opacity="0.85" />
        <circle cx="12" cy="12" r="10.4" fill="none" stroke={c.gold} strokeWidth="0.5" opacity="0.35" />
      </svg>
      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: c.gold, opacity: 0.55 }} />
      <span className={`h-px ${w}`} style={{ background: `linear-gradient(90deg, ${c.gold}, ${c.gold}59 45%, transparent)` }} />
    </div>
  );
}

/* ─── Stepper ────────────────────────────────────────────────────────────── */
function Stepper({ step, setStep, c, dark, saving, offline }: { step: number; setStep: (n: number) => void; c: Palette; dark: boolean; saving: boolean; offline: boolean }) {
  const total = STEPS.length;
  const CurrentIcon = STEPS[step].icon;
  const trackIdle = withAlpha(c.ink, dark ? 0.22 : 0.12);

  return (
    <div
      className="rounded-3xl border p-4 sm:p-5"
      style={{
        borderColor: c.border,
        background: c.surface,
        boxShadow: `0 20px 48px -30px ${withAlpha(c.ink, 0.5)}`,
      }}
    >
      {/* Heading row: where am I + is my work safe */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            aria-hidden
            className="shrink-0 grid place-items-center rounded-full"
            style={{ width: 38, height: 38, background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, color: c.onAccent, boxShadow: `0 8px 20px -10px ${withAlpha(c.primary, 0.9)}` }}
          >
            <CurrentIcon className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: c.gold }}>
              Step {step + 1} of {total}
            </div>
            <div
              className="truncate leading-tight"
              style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.25rem, 4.5vw, 1.6rem)', fontWeight: 600, color: c.text }}
            >
              {STEPS[step].label}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-1">
          {offline && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: withAlpha(UI_WARN, 0.15), color: UI_WARN }}>
              <CloudOff className="w-3 h-3" aria-hidden /> Offline
            </span>
          )}
          <span
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap"
            style={{ color: saving ? c.gold : withAlpha(c.text, 0.5) }}
          >
            {saving ? (
              <>
                <motion.span
                  className="rounded-full" style={{ width: 6, height: 6, background: c.gold }}
                  animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-3 h-3" style={{ color: UI_OK }} aria-hidden /> Saved
              </>
            )}
          </span>
        </div>
      </div>

      {/* Segmented rail — 8 segments always fit 360px; still tappable back to
          any completed step, exactly like the old icon row. */}
      <nav aria-label="Wizard progress" className="mt-4 flex items-stretch gap-1 sm:gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const reachable = i <= step;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              title={reachable && !active ? `Go back to ${s.label}` : s.label}
              aria-current={active ? 'step' : undefined}
              aria-label={`Step ${i + 1} of ${total}: ${s.label}${done ? ' — completed, tap to go back' : active ? ' — current step' : ' — not reached yet'}`}
              className="group flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5 rounded-lg transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ minHeight: 44 }}
            >
              <motion.span
                aria-hidden
                className="block w-full rounded-full"
                initial={false}
                animate={{ height: active ? 7 : 5 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                style={{
                  background: active
                    ? `linear-gradient(90deg, ${c.primary}, ${c.gold})`
                    : done ? c.goldDeep
                    : trackIdle,
                  boxShadow: active ? `0 3px 12px -3px ${withAlpha(c.primary, 0.8)}` : 'none',
                }}
              />
              <span
                aria-hidden
                className="leading-none font-bold truncate max-w-full"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  color: active ? c.gold : done ? c.gold : withAlpha(c.text, 0.62),
                }}
              >
                <span className="sm:hidden">{i + 1}</span>
                <span className="hidden sm:inline">{s.short}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {/* What to do here */}
      <p className="mt-3.5 leading-snug font-medium" style={{ color: c.subtext, fontSize: 13 }}>
        {STEPS[step].tip}
      </p>
    </div>
  );
}

/* ─── Nav Buttons ────────────────────────────────────────────────────────── */
function NavButtons({ step, prev, next, onSubmit, c, canNext, submitting }: { step: number; prev: () => void; next: () => void; onSubmit: () => void; c: Palette; canNext: boolean; submitting?: boolean }) {
  const isLast = step === STEPS.length - 1;
  const hint = !canNext ? VALIDATION_HINTS[step] : undefined;
  const hintId = 'wm-nav-hint';

  const primaryFill = canNext
    ? `linear-gradient(135deg, ${c.primary}, ${c.gold})`
    : withAlpha(c.ink, 0.13);
  const primaryShadow = canNext ? `0 14px 34px -14px ${withAlpha(c.primary, 0.85)}` : 'none';

  return (
    <div
      className="sticky bottom-0 z-30 mt-6 pt-4"
      style={{
        /* A solid toolbar with a hard top edge, not a fade. The old gradient
           dissolved whatever field happened to sit under it, which read as
           content being cut off rather than as a bar sitting on top. */
        background: c.bg1,
        borderTop: `1px solid ${c.border}`,
        boxShadow: `0 -16px 32px -26px ${withAlpha(c.ink, 0.9)}`,
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
      }}
    >
      <AnimatePresence initial={false}>
        {hint && (
          <motion.div
            key="nav-hint"
            id={hintId}
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="flex items-start gap-2.5 rounded-2xl px-4 py-3 mb-3 leading-snug font-semibold"
            style={{
              background: withAlpha(c.gold, 0.11),
              border: `1px solid ${withAlpha(c.gold, 0.34)}`,
              color: c.text,
              fontSize: 13,
            }}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.gold }} aria-hidden />
            <span>{hint}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-stretch gap-2.5">
        <button
          type="button"
          onClick={prev}
          disabled={step === 0}
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border px-4 sm:px-5 text-sm font-bold transition-all duration-200 disabled:opacity-35 disabled:cursor-not-allowed"
          style={{ borderColor: c.border, background: withAlpha(c.ink, 0.03), color: c.text, minHeight: 54, minWidth: 54 }}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden />
          <span className="hidden sm:inline">Back</span>
          <span className="sr-only sm:hidden">Back</span>
        </button>

        {!isLast ? (
          <motion.button
            type="button"
            onClick={next}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.18 }}
            aria-disabled={!canNext}
            aria-describedby={hint ? hintId : undefined}
            title={hint || 'Continue to the next step'}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl text-[15px] font-bold tracking-wide transition-all duration-200"
            style={{
              background: primaryFill,
              color: canNext ? '#fff' : withAlpha(c.text, 0.5),
              boxShadow: primaryShadow,
              border: canNext ? '1px solid transparent' : `1px solid ${c.border}`,
              minHeight: 54,
            }}
          >
            {canNext ? <Check className="w-4 h-4" strokeWidth={3} aria-hidden /> : <Info className="w-4 h-4" aria-hidden />}
            Continue
            <ChevronRight className="w-4 h-4" aria-hidden />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.18 }}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl text-[15px] font-bold tracking-wide transition-all duration-200 disabled:opacity-70 disabled:cursor-wait"
            style={{
              background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`,
              color: c.onAccent,
              boxShadow: `0 14px 34px -14px ${withAlpha(c.primary, 0.85)}`,
              minHeight: 54,
            }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
            {submitting ? 'Submitting…' : 'Submit to Designer'}
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ─── Reusable UI ────────────────────────────────────────────────────────── */
function Section({ title, subtitle, children, c, icon: Icon, eyebrow, tip }: { title: string; subtitle?: string; children: React.ReactNode; c: Palette; dark?: boolean; icon?: React.ElementType; eyebrow?: string; tip?: string }) {
  return (
    <section
      className="rounded-3xl border overflow-hidden"
      style={{
        borderColor: c.border,
        background: c.surface,
        boxShadow: `0 26px 64px -34px ${withAlpha(c.ink, 0.45)}`,
      }}
    >
      <header className="px-4 sm:px-8 pt-6 sm:pt-7 pb-5">
        {eyebrow && (
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2.5" style={{ color: withAlpha(c.gold, 0.95) }}>
            {eyebrow}
          </div>
        )}
        <div className="flex items-start gap-3.5">
          {Icon && (
            <span
              aria-hidden
              className="shrink-0 grid place-items-center rounded-full mt-1"
              style={{ width: 38, height: 38, border: `1px solid ${withAlpha(c.gold, 0.42)}`, background: withAlpha(c.gold, 0.1), color: c.gold }}
            >
              <Icon className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2
              className="leading-[1.12]"
              style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.55rem, 4.4vw, 2.05rem)', fontWeight: 600, letterSpacing: '-0.01em', color: c.text }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1.5 leading-snug font-medium" style={{ color: c.subtext, fontSize: 14 }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {tip && (
          <div
            className="mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 leading-snug font-semibold"
            style={{ background: withAlpha(c.gold, 0.09), border: `1px solid ${withAlpha(c.gold, 0.22)}`, color: withAlpha(c.text, 0.86), fontSize: 12.5 }}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: c.gold }} aria-hidden />
            <span>{tip}</span>
          </div>
        )}
      </header>

      <div aria-hidden className="h-px mx-4 sm:mx-8" style={{ background: `linear-gradient(90deg, transparent, ${withAlpha(c.gold, 0.4)}, transparent)` }} />

      <div className="px-4 sm:px-8 py-6 sm:py-8">{children}</div>
    </section>
  );
}

function Field({ label, children, hint, required, c, error, htmlFor }: { label: string; children: React.ReactNode; hint?: string; required?: boolean; c: Palette; error?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap mb-2">
        <span className="font-bold leading-none" style={{ color: withAlpha(c.text, 0.82), fontSize: 13, letterSpacing: '0.005em' }}>
          {label}
        </span>
        {required && (
          <span className="font-bold uppercase leading-none tracking-[0.12em]" style={{ color: UI_ALERT, fontSize: 10 }}>
            Required
          </span>
        )}
        {hint && (
          <span className="font-medium leading-none" style={{ color: withAlpha(c.text, 0.45), fontSize: 12 }}>
            {hint}
          </span>
        )}
      </span>
      {children}
      {error && (
        <span role="alert" className="flex items-start gap-1.5 mt-1.5 font-semibold leading-snug" style={{ color: UI_ALERT, fontSize: 12 }}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
          {error}
        </span>
      )}
    </label>
  );
}

function Input({ c, className = '', fieldSize = 'md', invalid, style, onFocus, onBlur, onMouseEnter, onMouseLeave, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { c: Palette; fieldSize?: ControlSize; invalid?: boolean }) {
  const ch = useControlChrome(c, { invalid, size: fieldSize });
  return (
    <input
      {...props}
      aria-invalid={invalid ? true : undefined}
      className={`${hasWidthClass(className) ? '' : 'w-full'} px-4 py-2.5 rounded-xl font-medium outline-none ${className}`}
      style={{ ...ch.style, ...style }}
      onFocus={e => { ch.on.focus(); onFocus?.(e); }}
      onBlur={e => { ch.on.blur(); onBlur?.(e); }}
      onMouseEnter={e => { ch.on.enter(); onMouseEnter?.(e); }}
      onMouseLeave={e => { ch.on.leave(); onMouseLeave?.(e); }}
    />
  );
}

function Textarea({ c, className = '', fieldSize = 'md', invalid, style, onFocus, onBlur, onMouseEnter, onMouseLeave, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { c: Palette; fieldSize?: ControlSize; invalid?: boolean }) {
  const ch = useControlChrome(c, { invalid, size: fieldSize });
  return (
    <textarea
      {...props}
      aria-invalid={invalid ? true : undefined}
      className={`${hasWidthClass(className) ? '' : 'w-full'} px-4 py-3 rounded-xl font-medium outline-none resize-none ${className}`}
      style={{ ...ch.style, lineHeight: 1.5, ...style }}
      onFocus={e => { ch.on.focus(); onFocus?.(e); }}
      onBlur={e => { ch.on.blur(); onBlur?.(e); }}
      onMouseEnter={e => { ch.on.enter(); onMouseEnter?.(e); }}
      onMouseLeave={e => { ch.on.leave(); onMouseLeave?.(e); }}
    />
  );
}

function Select({ c, children, className = '', fieldSize = 'md', invalid, style, onFocus, onBlur, onMouseEnter, onMouseLeave, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { c: Palette; fieldSize?: ControlSize; invalid?: boolean }) {
  const ch = useControlChrome(c, { invalid, size: fieldSize });
  const chevron = ch.focused ? c.gold : withAlpha(c.gold, 0.75);
  return (
    <select
      {...props}
      aria-invalid={invalid ? true : undefined}
      className={`${hasWidthClass(className) ? '' : 'w-full'} px-4 py-2.5 rounded-xl font-medium outline-none appearance-none cursor-pointer ${className}`}
      style={{
        ...ch.style,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(chevron)}' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.9rem center',
        paddingRight: '2.4rem',
        ...style,
      }}
      onFocus={e => { ch.on.focus(); onFocus?.(e); }}
      onBlur={e => { ch.on.blur(); onBlur?.(e); }}
      onMouseEnter={e => { ch.on.enter(); onMouseEnter?.(e); }}
      onMouseLeave={e => { ch.on.leave(); onMouseLeave?.(e); }}
    >
      {children}
    </select>
  );
}

/* Salutation + Name row */
function SalutNameField({ label, salValue, salPath, nameValue, namePath, namePlaceholder, required, update, c }: { label: string; salValue: string; salPath: string; nameValue: string; namePath: string; namePlaceholder?: string; required?: boolean; update: (path: string, value: unknown) => void; c: Palette }) {
  return (
    <Field label={label} required={required} c={c}>
      {/* Wraps the name under the title on the narrowest phones rather than
          squeezing it until a parent's name no longer fits. */}
      <div className="flex flex-wrap gap-2">
        <Select
          c={c}
          aria-label={`${label} — title`}
          value={salValue}
          onChange={e => update(salPath, e.target.value)}
          className="w-[118px] shrink-0"
          style={{
            // `backgroundColor`, not `background` — see useControlChrome.
            backgroundColor: withAlpha(c.gold, 0.12),
            border: `1.5px solid ${withAlpha(c.gold, 0.42)}`,
            color: c.gold,
            fontWeight: 700,
            paddingLeft: '0.85rem',
            paddingRight: '2.1rem',
          }}
        >
          <option value="">—</option>
          {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input
          c={c}
          className="flex-1 min-w-[8.5rem]"
          aria-label={label}
          value={nameValue}
          onChange={e => update(namePath, e.target.value)}
          placeholder={namePlaceholder}
        />
      </div>
    </Field>
  );
}

/* dd/mm/yyyy date field.
   A native <input type="date"> draws its value in the browser's regional
   format — mm/dd/yyyy on a US-locale machine — and no attribute changes that.
   So the visible field is text that always reads dd/mm/yyyy, and the calendar
   button opens a hidden native picker, which still carries `min` so past days
   stay greyed out. The stored value stays ISO (YYYY-MM-DD). */
function isoToDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** "17/10/2026" → "2026-10-17", or null unless it is a real calendar date. */
function dmyToIso(dmy: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;   // 31/02
  return toISODate(date);
}

function DateField({ value, onChange, min, invalid, c }: { value: string; onChange: (iso: string) => void; min?: string; invalid?: boolean; c: Palette }) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(isoToDmy(value));
  // Follow changes made elsewhere (the picker, loading a sample) — typing a
  // half-finished date never changes `value`, so it isn't clobbered here.
  useEffect(() => { setText(isoToDmy(value)); }, [value]);

  const type = (raw: string) => {
    // Typed digits get their slashes put in for them: "17102026" → "17/10/2026".
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const next = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
    setText(next);
    if (!next) onChange('');
    const iso = dmyToIso(next);
    if (iso) onChange(iso);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }   // Safari < 16 has no showPicker
  };

  return (
    <div className="relative">
      <Input c={c} value={text} invalid={invalid} inputMode="numeric" placeholder="dd/mm/yyyy" maxLength={10}
        aria-label="Date (day/month/year)" className="w-full pr-12"
        onChange={e => type(e.target.value)}
        // A half-typed or impossible date (31/02) goes back to the saved one.
        onBlur={() => setText(isoToDmy(value))} />
      <button type="button" onClick={openPicker} aria-label="Pick a date from the calendar"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg transition-opacity hover:opacity-75 focus-visible:outline-2"
        style={{ color: c.gold, outlineColor: c.gold }}>
        <Calendar className="w-4 h-4" />
      </button>
      {/* Rendered, not display:none, so showPicker() works and the popup
          anchors to the field; invisible and out of the tab order. */}
      <input ref={pickerRef} type="date" min={min} value={value} tabIndex={-1} aria-hidden="true"
        onChange={e => onChange(e.target.value)}
        className="absolute right-0 bottom-0 w-px h-px opacity-0 pointer-events-none" />
    </div>
  );
}

/* 12-hour time picker */
function TimePicker({ hour, minute, ampm, onChange, c }: { hour: string; minute: string; ampm: 'AM' | 'PM'; onChange: (h: string, m: string, ap: 'AM' | 'PM') => void; c: Palette }) {
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const mins = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Select
          c={c}
          aria-label="Hour"
          value={hour}
          onChange={e => onChange(e.target.value, minute, ampm)}
          className="!w-[86px]"
          style={{ paddingLeft: '0.85rem', paddingRight: '1.9rem', backgroundPosition: 'right 0.55rem center', fontVariantNumeric: 'tabular-nums' }}
        >
          {hours.map(h => <option key={h}>{h}</option>)}
        </Select>
        <span aria-hidden className="font-bold text-lg leading-none select-none" style={{ color: withAlpha(c.gold, 0.85) }}>:</span>
        <Select
          c={c}
          aria-label="Minutes"
          value={minute}
          onChange={e => onChange(hour, e.target.value, ampm)}
          className="!w-[86px]"
          style={{ paddingLeft: '0.85rem', paddingRight: '1.9rem', backgroundPosition: 'right 0.55rem center', fontVariantNumeric: 'tabular-nums' }}
        >
          {mins.map(m => <option key={m}>{m}</option>)}
        </Select>
      </div>

      <div
        role="group"
        aria-label="AM or PM"
        className="flex rounded-xl overflow-hidden"
        style={{ border: `1.5px solid ${c.border}`, background: withAlpha(c.ink, 0.04) }}
      >
        {(['AM', 'PM'] as const).map(ap => {
          const on = ampm === ap;
          return (
            <button
              key={ap}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(hour, minute, ap)}
              className="px-4 text-sm font-bold transition-colors duration-200"
              style={{
                minHeight: 45,
                minWidth: 58,
                background: on ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                color: on ? c.onAccent : withAlpha(c.text, 0.6),
              }}
            >
              {ap}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step 0: Family ─────────────────────────────────────────────────────── */
/* ─── Atelier step primitives ────────────────────────────────────────────── */
function AtelierRule({ c, className = '' }: { c: Palette; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden="true">
      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${c.gold}55)` }} />
      <span className="w-1 h-1 rotate-45" style={{ background: c.gold, opacity: 0.75 }} />
      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${c.gold}55, transparent)` }} />
    </div>
  );
}

function GroupHeading({ label, note, c, className = '' }: { label: string; note?: string; c: Palette; className?: string }) {
  return (
    <div className={`flex items-center gap-3 mb-4 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.3em] shrink-0" style={{ color: c.gold }}>{label}</span>
      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${c.gold}40, transparent)` }} />
      {note && <span className="text-[11px] font-medium shrink-0 tabular-nums" style={{ color: c.subtext }}>{note}</span>}
    </div>
  );
}

function FilterChip({ label, count, active, onClick, c }: { label: string; count?: number; active: boolean; onClick: () => void; c: Palette }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-[11px] font-bold uppercase tracking-[0.16em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}18` : 'transparent', color: active ? c.goldDeep : c.subtext, outlineColor: c.gold }}>
      {label}
      {typeof count === 'number' && <span className="text-[10px] font-bold opacity-55 tabular-nums">{count}</span>}
    </button>
  );
}

function Disclosure({ label, hint, defaultOpen = false, c, children }: { label: string; hint?: string; defaultOpen?: boolean; c: Palette; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: c.border, background: `${c.gold}07` }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full min-h-[46px] flex items-center gap-2 px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: c.gold }}>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform duration-300" strokeWidth={2.5} style={{ color: c.gold, transform: open ? 'rotate(90deg)' : 'none' }} />
        <span className="text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: c.subtext }}>{label}</span>
        {hint && !open && <span className="ml-auto text-[11px] font-medium truncate" style={{ color: c.subtext, opacity: 0.7 }}>{hint}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }} style={{ overflow: 'hidden' }}>
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OptionRow({ active, onClick, c, children, disabled }: { active: boolean; onClick: () => void; c: Palette; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} disabled={disabled}
      className="w-full flex items-start gap-3 p-4 rounded-2xl border text-left transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}12` : 'transparent', outlineColor: c.gold }}>
      <span className="mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors duration-300"
        style={{ borderColor: active ? c.gold : c.border, background: active ? c.gold : 'transparent' }}>
        {active && <Check className="w-3 h-3" strokeWidth={3.5} style={{ color: c.onAccent }} />}
      </span>
      <span className="flex-1 min-w-0">{children}</span>
    </button>
  );
}

/* ─── Card language ──────────────────────────────────────────────────────── */
/** The card's language, shown by each language's own name. Switching also
 *  swaps any font that can't set the new script (see withLanguage). */
function LanguagePicker({ form, setForm, c, note }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette; note?: string }) {
  const current = langOf(form);
  return (
    <div>
      <GroupHeading label="Card language" note={current.code === 'en' ? 'English' : `${current.name} · ${current.native}`} c={c} />
      <div role="radiogroup" aria-label="Card language" className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-5 gap-2">
        {CARD_LANGUAGES.map(l => {
          const on = current.code === l.code;
          return (
            <button key={l.code} type="button" role="radio" aria-checked={on}
              onClick={() => { if (!on) setForm(prev => withLanguage(prev, l.code)); }}
              className="min-w-0 min-h-[60px] px-1 py-2 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ borderColor: on ? c.gold : c.border, background: on ? `linear-gradient(160deg, ${c.gold}22, ${c.primary}12)` : 'transparent', outlineColor: c.gold }}>
              <span lang={l.code} className="leading-tight truncate max-w-full"
                style={{ fontFamily: `${l.code === 'en' ? "'Playfair Display'" : l.defaultFonts.heading}, serif`, fontSize: '1rem', color: on ? c.goldDeep : c.text }}>
                {l.native}
              </span>
              {l.code !== 'en' && (
                <span className="text-[9px] font-bold uppercase tracking-[0.16em] leading-none" style={{ color: on ? c.gold : c.subtext }}>{l.name}</span>
              )}
            </button>
          );
        })}
      </div>
      {note && <p className="text-[11px] font-medium mt-2.5 leading-snug" style={{ color: c.subtext }}>{note}</p>}
    </div>
  );
}

/** Every printed value the customer typed, in the card's script: suggested by
 *  transliteration (useScriptSuggestions), and editable. `onlyMissing` lists
 *  just the ones with no script version yet — the reminder on later steps. */
function ScriptTextEditor({ form, script, c, onlyMissing = false }: { form: FormState; script: ScriptSuggestions; c: Palette; onlyMissing?: boolean }) {
  const lang = langOf(form);
  const all = scriptFields(form);
  const fields = onlyMissing ? all.filter(f => !scriptValue(form, f.path).trim()) : all;
  // A face that certainly carries the script, whatever the card's own fonts are.
  const inputFont = fontHasScript(form.design.bodyFont, lang.script) ? form.design.bodyFont : lang.defaultFonts.body;

  if (!all.length) {
    return (
      <p className="text-[12px] font-medium rounded-2xl border border-dashed px-4 py-4 text-center" style={{ color: c.subtext, borderColor: c.border }}>
        Names appear here in {lang.native} as you type them above.
      </p>
    );
  }
  if (!fields.length) return null;

  const groups: { name: string; items: ScriptField[] }[] = [];
  for (const f of fields) {
    const g = groups.find(x => x.name === f.group);
    if (g) g.items.push(f); else groups.push({ name: f.group, items: [f] });
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {groups.map(g => (
        <div key={g.name} className="min-w-0 rounded-2xl border p-3.5 sm:p-4" style={{ borderColor: c.border, background: `${c.gold}06` }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] mb-3 truncate" style={{ color: c.gold }}>{g.name}</div>
          <div className="grid grid-cols-1 gap-3.5">
            {g.items.map(f => {
              const val = scriptValue(form, f.path);
              const auto = form.scriptAuto?.[lang.code]?.[f.path];
              const st = script.statusOf(f.path);
              const edited = !!val.trim() && !!auto && val !== auto.out;
              const props = {
                c, lang: lang.code, value: val, placeholder: f.english,
                'aria-label': `${g.name} — ${f.label} in ${lang.name}`,
                style: { fontFamily: inputFont },
              };
              return (
                <div key={f.path} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3 mb-1.5 min-w-0">
                    <span className="text-[12px] font-bold shrink-0" style={{ color: withAlpha(c.text, 0.82) }}>{f.label}</span>
                    <span className="text-[11px] font-medium truncate min-w-0" style={{ color: c.subtext }} title={f.english}>{f.english}</span>
                  </div>
                  {f.multiline
                    ? <Textarea {...props} rows={2} onChange={e => script.setValue(f.path, e.target.value)} />
                    : <Input {...props} onChange={e => script.setValue(f.path, e.target.value)} />}
                  {st === 'pending' && !val && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-medium" style={{ color: c.subtext }}>
                      <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Converting to {lang.native}…
                    </div>
                  )}
                  {st === 'failed' && !val && (
                    <div role="status" className="flex items-start gap-1.5 mt-1.5 text-[11px] font-semibold leading-snug" style={{ color: UI_WARN }}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
                      <span>Couldn’t convert this automatically — type it in {lang.native} yourself. Until then it prints in English.</span>
                    </div>
                  )}
                  {edited && (
                    <div className="flex items-center flex-wrap gap-x-2 mt-1.5 text-[11px] font-medium" style={{ color: c.subtext }}>
                      <span>{auto && auto.src !== f.english ? 'The English changed since your edit — check this.' : 'Your own spelling.'}</span>
                      <button type="button" onClick={() => script.resuggest(f.path)}
                        className="font-bold underline underline-offset-2 min-h-[32px] focus-visible:outline-2" style={{ color: c.gold, outlineColor: c.gold }}>
                        Suggest again
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Step 0: Family ─────────────────────────────────────────────────────── */
function StepFamily({ form, update, setForm, c, dark, script }: { form: FormState; update: (path: string, value: unknown) => void; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette; dark: boolean; script: ScriptSuggestions }) {
  const lang = langOf(form);
  const bothNamed = !!(form.bride.name.trim() && form.groom.name.trim());
  // As they print, so a Marathi card previews its Marathi names here.
  const aboveName = scriptText(form, `${form.aboveWeds}.name`, form.aboveWeds === 'bride' ? form.bride.name : form.groom.name);
  const belowSide = form.aboveWeds === 'bride' ? 'groom' : 'bride';
  const belowName = scriptText(form, `${belowSide}.name`, form[belowSide].name);
  const abovePh = form.aboveWeds === 'bride' ? 'Bride' : 'Groom';
  const belowPh = form.aboveWeds === 'bride' ? 'Groom' : 'Bride';
  const relation = relationText(form);
  const hosts = [
    { id: 'parents', label: 'Parents', emoji: '👨‍👩‍👧' },
    { id: 'grandparents', label: 'Grandparents', emoji: '👴👵' },
    { id: 'siblings', label: 'Siblings', emoji: '👫' },
    { id: 'self', label: 'The Couple', emoji: '💑' },
  ];
  const hasFamilyDetails = !!(form.family.title || form.family.nativePlace || form.family.residenceAddress);

  return (
    <Section title="The Two Families" eyebrow="Step 1 of 8"
      subtitle="Only the two names are required — everything else is optional."
      c={c} icon={Heart}>

      <div className="mb-8">
        <LanguagePicker form={form} setForm={setForm} c={c}
          note={lang.code === 'en'
            ? 'Every word on the card prints in this language. Type names in English either way.'
            : `Type in English as usual — the whole card prints in ${lang.native}, and your names are converted for you below.`} />
      </div>

      <AnimatePresence initial={false}>
        {bothNamed && (
          <motion.div key="couple" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-7 px-5 py-5 rounded-2xl border text-center overflow-hidden"
            style={{ borderColor: `${c.gold}4D`, background: `linear-gradient(165deg, ${c.gold}12, transparent 70%)` }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] mb-1.5" style={{ color: c.gold }}>Your Couple</div>
            <div className="leading-tight break-words" style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", color: c.primary, fontSize: '2.4rem' }}>
              {form.bride.name} & {form.groom.name}
            </div>
            <AtelierRule c={c} className="mt-3 max-w-[190px] mx-auto" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Names */}
      {/* Stacked, not side by side: the form column is already only half the
          width (the card owns the other half), so two person cards next to
          each other squeezed every name field to ~160px and clipped the
          placeholders. Full width gives the fields room to actually be read. */}
      <GroupHeading label="Names on the card" note="Required" c={c} />
      <div className="grid grid-cols-1 gap-4">
        <PersonCard side="Bride" person={form.bride} update={update} prefix="bride" c={c} />
        <PersonCard side="Groom" person={form.groom} update={update} prefix="groom" c={c} />
      </div>

      {lang.code !== 'en' && (
        <div className="mt-8">
          <GroupHeading label={`Names in ${lang.name}`} note={lang.native} c={c} />
          <p className="text-[12px] font-medium mb-4 leading-snug" style={{ color: c.subtext }}>
            Converted from your English as you type. Check each spelling and correct it if needed — your corrections are kept.
          </p>
          <ScriptTextEditor form={form} script={script} c={c} />
        </div>
      )}

      {/* Order on the card */}
      <div className="mt-8">
        <GroupHeading label="Order on the card" c={c} />
        <div className="rounded-2xl border p-5" style={{ borderColor: c.border, background: `${c.gold}07` }}>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0 text-center">
              <div className="truncate leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1.45rem', color: aboveName ? c.text : c.subtext }}>
                {aboveName || abovePh}
              </div>
              <div className="leading-none my-0.5" style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: '1.7rem', color: c.gold }}>{relation}</div>
              <div className="truncate leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1.45rem', color: belowName ? c.text : c.subtext }}>
                {belowName || belowPh}
              </div>
            </div>
            <button type="button" onClick={() => update('aboveWeds', form.aboveWeds === 'bride' ? 'groom' : 'bride')}
              className="shrink-0 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border text-[11px] font-bold uppercase tracking-[0.16em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ borderColor: `${c.gold}66`, background: `${c.gold}12`, color: c.goldDeep, outlineColor: c.gold }}>
              <ArrowLeftRight className="w-3.5 h-3.5" strokeWidth={2.5} /> Swap
            </button>
          </div>
          <div className="text-[11px] mt-3 pt-3 font-medium text-center" style={{ color: c.subtext, borderTop: `1px solid ${c.border}` }}>
            {form.aboveWeds === 'bride' ? "The bride's name is printed above." : "The groom's name is printed above."}
          </div>
        </div>
      </div>

      {/* Who is inviting */}
      <div className="mt-8">
        <GroupHeading label="Who is inviting" note="Optional" c={c} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {hosts.map(h => {
            const active = form.hostType === h.id;
            return (
              <button key={h.id} type="button" onClick={() => update('hostType', h.id)} aria-pressed={active}
                className="min-h-[76px] px-2 py-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}14` : 'transparent', color: active ? c.goldDeep : c.text, outlineColor: c.gold }}>
                <span className="text-lg leading-none" aria-hidden="true">{h.emoji}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-center leading-tight">{h.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional family details */}
      <div className="mt-8">
        <GroupHeading label="Family details" note="Optional" c={c} />
        <Disclosure label="Title, native place & residence" hint={hasFamilyDetails ? 'Filled' : 'Not added'} defaultOpen={hasFamilyDetails} c={c}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <Field label="Family Title" hint="e.g. Parivaar" c={c}>
              <Input c={c} value={form.family.title} onChange={e => update('family.title', e.target.value)} placeholder="Parivaar" />
            </Field>
            <Field label="Native Place" c={c}>
              <Input c={c} value={form.family.nativePlace} onChange={e => update('family.nativePlace', e.target.value)} placeholder="Jaipur, Rajasthan" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Residence Address" c={c}>
                <Input c={c} value={form.family.residenceAddress} onChange={e => update('family.residenceAddress', e.target.value)} placeholder="House No, Street, City" />
              </Field>
            </div>
          </div>
        </Disclosure>
      </div>
    </Section>
  );
}

function PersonCard({ side, person, update, prefix, c }: { side: string; person: PersonInfo; update: (path: string, value: unknown) => void; prefix: string; c: Palette }) {
  const isBride = side === 'Bride';
  const tone = isBride ? c.primary : c.goldDeep;
  const rel = isBride ? 'D/o' : 'S/o';
  const gpFilled = !!(person.grandfatherName || person.grandmotherName);
  const gpHint = gpFilled ? [person.grandfatherName, person.grandmotherName].filter(Boolean).join(' & ') : 'Not added';

  return (
    <div className="@container rounded-2xl border overflow-hidden" style={{ borderColor: c.border, background: `linear-gradient(180deg, ${tone}0A, transparent 55%)` }}>
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${tone}, ${c.gold}66, transparent)` }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base leading-none" aria-hidden="true">{isBride ? '👰' : '🤵'}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: tone }}>{side}</span>
          <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${c.gold}40, transparent)` }} />
        </div>

        <div className="space-y-3.5">
          <Field label={`${side}'s Name`} required c={c}>
            <Input c={c} value={person.name} onChange={e => update(`${prefix}.name`, e.target.value)} placeholder={isBride ? 'Aditi Sharma' : 'Rohan Mehta'} />
          </Field>

          <SalutNameField label={`Father's Name · ${rel}`} salValue={person.fatherPrefix} salPath={`${prefix}.fatherPrefix`}
            nameValue={person.fatherName} namePath={`${prefix}.fatherName`}
            namePlaceholder={isBride ? 'Rajesh Sharma' : 'Mahesh Mehta'} update={update} c={c} />

          <SalutNameField label="Mother's Name" salValue={person.motherPrefix} salPath={`${prefix}.motherPrefix`}
            nameValue={person.motherName} namePath={`${prefix}.motherName`}
            namePlaceholder={isBride ? 'Sunita Sharma' : 'Kavita Mehta'} update={update} c={c} />

          <Disclosure label="Grandparents" hint={gpHint} defaultOpen={gpFilled} c={c}>
            <div className="space-y-3 pt-1">
              <SalutNameField label="Grandfather's Name" salValue={person.grandfatherPrefix} salPath={`${prefix}.grandfatherPrefix`}
                nameValue={person.grandfatherName} namePath={`${prefix}.grandfatherName`} namePlaceholder="Full Name" update={update} c={c} />
              <SalutNameField label="Grandmother's Name" salValue={person.grandmotherPrefix} salPath={`${prefix}.grandmotherPrefix`}
                nameValue={person.grandmotherName} namePath={`${prefix}.grandmotherName`} namePlaceholder="Full Name" update={update} c={c} />
            </div>
          </Disclosure>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 1: Deities ────────────────────────────────────────────────────── */
function StepDeities({ form, setForm, c }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette }) {
  const toggle = (id: string) => setForm(prev => ({ ...prev, deities: prev.deities.includes(id) ? prev.deities.filter(d => d !== id) : [...prev.deities, id] }));
  const clearAll = () => setForm(prev => ({ ...prev, deities: [] }));
  const chosen = form.deities
    .map(id => DEITIES.find(d => d.id === id))
    .filter((d): d is (typeof DEITIES)[number] => !!d);
  const leadMantra = chosen[0]?.mantra;

  return (
    <Section title="Deities & Blessings" eyebrow="Step 2 of 8"
      subtitle="Tap to add. They print across the top of your card, in the order you tap them."
      c={c} icon={Star}>

      {/* What will appear on the card */}
      <div className="mb-7 rounded-2xl p-4" style={{ border: `1px dashed ${c.gold}66`, background: `${c.gold}0A` }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] shrink-0" style={{ color: c.gold }}>Top of your card</span>
          <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${c.gold}40, transparent)` }} />
          {chosen.length > 0 && (
            <button type="button" onClick={clearAll}
              className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] min-h-[44px] px-2 rounded-lg transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: c.subtext, outlineColor: c.gold }}>Clear all</button>
          )}
        </div>

        {chosen.length === 0 ? (
          <p className="text-center text-[13px] font-medium py-3" style={{ color: c.subtext }}>
            Nothing chosen yet — tap a blessing below to begin.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <AnimatePresence initial={false}>
                {chosen.map((d, i) => (
                  <motion.button key={d.id} layout type="button" onClick={() => toggle(d.id)}
                    initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    aria-label={`Remove ${d.name}`} title={`Remove ${d.name}`}
                    className="relative w-11 h-11 rounded-xl flex items-center justify-center text-xl focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ background: `${c.gold}1A`, border: `1px solid ${c.gold}59`, outlineColor: c.gold }}>
                    <span aria-hidden="true"><DeityGlyph glyph={d.glyph} /></span>
                    <span className="absolute -top-1.5 -left-1.5 w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums"
                      style={{ background: c.gold, color: c.onAccent }}>{i + 1}</span>
                    <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center"
                      style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                      <X className="w-2.5 h-2.5" strokeWidth={3} style={{ color: c.subtext }} />
                    </span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
            {leadMantra && (
              <div className="text-center text-[13px] font-semibold mt-4 pt-3" style={{ color: c.primary, borderTop: `1px solid ${c.border}` }}>
                {leadMantra}
              </div>
            )}
          </>
        )}
      </div>

      <GroupHeading label="Choose blessings" note={`${form.deities.length} of ${DEITIES.length}`} c={c} />
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {DEITIES.map(d => {
          const order = form.deities.indexOf(d.id);
          const active = order >= 0;
          return (
            <motion.button key={d.id} type="button" onClick={() => toggle(d.id)} aria-pressed={active}
              whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative min-h-[104px] rounded-2xl border flex flex-col items-center justify-center gap-2 p-3 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: active ? c.gold : c.border,
                background: active ? `linear-gradient(160deg, ${c.gold}1F, ${c.primary}12)` : 'transparent',
                boxShadow: active ? `0 12px 26px -18px ${c.goldDeep}` : 'none',
                outlineColor: c.gold,
              }}>
              <span className="text-[26px] leading-none" aria-hidden="true"><DeityGlyph glyph={d.glyph} /></span>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-center leading-tight" style={{ color: active ? c.goldDeep : c.subtext }}>{d.name}</span>
              {active && (
                <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="absolute top-2 right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums"
                  style={{ background: c.gold, color: c.onAccent }}>{order + 1}</motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      <p className="text-[12px] font-medium text-center mt-5" style={{ color: c.subtext }}>
        Tap a chosen one again to remove it. The first one’s mantra is printed under the row.
      </p>
    </Section>
  );
}

/* ─── Step 2: Invitation Text ────────────────────────────────────────────── */
function StepInvitation({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const cats = ['All', ...Array.from(new Set(INVITATION_TEMPLATES.map(t => t.category)))];
  const lang = langOf(form);
  const T = cardStrings(form);
  const translated = lang.code !== 'en';
  const q = search.trim().toLowerCase();
  const filtered = INVITATION_TEMPLATES.filter(t =>
    (cat === 'All' || t.category === cat) &&
    (!q || t.preview.toLowerCase().includes(q) || t.text.toLowerCase().includes(q) || (T.templates[t.id] ?? '').toLowerCase().includes(q))
  );
  const countFor = (ct: string) => ct === 'All' ? INVITATION_TEMPLATES.length : INVITATION_TEMPLATES.filter(t => t.category === ct).length;
  const aboveSide = form.aboveWeds, belowSide = form.aboveWeds === 'bride' ? 'groom' : 'bride';
  const aboveName = scriptText(form, `${aboveSide}.name`, form[aboveSide].name) || (aboveSide === 'bride' ? 'Bride' : 'Groom');
  const belowName = scriptText(form, `${belowSide}.name`, form[belowSide].name) || (belowSide === 'bride' ? 'Bride' : 'Groom');
  const relation = relationText(form);
  // The English, small under a translated choice, so the studio can follow it.
  const englishFill = (text: string) => text.replace(/\{bride\}/g, form.bride.name || '').replace(/\{groom\}/g, form.groom.name || '');

  return (
    <>
      <Section title="Invitation Text" eyebrow="Step 3 of 8"
        subtitle="Ready-written paragraphs — nothing to type. Tap the one that sounds like you."
        c={c} icon={BookOpen}>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {cats.map(ct => (
            <FilterChip key={ct} label={ct} count={countFor(ct)} active={cat === ct} onClick={() => setCat(ct)} c={c} />
          ))}
        </div>

        {/* Search */}
        <div className="relative mt-3 mb-4">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ color: c.gold, opacity: 0.6 }} />
          <Input c={c} className="pl-11" placeholder="Search the wording…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search invitation texts" />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 px-6 rounded-2xl border border-dashed" style={{ borderColor: c.border }}>
            <div className="text-[13px] font-semibold" style={{ color: c.text }}>Nothing matches that</div>
            <button type="button" onClick={() => { setSearch(''); setCat('All'); }}
              className="mt-3 min-h-[44px] px-5 rounded-full border text-[11px] font-bold uppercase tracking-[0.16em] focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ borderColor: c.border, color: c.goldDeep, background: `${c.gold}12`, outlineColor: c.gold }}>Show all texts</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 max-h-[540px] overflow-y-auto pr-1 -mr-1" style={{ scrollbarWidth: 'thin' }}>
            {filtered.map(t => {
              const active = form.selectedTemplate === t.id;
              return (
                <motion.button key={t.id} type="button" layout onClick={() => update('selectedTemplate', t.id)} aria-pressed={active}
                  whileTap={{ scale: 0.995 }} transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="relative text-left rounded-2xl border overflow-hidden transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: active ? c.gold : c.border,
                    background: active ? `linear-gradient(160deg, ${c.gold}12, transparent 65%)` : 'transparent',
                    boxShadow: active ? `0 14px 32px -22px ${c.goldDeep}` : 'none',
                    outlineColor: c.gold,
                  }}>
                  <span className="absolute left-0 top-0 bottom-0 w-[3px]" aria-hidden="true"
                    style={{ background: active ? `linear-gradient(180deg, ${c.primary}, ${c.gold})` : 'transparent' }} />
                  <div className="p-5 pl-6">
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.26em] shrink-0" style={{ color: active ? c.goldDeep : c.subtext }}>{t.category}</span>
                      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${c.gold}35, transparent)` }} />
                      {active ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full" style={{ background: c.gold, color: c.onAccent }}>
                          <Check className="w-3 h-3" strokeWidth={3} /> Selected
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: c.subtext, opacity: 0.55 }}>Tap to choose</span>
                      )}
                    </div>

                    <p className="whitespace-pre-line" lang={lang.code}
                      style={{ fontFamily: form.design.bodyFont, fontSize: '0.95rem', lineHeight: 1.7, color: c.text, opacity: 0.9, fontStyle: translated ? 'normal' : 'italic' }}>
                      {fillTemplate(T.templates[t.id] ?? t.text, form)}
                    </p>
                    {translated && (
                      <p lang="en" className="whitespace-pre-line mt-2 text-[11px] leading-snug font-medium" style={{ color: c.subtext }}>
                        {englishFill(t.text)}
                      </p>
                    )}

                    <div lang={lang.code} className="mt-4 pt-3 text-center" style={{ borderTop: `1px solid ${c.border}` }}>
                      <div className="truncate leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1.1rem', color: c.text }}>{aboveName}</div>
                      <div className="leading-none" style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: '1.4rem', color: c.gold }}>{relation}</div>
                      <div className="truncate leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1.1rem', color: c.text }}>{belowName}</div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        <div className="text-[11px] font-medium text-center mt-4" style={{ color: c.subtext }}>
          Showing {filtered.length} of {INVITATION_TEMPLATES.length} texts · your names are shown exactly as they will print.
        </div>
      </Section>

      <div className="mt-5">
        <Section title="Relation Word" eyebrow="Between the names" subtitle="The word printed between the two names." c={c} icon={Heart}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {RELATION_WORDS.map(r => {
              const active = form.relationWord === r.id;
              return (
                <motion.button key={r.id} type="button" onClick={() => update('relationWord', r.id)} aria-pressed={active}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="min-h-[60px] px-2 rounded-2xl border flex items-center justify-center text-center transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: active ? c.gold : c.border,
                    background: active ? `${c.gold}14` : 'transparent',
                    color: active ? c.goldDeep : c.text,
                    fontFamily: form.design.scriptFont || "'Tangerine', cursive",
                    fontSize: '1.5rem',
                    lineHeight: 1,
                    outlineColor: c.gold,
                  }}>
                  {translated ? (
                    <span className="flex flex-col items-center gap-1 py-1.5 min-w-0">
                      <span lang={lang.code}>{T.relationWords[r.id] ?? r.label}</span>
                      <span lang="en" className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: 'Inter, sans-serif', color: c.subtext }}>{r.label}</span>
                    </span>
                  ) : r.label}
                </motion.button>
              );
            })}
          </div>
        </Section>
      </div>
    </>
  );
}

/* ─── Step 3: Programmes ─────────────────────────────────────────────────── */
/* ─── Step 3: Programmes ─────────────────────────────────────────────────── */
const COMMON_PROGRAMMES = ['wedding', 'reception', 'mehendi', 'haldi', 'ladiessangeet', 'engagement'];

function fmtProgDate(d: string) {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function StepProgrammes({ form, setForm, c }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette }) {
  const [open, setOpen] = useState<number[]>(() => {
    // A restored draft can hold a date that has since passed. Those panels open
    // too, so the customer can see the error instead of being blocked by one
    // hidden inside a collapsed row.
    const needsWork = form.programmes.filter(p => !p.date || isPastDate(p.date)).map(p => p.id);
    return needsWork.length ? needsWork : form.programmes.slice(0, 1).map(p => p.id);
  });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [showAllPresets, setShowAllPresets] = useState(false);

  const toggleOpen = (id: number) => setOpen(o => o.includes(id) ? o.filter(x => x !== id) : [...o, id]);

  const addProg = (preset: string) => {
    const created = emptyProgramme(preset);
    setForm(prev => ({ ...prev, programmes: [...prev.programmes, created] }));
    setOpen(o => [...o, created.id]);
  };
  const removeProg = (id: number) => {
    setForm(prev => ({ ...prev, programmes: prev.programmes.filter(f => f.id !== id) }));
    setConfirmId(null);
  };
  const updateProg = (id: number, key: keyof Programme, val: string) =>
    setForm(prev => ({ ...prev, programmes: prev.programmes.map(f => f.id === id ? { ...f, [key]: val } : f) }));
  const move = (id: number, dir: number) => {
    const idx = form.programmes.findIndex(f => f.id === id);
    const tgt = idx + dir;
    if (tgt < 0 || tgt >= form.programmes.length) return;
    const next = [...form.programmes]; [next[idx], next[tgt]] = [next[tgt], next[idx]];
    setForm(prev => ({ ...prev, programmes: next }));
  };

  const selectable = PROGRAMME_PRESETS.filter(p => p.id !== 'custom');
  const common = COMMON_PROGRAMMES
    .map(id => selectable.find(p => p.id === id))
    .filter((p): p is (typeof PROGRAMME_PRESETS)[number] => !!p);
  const rest = selectable.filter(p => !COMMON_PROGRAMMES.includes(p.id));
  const shownPresets = showAllPresets ? [...common, ...rest] : common;
  const dated = form.programmes.filter(p => p.date).length;

  return (
    <Section title="Functions & Events" eyebrow="Step 4 of 8"
      subtitle="Add each function, then fill in its date, time and venue. Every function needs a date."
      c={c} icon={Calendar}>

      {/* Quick add */}
      <div className="mb-8">
        <GroupHeading label="Add a function" c={c} />
        <div className="flex flex-wrap gap-2">
          {shownPresets.map(p => (
            <motion.button key={p.id} type="button" onClick={() => addProg(p.id)}
              whileTap={{ scale: 0.96 }} transition={{ duration: 0.2, ease: 'easeOut' }}
              className="inline-flex items-center gap-2 min-h-[44px] pl-3 pr-3.5 rounded-full border text-[12px] font-bold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ borderColor: c.border, background: 'transparent', color: c.text, outlineColor: c.gold }}>
              <span className="text-base leading-none" aria-hidden="true">{p.icon}</span>
              {p.name}
              <Plus className="w-3.5 h-3.5" strokeWidth={3} style={{ color: c.gold }} />
            </motion.button>
          ))}
          {!showAllPresets && rest.length > 0 && (
            <button type="button" onClick={() => setShowAllPresets(true)}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border border-dashed text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ borderColor: c.border, color: c.subtext, outlineColor: c.gold }}>
              +{rest.length} more
            </button>
          )}
          <motion.button type="button" onClick={() => addProg('custom')}
            whileTap={{ scale: 0.96 }} transition={{ duration: 0.2, ease: 'easeOut' }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-[12px] font-bold transition-transform focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, color: c.onAccent, outlineColor: c.gold }}>
            <Plus className="w-3.5 h-3.5" strokeWidth={3} /> Custom event
          </motion.button>
        </div>
      </div>

      {/* Timeline */}
      <GroupHeading label="Your timeline" note={form.programmes.length ? `${dated} of ${form.programmes.length} dated` : undefined} c={c} />

      {form.programmes.length === 0 ? (
        <div className="text-center py-12 px-6 rounded-2xl border border-dashed" style={{ borderColor: c.border }}>
          <Calendar className="w-7 h-7 mx-auto mb-3" style={{ color: c.gold, opacity: 0.5 }} />
          <div className="text-[13px] font-semibold" style={{ color: c.text }}>No functions yet</div>
          <div className="text-[12px] mt-1 font-medium" style={{ color: c.subtext }}>Tap a button above to add your first one.</div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {form.programmes.map((f, i) => {
              const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
              const tint = preset?.color || c.gold;
              const opened = open.includes(f.id);
              const past = isPastDate(f.date);
              const summary = !f.date ? 'Date still needed'
                : past ? `${fmtProgDate(f.date)} · this date has already passed`
                : `${fmtProgDate(f.date)} · ${fmtTime(f.hour, f.minute, f.ampm)}${f.venue ? ` · ${f.venue}` : ''}`;
              return (
                <motion.div key={f.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: f.date && !past ? c.border : `${c.accent}66`, background: 'transparent' }}>

                  {/* Header */}
                  <div className="flex items-stretch gap-2.5 p-2.5" style={{ background: `${tint}12` }}>
                    <div className="flex flex-col items-center justify-center shrink-0">
                      <button type="button" onClick={() => move(f.id, -1)} disabled={i === 0} aria-label={`Move ${f.name || 'function'} earlier`}
                        className="w-8 h-7 flex items-center justify-center rounded-md disabled:opacity-20 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: c.gold, outlineColor: c.gold }}>
                        <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.75} />
                      </button>
                      <span className="text-[10px] font-bold tabular-nums leading-none" style={{ color: c.subtext }}>{i + 1}</span>
                      <button type="button" onClick={() => move(f.id, 1)} disabled={i === form.programmes.length - 1} aria-label={`Move ${f.name || 'function'} later`}
                        className="w-8 h-7 flex items-center justify-center rounded-md disabled:opacity-20 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: c.gold, outlineColor: c.gold }}>
                        <ArrowDown className="w-3.5 h-3.5" strokeWidth={2.75} />
                      </button>
                    </div>

                    <div className="w-10 h-10 self-center rounded-xl flex items-center justify-center text-xl shrink-0" aria-hidden="true" style={{ background: `${tint}26` }}>
                      {preset?.icon || '✨'}
                    </div>

                    <div className="flex-1 min-w-0 self-center py-0.5">
                      <input value={f.name} onChange={e => updateProg(f.id, 'name', e.target.value)} placeholder="Function name" aria-label="Function name"
                        className="w-full bg-transparent outline-none min-w-0 rounded-md leading-tight py-1 focus-visible:outline-2 focus-visible:outline-offset-2"
                        // Shrinks a little on narrow phones, then ellipsizes: an input can't wrap,
                        // and the arrows, icon and chevron leave "Wedding Ceremony" ~150px there.
                        style={{ color: c.text, fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.05rem, 4.4vw, 1.25rem)', fontWeight: 600, textOverflow: 'ellipsis', outlineColor: c.gold }} />
                      <div className="text-[11px] font-medium truncate mt-0.5" style={{ color: f.date && !past ? c.subtext : c.accent }}>{summary}</div>
                    </div>

                    <button type="button" onClick={() => toggleOpen(f.id)} aria-expanded={opened}
                      aria-label={opened ? `Hide details for ${f.name || 'function'}` : `Edit details for ${f.name || 'function'}`}
                      className="w-11 h-11 self-center rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ color: c.gold, background: `${c.gold}14`, outlineColor: c.gold }}>
                      <ChevronRight className="w-4 h-4 transition-transform duration-300" strokeWidth={2.5} style={{ transform: opened ? 'rotate(90deg)' : 'none' }} />
                    </button>
                  </div>

                  {/* Details */}
                  <AnimatePresence initial={false}>
                    {opened && (
                      <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }} style={{ overflow: 'hidden' }}>
                        <div className="p-4 pt-4 space-y-4 border-t" style={{ borderColor: c.border }}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Date" required c={c}
                              error={past ? 'That date has already passed. Please pick today or a later date.' : undefined}>
                              <DateField c={c} min={todayISO()} value={f.date} invalid={past}
                                onChange={iso => updateProg(f.id, 'date', iso)} />
                            </Field>
                            <Field label="Time" c={c}>
                              <TimePicker hour={f.hour} minute={f.minute} ampm={f.ampm as 'AM' | 'PM'}
                                onChange={(h, m, ap) => setForm(prev => ({ ...prev, programmes: prev.programmes.map(p => p.id === f.id ? { ...p, hour: h, minute: m, ampm: ap } : p) }))}
                                c={c} />
                            </Field>
                          </div>

                          {f.preset === 'reception' && (
                            <Field label="Meal Type" hint="prints as “from 7:30 PM onwards”" c={c}>
                              <div className="grid grid-cols-3 gap-2">
                                {[{ k: 'none', l: 'None' }, { k: 'dinner', l: '🍽 Dinner' }, { k: 'lunch', l: '🍽 Lunch' }].map(m => {
                                  const on = f.mealType === m.k;
                                  return (
                                    <button key={m.k} type="button" onClick={() => updateProg(f.id, 'mealType', m.k)} aria-pressed={on}
                                      className="min-h-[46px] rounded-xl border text-[13px] font-bold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                                      style={{ borderColor: on ? c.gold : c.border, background: on ? `${c.gold}14` : 'transparent', color: on ? c.goldDeep : c.text, outlineColor: c.gold }}>
                                      {m.l}
                                    </button>
                                  );
                                })}
                              </div>
                            </Field>
                          )}

                          <Field label="Venue Name" c={c}>
                            <Input c={c} value={f.venue} onChange={e => updateProg(f.id, 'venue', e.target.value)} placeholder="e.g. Taj Palace Banquet Hall" />
                          </Field>
                          <Field label="Full Address" c={c}>
                            <Textarea c={c} rows={2} value={f.address} onChange={e => updateProg(f.id, 'address', e.target.value)} placeholder="Street, City, PIN Code" />
                          </Field>
                          <Field label="Note on this function's page" hint="optional · prints only with a separate page per function" c={c}>
                            <Textarea c={c} rows={2} value={f.note || ''} onChange={e => updateProg(f.id, 'note', e.target.value)}
                              placeholder="Dress code: yellow · Lunch to follow · RSVP: Rajesh 98xxxxxx" />
                          </Field>

                          <div className="flex justify-end pt-1">
                            {confirmId === f.id ? (
                              <div className="flex items-center gap-2 flex-wrap justify-end">
                                <span className="text-[12px] font-semibold" style={{ color: c.text }}>Remove this function?</span>
                                <button type="button" onClick={() => setConfirmId(null)}
                                  className="min-h-[44px] px-4 rounded-full border text-[11px] font-bold uppercase tracking-[0.14em] focus-visible:outline-2 focus-visible:outline-offset-2"
                                  style={{ borderColor: c.border, color: c.text, outlineColor: c.gold }}>Keep it</button>
                                <button type="button" onClick={() => removeProg(f.id)}
                                  className="min-h-[44px] px-4 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] focus-visible:outline-2 focus-visible:outline-offset-2"
                                  style={{ background: c.primary, color: c.onAccent, outlineColor: c.gold }}>Remove</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setConfirmId(f.id)}
                                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ color: c.subtext, outlineColor: c.gold }}>
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Page split. Shown even with fewer than two dated functions, just
          disabled, so the option doesn't appear out of nowhere mid-step. */}
      <div className="mt-8">
        <GroupHeading label="Programme pages" c={c} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { k: 'combined', l: 'All on one page', d: 'Every function listed together on page 2.' },
            { k: 'separate', l: 'Separate page for each function', d: 'Each function printed as its own card insert.' },
          ] as const).map(o => (
            // Reflects what will actually print (see separateSheets), not the
            // raw saved choice, which may still say 'separate' from earlier.
            <OptionRow key={o.k} active={(separateSheets(form) ? 'separate' : 'combined') === o.k} disabled={dated < 2}
              onClick={() => setForm(prev => ({ ...prev, design: { ...prev.design, pageMode: o.k } }))} c={c}>
              <span className="block text-[13px] leading-snug font-semibold" style={{ color: c.text }}>{o.l}</span>
              <span className="block text-[11px] leading-snug font-medium mt-1" style={{ color: c.subtext }}>{o.d}</span>
            </OptionRow>
          ))}
        </div>
        {dated < 2 && (
          <p className="text-[11px] font-medium mt-2.5" style={{ color: c.subtext }}>
            This choice opens up once two or more functions have a date.
          </p>
        )}
      </div>
    </Section>
  );
}

/* ─── Step 4: Extras ─────────────────────────────────────────────────────── */
function StepExtras({ form, update, c }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette }) {
  const closing = closingText(form);
  const kids = kidsLineText(form);
  const lang = langOf(form);
  const T = cardStrings(form);
  // A choice's wording as it prints, with the English small beneath on a
  // translated card so the studio can still follow which one is picked.
  const choice = (printed: string, english: string) => (
    <>
      <span lang={lang.code} className="block text-[13px] leading-snug font-semibold" style={{ color: c.text }}>{printed}</span>
      {lang.code !== 'en' && <span lang="en" className="block text-[11px] leading-snug font-medium mt-1" style={{ color: c.subtext }}>{english}</span>}
    </>
  );

  return (
    <>
      <Section title="Closing Line" eyebrow="Step 5A of 8"
        subtitle="The line about blessings and gifts, printed near the bottom of the card."
        c={c} icon={Star}>

        <div className="mb-6 px-5 py-5 rounded-2xl text-center" style={{ border: `1px dashed ${c.gold}66`, background: `${c.gold}0A` }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2" style={{ color: c.gold }}>On your card</div>
          <div lang={lang.code} className="leading-snug" style={{ fontFamily: form.design.headingFont, fontSize: '1.2rem', color: closing ? c.text : c.subtext }}>
            {closing || 'Choose a line below'}
          </div>
        </div>

        <GroupHeading label="Choose one" note={`${CLOSING_TAGS.length} options`} c={c} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CLOSING_TAGS.map(t => (
            <OptionRow key={t.id} active={form.closingTag === t.id} onClick={() => update('closingTag', t.id)} c={c}>
              {choice(T.closingTags[t.id] ?? t.label, t.label)}
            </OptionRow>
          ))}
        </div>
      </Section>

      <div className="mt-5">
        <Section title="Kids Message" eyebrow="Optional" subtitle="A playful line from the little ones — leave it out if you prefer." c={c} icon={Heart}>
          <div className="grid grid-cols-1 gap-2">
            <OptionRow active={form.kidsLine === ''} onClick={() => update('kidsLine', '')} c={c}>
              <span className="block text-[13px] leading-snug font-semibold italic" style={{ color: c.subtext }}>No kids message</span>
            </OptionRow>
            {KIDS_LINES.map(t => (
              <OptionRow key={t.id} active={form.kidsLine === t.id} onClick={() => update('kidsLine', t.id)} c={c}>
                {choice(T.kidsLines[t.id] ?? t.label, t.label)}
              </OptionRow>
            ))}
            <OptionRow active={form.kidsLine === KIDS_CUSTOM} onClick={() => update('kidsLine', KIDS_CUSTOM)} c={c}>
              <span className="block text-[13px] leading-snug font-semibold" style={{ color: c.text }}>Write our own</span>
              <span className="block text-[11px] leading-snug font-medium mt-1" style={{ color: c.subtext }}>Name your kids, or word it however you like.</span>
            </OptionRow>
          </div>
          {form.kidsLine === KIDS_CUSTOM && (
            <div className="mt-4">
              <Field label="Your kids message" hint={lang.code === 'en' ? 'printed exactly as typed' : `type in English — converted to ${lang.native} for you`} c={c}>
                <Textarea c={c} rows={2} value={form.kidsCustom} onChange={e => update('kidsCustom', e.target.value)}
                  placeholder="e.g. Aarav & Myra are waiting to meet you 😊" />
              </Field>
            </div>
          )}
          {kids && (
            <div className="mt-4 px-4 py-3 rounded-2xl text-center" style={{ background: `${c.gold}12`, border: `1px solid ${c.border}` }}>
              <span lang={lang.code} className="text-[12px] font-medium italic" style={{ color: c.text }}>{kids}</span>
            </div>
          )}
        </Section>
      </div>

      <div className="mt-5">
        <Section title="With Best Compliments" eyebrow="Optional" subtitle="Well-wishers listed at the bottom of the card." c={c} icon={FileText}>
          <Field label="Names" hint="separate with commas" c={c}>
            <Textarea c={c} rows={3} value={form.withCompliments} onChange={e => update('withCompliments', e.target.value)}
              placeholder="e.g. Sharma & Gupta Families, All relatives and friends" />
          </Field>
          <p className="text-[11px] font-medium mt-2.5" style={{ color: c.subtext }}>
            Leave this empty if you don’t want a compliments line.
          </p>
        </Section>
      </div>
    </>
  );
}

/* ─── Step 5: Design ─────────────────────────────────────────────────────── */
function StepDesign({ form, update, setForm, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette; dark: boolean }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [target, setTarget] = useState('heading');
  const [showAllFonts, setShowAllFonts] = useState(false);
  const lang = langOf(form);
  const latin = lang.code === 'en';
  const cats = ['All', ...Array.from(new Set(FONTS.map(f => f.cat)))];
  // An English card lists every face. Any other card lists only the faces that
  // carry its script — one that doesn't would print in the browser's fallback —
  // unless the customer asks for all of them, and even then those come first.
  const fits = (fam: string) => fontHasScript(fam, lang.script);
  const matching = FONTS.filter(f => (cat === 'All' || f.cat === cat) && f.name.toLowerCase().includes(search.toLowerCase()));
  const filtered = latin ? matching
    : showAllFonts ? [...matching.filter(f => fits(f.family)), ...matching.filter(f => !fits(f.family))]
      : matching.filter(f => fits(f.family));
  const scriptCount = FONTS.filter(f => fits(f.family)).length;

  const targetKey: 'headingFont' | 'bodyFont' | 'scriptFont' = target === 'heading' ? 'headingFont' : target === 'body' ? 'bodyFont' : 'scriptFont';
  const currentFamily = form.design[targetKey];
  const currentName = FONTS.find(f => f.family === currentFamily)?.name || 'Custom';

  // Samples in the card's own language, since that is what the fonts must set.
  const nameOf = (side: 'bride' | 'groom', fallback: string) => scriptText(form, `${side}.name`, form[side].name) || fallback;
  const aboveName = form.aboveWeds === 'bride' ? nameOf('bride', 'Aditi Sharma') : nameOf('groom', 'Rohan Mehta');
  const belowName = form.aboveWeds === 'bride' ? nameOf('groom', 'Rohan Mehta') : nameOf('bride', 'Aditi Sharma');
  const relation = relationText(form);
  const firstLine = templateText(form, form.selectedTemplate).split('\n').map(l => l.trim()).find(Boolean);
  const bodySample = latin ? 'Request the honour of your presence' : (firstLine || 'Request the honour of your presence');
  const sampleText = target === 'heading' ? nameOf('bride', 'Aditi Sharma')
    : target === 'script' ? relation
      : bodySample;

  const tabs = [
    { k: 'heading', l: 'Headings', help: 'The two names', fam: form.design.headingFont },
    { k: 'body', l: 'Body text', help: 'The paragraph', fam: form.design.bodyFont },
    { k: 'script', l: 'Script', help: 'Weds / Love', fam: form.design.scriptFont },
  ];

  return (
    <Section title="Typography" eyebrow="Step 6 of 8" subtitle="Pick the lettering. Everything you change shows in the sample below." c={c} icon={Type}>

      {/* Live sample */}
      <div className="mb-7 rounded-2xl border px-5 py-6 text-center overflow-hidden" style={{ borderColor: c.border, background: `${c.gold}09` }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-4" style={{ color: c.gold }}>Live sample</div>
        <div lang={lang.code} style={{
          fontFamily: form.design.bodyFont,
          fontSize: `${form.design.fontSize}px`,
          letterSpacing: `${form.design.letterSpacing}px`,
          lineHeight: form.design.lineHeight,
          color: c.text,
        }}>
          <p className={`max-w-sm mx-auto ${latin ? 'italic' : ''}`} style={{ fontSize: '0.86em', opacity: 0.78 }}>
            {latin ? 'Request the pleasure of your company at the wedding celebration of' : bodySample}
          </p>
          <div className="mt-4 leading-tight break-words" style={{ fontFamily: form.design.headingFont, fontSize: '1.9em' }}>{aboveName}</div>
          <div className="leading-none my-1" style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: '2.1em', color: c.gold }}>{relation}</div>
          <div className="leading-tight break-words" style={{ fontFamily: form.design.headingFont, fontSize: '1.9em' }}>{belowName}</div>
        </div>
      </div>

      {/* Card size — the preview and exports are fitted to this sheet */}
      <CardSizePicker size={form.design.cardSize} onChange={s => update('design.cardSize', s)} c={c} />

      {/* Sliders */}
      <GroupHeading label="Size & spacing" c={c} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <div>
          <SliderField label="Font Size" value={form.design.fontSize} min={12} max={22} step={1} unit="px" onChange={v => update('design.fontSize', v)} c={c} />
          <div className="text-[11px] font-medium mt-1.5" style={{ color: c.subtext }}>How big the writing is</div>
        </div>
        <div>
          <SliderField label="Letter Spacing" value={form.design.letterSpacing} min={0} max={4} step={0.1} unit="px" onChange={v => update('design.letterSpacing', v)} c={c} />
          <div className="text-[11px] font-medium mt-1.5" style={{ color: c.subtext }}>Space between letters</div>
        </div>
        <div>
          <SliderField label="Line Height" value={form.design.lineHeight} min={1.2} max={2.2} step={0.05} unit="×" onChange={v => update('design.lineHeight', v)} c={c} />
          <div className="text-[11px] font-medium mt-1.5" style={{ color: c.subtext }}>Space between lines</div>
        </div>
      </div>

      {/* Language, right above the fonts it decides */}
      <div className="mb-8">
        <LanguagePicker form={form} setForm={setForm} c={c}
          note={latin ? undefined : `Fonts below are the ones with ${lang.native} letters. Changing the language swaps any font that can't print it.`} />
      </div>

      {/* Font picker */}
      <GroupHeading label="Fonts" note={currentName} c={c} />
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: c.border }}>
        <div className="grid grid-cols-3 gap-1.5 p-2" style={{ background: `${c.gold}0D` }}>
          {tabs.map(t => {
            const on = target === t.k;
            return (
              <button key={t.k} type="button" onClick={() => setTarget(t.k)} aria-pressed={on}
                className="min-h-[64px] rounded-xl px-2 py-2 transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ background: on ? c.surface : 'transparent', border: `1px solid ${on ? c.gold : 'transparent'}`, outlineColor: c.gold }}>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: on ? c.goldDeep : c.subtext }}>{t.l}</div>
                <div className="truncate leading-tight mt-0.5" style={{ fontFamily: t.fam, fontSize: '1.15rem', color: c.text }} lang={lang.code}>{latin ? 'Abc' : lang.native}</div>
                <div className="text-[9px] font-medium truncate" style={{ color: c.subtext, opacity: 0.75 }}>{t.help}</div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 px-3 py-3 border-t" style={{ borderColor: c.border }}>
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ color: c.gold, opacity: 0.6 }} />
            <Input c={c} className="pl-11" placeholder="Search fonts…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search fonts" />
          </div>
          <Select c={c} className="w-full sm:!w-44" value={cat} onChange={e => setCat(e.target.value)} aria-label="Filter fonts by style">
            {cats.map(ct => <option key={ct}>{ct}</option>)}
          </Select>
        </div>

        {!latin && (
          <div className="flex items-center justify-between gap-3 flex-wrap px-3 py-2.5 border-t" style={{ borderColor: c.border }}>
            <span className="text-[11px] font-medium min-w-0" style={{ color: c.subtext }}>
              {showAllFonts ? `All fonts — ${lang.native} ones first` : `${scriptCount} fonts with ${lang.native} letters`}
            </span>
            <FilterChip label={showAllFonts ? `Only ${lang.name}` : 'Show all fonts'} active={showAllFonts} onClick={() => setShowAllFonts(v => !v)} c={c} />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-10 px-6 text-[13px] font-semibold" style={{ color: c.subtext }}>
            {!latin && !showAllFonts && !search && cat === 'All' ? `No ${lang.name} fonts available yet — tap "Show all fonts".` : 'No fonts match that search.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto p-3 border-t" style={{ borderColor: c.border, scrollbarWidth: 'thin' }}>
            {filtered.map(f => {
              const active = currentFamily === f.family;
              return (
                <motion.button key={f.name} type="button" onClick={() => update(`design.${targetKey}`, f.family)} aria-pressed={active}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="flex items-center justify-between gap-2 p-3.5 rounded-2xl border text-left min-h-[76px] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}12` : 'transparent', outlineColor: c.gold }}>
                  <div className="min-w-0 flex-1">
                    <div lang={lang.code} className="truncate" style={{ fontFamily: f.family, fontSize: '1.5rem', color: c.text, lineHeight: 1.25 }}>{sampleText}</div>
                    <div className="text-[10px] mt-1 flex items-center gap-2 uppercase tracking-[0.12em] min-w-0" style={{ color: c.subtext }}>
                      <span className="font-bold truncate">{f.name}</span>
                      <span className="opacity-45">·</span>
                      <span className="opacity-80 shrink-0">{f.cat}</span>
                      {!latin && !fits(f.family) && <span className="shrink-0 font-bold" style={{ color: UI_WARN }}>No {lang.name}</span>}
                    </div>
                  </div>
                  {active && <Check className="w-4 h-4 shrink-0" strokeWidth={3} style={{ color: c.gold }} />}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </Section>
  );
}

function CardSizePicker({ size, onChange, c }: { size: CardSize; onChange: (s: CardSize) => void; c: Palette }) {
  const unit = size.unit;
  const isCustom = size.preset === 'custom';
  const show = (inches: number, u: CardSize['unit']) => String(+(u === 'cm' ? inches * CM_PER_IN : inches).toFixed(u === 'cm' ? 1 : 2));
  const toIn = (v: string) => (unit === 'cm' ? Number(v) / CM_PER_IN : Number(v));
  const lo = unit === 'cm' ? +(CARD_MIN_IN * CM_PER_IN).toFixed(1) : CARD_MIN_IN;
  const hi = unit === 'cm' ? +(CARD_MAX_IN * CM_PER_IN).toFixed(1) : CARD_MAX_IN;

  // The custom fields as typed, held apart from the stored size so a half-typed
  // "1" or an out-of-range value never reaches the card — it keeps its last
  // valid size until both fields make sense again.
  const [draft, setDraft] = useState(() => ({ w: show(size.widthIn, unit), h: show(size.heightIn, unit) }));
  // Re-sync when the size changes from outside (sample fill, clear, a preset
  // pick). After our own valid edits the draft already matches and is kept, so
  // "7." isn't rewritten to "7" mid-keystroke.
  useEffect(() => {
    setDraft(d => (Math.abs(toIn(d.w) - size.widthIn) < 0.005 && Math.abs(toIn(d.h) - size.heightIn) < 0.005)
      ? d : { w: show(size.widthIn, unit), h: show(size.heightIn, unit) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.widthIn, size.heightIn, unit]);

  const errorFor = (v: string) => {
    if (v.trim() === '' || !Number.isFinite(Number(v))) return 'Enter a number';
    const n = toIn(v);
    return n < CARD_MIN_IN || n > CARD_MAX_IN ? `Must be between ${lo} and ${hi} ${unit}` : '';
  };
  const edit = (next: { w: string; h: string }) => {
    setDraft(next);
    // A field still showing the stored size (rounded for display) keeps its
    // exact stored value, so editing the height doesn't nudge a 6" width to
    // 5.98" via its "15.2 cm" display.
    const exact = (v: string, inches: number) => (v === show(inches, unit) ? inches : toIn(v));
    if (!errorFor(next.w) && !errorFor(next.h)) {
      onChange({ preset: 'custom', unit, widthIn: exact(next.w, size.widthIn), heightIn: exact(next.h, size.heightIn) });
    }
  };
  const setUnit = (u: CardSize['unit']) => {
    if (u === unit) return;
    // Storage is always inches, so only the display unit changes; the fields are
    // re-shown from the last valid size in the new unit.
    setDraft({ w: show(size.widthIn, u), h: show(size.heightIn, u) });
    onChange({ ...size, unit: u });
  };

  // A tiny outline of the sheet's proportions, so landscape vs portrait reads at a glance.
  const shape = (w: number, h: number, on: boolean) => {
    const m = Math.max(w, h);
    return <span className="shrink-0 rounded-[3px] border-[1.5px]" aria-hidden="true"
      style={{ width: 22 * w / m, height: 22 * h / m, borderColor: on ? c.gold : withAlpha(c.text, 0.35) }} />;
  };

  return (
    <div className="mb-8">
      <GroupHeading label="Card size" note={cardSizeText(size)} c={c} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CARD_SIZES.map(p => {
          const on = size.preset === p.id;
          return (
            <OptionRow key={p.id} active={on} c={c}
              onClick={() => onChange({ preset: p.id, widthIn: p.widthIn, heightIn: p.heightIn, unit })}>
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold" style={{ color: c.text }}>{p.label}</span>
                  <span className="block text-[11px] font-medium" style={{ color: c.subtext }}>{p.widthIn}" wide × {p.heightIn}" tall</span>
                </span>
                {shape(p.widthIn, p.heightIn, on)}
              </span>
            </OptionRow>
          );
        })}
        <OptionRow active={isCustom} c={c} onClick={() => { if (!isCustom) onChange({ ...size, preset: 'custom' }); }}>
          <span className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[14px] font-bold" style={{ color: c.text }}>Custom size</span>
              <span className="block text-[11px] font-medium" style={{ color: c.subtext }}>Enter your own width and height</span>
            </span>
            {isCustom && shape(size.widthIn, size.heightIn, true)}
          </span>
        </OptionRow>
      </div>

      {isCustom && (
        <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: c.border, background: `${c.gold}07` }}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] mr-1" style={{ color: c.subtext }}>Measure in</span>
            <FilterChip label="Inches" active={unit === 'in'} onClick={() => setUnit('in')} c={c} />
            <FilterChip label="cm" active={unit === 'cm'} onClick={() => setUnit('cm')} c={c} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Width" hint={unit} c={c} htmlFor="wmp-card-w" error={errorFor(draft.w) || undefined}>
              <Input id="wmp-card-w" c={c} type="number" inputMode="decimal" step={unit === 'cm' ? 0.1 : 0.25} min={lo} max={hi}
                value={draft.w} invalid={!!errorFor(draft.w)} onChange={e => edit({ ...draft, w: e.target.value })} />
            </Field>
            <Field label="Height" hint={unit} c={c} htmlFor="wmp-card-h" error={errorFor(draft.h) || undefined}>
              <Input id="wmp-card-h" c={c} type="number" inputMode="decimal" step={unit === 'cm' ? 0.1 : 0.25} min={lo} max={hi}
                value={draft.h} invalid={!!errorFor(draft.h)} onChange={e => edit({ ...draft, h: e.target.value })} />
            </Field>
          </div>
          <div className="text-[11px] font-medium mt-3 leading-snug" style={{ color: c.subtext }}>
            The whole card is re-set to fit this size — text is scaled to fit the sheet, never cut off.
          </div>
        </div>
      )}
    </div>
  );
}

function SliderField({ label, value, min, max, step, unit, onChange, c }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; c: Palette }) {
  const id = 'wm-slider-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  const fmt = (v: number) => v.toFixed(decimals);
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(4))));
  const trackIdle = withAlpha(c.ink, 0.12);

  const nudgeBtn: React.CSSProperties = {
    width: 40, height: 40,
    border: `1.5px solid ${c.border}`,
    background: withAlpha(c.ink, 0.04),
    color: c.gold,
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <label htmlFor={id} className="font-bold leading-none" style={{ color: withAlpha(c.text, 0.82), fontSize: 13 }}>
          {label}
        </label>
        <output
          htmlFor={id}
          className="font-bold rounded-lg px-2.5 py-1 leading-none"
          style={{ color: c.gold, background: withAlpha(c.gold, 0.12), fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
        >
          {fmt(value)}{unit}
        </output>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="shrink-0 grid place-items-center rounded-xl transition-colors duration-200 disabled:opacity-35 disabled:cursor-not-allowed"
          style={nudgeBtn}
        >
          <Minus className="w-4 h-4" aria-hidden />
        </button>

        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(+e.target.value)}
          aria-valuetext={`${fmt(value)}${unit}`}
          className="wm-range flex-1 min-w-0 appearance-none cursor-pointer bg-transparent"
          style={{
            height: 22,
            ['--wm-thumb' as string]: c.gold,
            ['--wm-thumb-ring' as string]: withAlpha(c.gold, 0.35),
            ['--wm-track' as string]: `linear-gradient(90deg, ${c.primary} 0%, ${c.gold} ${pct}%, ${trackIdle} ${pct}%, ${trackIdle} 100%)`,
          }}
        />

        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="shrink-0 grid place-items-center rounded-xl transition-colors duration-200 disabled:opacity-35 disabled:cursor-not-allowed"
          style={nudgeBtn}
        >
          <Plus className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <div className="flex justify-between mt-1.5 px-[50px] font-semibold" style={{ color: withAlpha(c.text, 0.35), fontSize: 10 }}>
        <span>{fmt(min)}{unit}</span>
        <span>{fmt(max)}{unit}</span>
      </div>
    </div>
  );
}

/* ─── Step 6: Preview ────────────────────────────────────────────────────── */
function StepPreview({ form, update, c, dark, script }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean; script: ScriptSuggestions }) {
  const wide = form.preview.device !== 'mobile';
  const lang = langOf(form);
  const missing = scriptFields(form).filter(f => !scriptValue(form, f.path).trim()).length;
  const stageBg = dark
    ? 'linear-gradient(165deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.34) 100%)'
    : `linear-gradient(165deg, ${c.ink}16 0%, ${c.ink}08 100%)`;
  const stageInset = `inset 0 1px 0 ${c.gold}26, inset 0 18px 34px -22px rgba(0,0,0,0.75)`;

  return (
    <Section title="Preview Your Card" eyebrow="Step 7 of 8" subtitle="Exactly how the designer will receive it." tip="Check all names and dates before submitting." c={c} icon={Eye}>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[{ k: 'desktop', i: Monitor, l: 'Full Size' }, { k: 'mobile', i: Smartphone, l: 'Compact' }].map(d => {
          const Icon = d.i; const active = form.preview.device === d.k;
          return (
            <button key={d.k} type="button" onClick={() => update('preview.device', d.k)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition-all"
              style={{ borderColor: active ? 'transparent' : c.border, background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'rgba(255,255,255,0.5)', color: active ? 'white' : c.text }}>
              <Icon className="w-3.5 h-3.5" /> {d.l}
            </button>
          );
        })}
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ml-auto transition hover:opacity-80"
          style={{ borderColor: c.border, color: c.text, background: 'rgba(255,255,255,0.5)' }}>
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>

      {/* The stage — a quiet recessed panel so the white card lifts off it */}
      <div className="relative rounded-[1.5rem] overflow-hidden" style={{ background: stageBg, boxShadow: stageInset }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(115% 65% at 50% -8%, ${c.gold}16 0%, transparent 62%)` }} />
        <div className={`wmp-print-area relative mx-auto px-2.5 sm:px-8 py-5 sm:py-12 transition-all duration-500 ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
          <CardPreview form={form} c={c} dark={dark} />
        </div>
      </div>

      <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: c.subtext }}>
        Shown at true print proportions
      </div>

      {missing > 0 && (
        <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: withAlpha(UI_WARN, 0.45), background: withAlpha(UI_WARN, 0.06) }}>
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: UI_WARN }} aria-hidden />
            <div className="text-[13px] font-bold leading-snug" style={{ color: c.text }}>
              {missing === 1 ? '1 entry is' : `${missing} entries are`} still in English on this {lang.name} card
              <span className="block text-[11px] font-medium mt-0.5" style={{ color: c.subtext }}>Type {missing === 1 ? 'it' : 'them'} in {lang.native} below, or leave as is to print the English.</span>
            </div>
          </div>
          <ScriptTextEditor form={form} script={script} c={c} onlyMissing />
        </div>
      )}
    </Section>
  );
}

/* ─── Step 7: Submit ─────────────────────────────────────────────────────── */
function StepSubmit({ form, update, c, onSubmit, setStep, submitting, script }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; onSubmit: () => void; setStep: (n: number) => void; submitting?: boolean; script: ScriptSuggestions }) {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const lang = langOf(form);
  const fields = scriptFields(form);
  const missing = fields.filter(f => !scriptValue(form, f.path).trim()).length;
  const sections = [
    { label: 'Card Language', step: 0, value: lang.code === 'en' ? 'English' : `${lang.name} · ${lang.native}`, icon: MessageCircle, ok: true },
    { label: 'Bride & Groom', step: 0, value: `${form.bride.name || '—'} & ${form.groom.name || '—'}`, icon: Heart, ok: !!(form.bride.name && form.groom.name) },
    { label: 'Card Order', step: 0, value: form.aboveWeds === 'bride' ? 'Bride above Weds' : 'Groom above Weds', icon: ArrowLeftRight, ok: true },
    { label: 'Deities', step: 1, value: `${form.deities.length} selected`, icon: Star, ok: form.deities.length > 0 },
    { label: 'Template', step: 2, value: template ? `#${template.id} · ${template.category}` : 'Not selected', icon: BookOpen, ok: !!template },
    { label: 'Programmes', step: 3, value: `${form.programmes.filter(p => p.date).length} with dates`, icon: Calendar, ok: form.programmes.some(p => p.date) && !form.programmes.some(p => isPastDate(p.date)) },
    { label: 'Programme Pages', step: 3, value: separateSheets(form) ? `Separate page for each function (${form.programmes.filter(p => p.date).length + 1} pages)` : 'All on one page', icon: Copy, ok: true },
    { label: 'Closing Line', step: 4, value: closing ? closingText(form) : '—', icon: FileText, ok: true },
    { label: 'Design', step: 5, value: `${lang.name} · ${form.design.layout}`, icon: Type, ok: true },
    { label: 'Card Size', step: 5, value: `${cardSizeName(form.design.cardSize)} · ${cardSizeText(form.design.cardSize)}`, icon: Maximize2, ok: isValidCardSize(form.design.cardSize) },
  ];
  const pending = sections.filter(s => !s.ok).length;

  return (
    <Section title="Review & Submit" eyebrow="Final Step"
      subtitle="One last read. The designer prints exactly what is listed here."
      c={c} icon={CheckCircle2}>

      {/* Readiness */}
      <div className="mb-6 flex items-start gap-3 px-4 py-4 rounded-2xl border"
        style={{ borderColor: pending ? `${c.accent}59` : `${c.gold}59`, background: pending ? `${c.accent}0D` : `${c.gold}0D` }}>
        <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: pending ? `${c.accent}1A` : `${c.gold}1F` }}>
          {pending
            ? <Info className="w-4 h-4" style={{ color: c.accent }} />
            : <CheckCircle2 className="w-4 h-4" style={{ color: c.goldDeep }} />}
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold leading-snug" style={{ color: c.text }}>
            {pending ? `${pending} ${pending === 1 ? 'section still needs' : 'sections still need'} your attention` : 'Everything is filled in'}
          </div>
          <div className="text-[11px] font-medium mt-0.5 leading-snug" style={{ color: c.subtext }}>
            {pending ? 'Tap Edit on the rows marked in orange below.' : 'Read it through, then tick the box at the bottom.'}
          </div>
        </div>
      </div>

      <GroupHeading label="Your card at a glance" c={c} />
      <div className="space-y-2">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-3 p-3.5 rounded-2xl border"
              style={{ borderColor: s.ok ? c.border : `${c.accent}59`, background: s.ok ? 'transparent' : `${c.accent}08` }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.ok ? `${c.gold}14` : `${c.accent}14` }}>
                <Icon className="w-4 h-4" style={{ color: s.ok ? c.gold : c.accent }} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: c.subtext }}>{s.label}</div>
                <div className="text-[14px] font-semibold leading-snug break-words" style={{ color: c.text }}>{s.value}</div>
              </div>
              <button type="button" onClick={() => setStep(s.step)} aria-label={`Edit ${s.label}`}
                className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-full text-[10px] font-bold uppercase tracking-[0.16em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: c.goldDeep, background: `${c.gold}14`, outlineColor: c.gold }}>
                <Edit3 className="w-3 h-3" /> Edit
              </button>
            </div>
          );
        })}
      </div>

      {/* The script versions, for a last read: everything typed on later steps
          (venues, compliments) was converted without the customer seeing it. */}
      {lang.code !== 'en' && fields.length > 0 && (
        <div className="mt-7">
          <GroupHeading label={`Names in ${lang.name}`} note={missing ? `${missing} still in English` : `${fields.length} ready`} c={c} />
          <Disclosure label={`Check the ${lang.native} spellings`} hint={missing ? `${missing} to fill` : 'All converted'} defaultOpen={missing > 0} c={c}>
            <div className="pt-1"><ScriptTextEditor form={form} script={script} c={c} /></div>
          </Disclosure>
        </div>
      )}

      {/* Confirmation */}
      <div className="mt-7">
        <AtelierRule c={c} className="mb-6 max-w-[220px] mx-auto" />
        <label className="flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-colors duration-300"
          style={{ borderColor: form.meta.accepted ? c.gold : c.border, background: form.meta.accepted ? `${c.gold}12` : 'transparent' }}>
          <input type="checkbox" checked={form.meta.accepted} disabled={submitting}
            onChange={e => update('meta.accepted', e.target.checked)}
            className="mt-0.5 w-6 h-6 shrink-0 cursor-pointer" style={{ accentColor: c.gold }} />
          <span className="min-w-0">
            <span className="block text-[14px] font-bold leading-snug" style={{ color: c.text }}>
              I have checked every name, date and time — they are correct.
            </span>
            <span className="block text-[12px] mt-1.5 leading-snug font-medium" style={{ color: c.subtext }}>
              The designer uses this content exactly as shown. Changes after printing cost extra.
            </span>
          </span>
        </label>
        <div className="text-[12px] font-semibold text-center mt-4" style={{ color: form.meta.accepted ? c.goldDeep : c.subtext }}>
          {form.meta.accepted
            ? 'Ready — press Submit below to send it to the designer.'
            : 'Tick the box above, then press Submit below.'}
        </div>
      </div>
    </Section>
  );
}

/* ─── Preview zoom ───────────────────────────────────────────────────────── */
const ZOOM_MIN = 0.75, ZOOM_MAX = 2, ZOOM_STEP = 0.25;

function ZoomControls({ zoom, setZoom, c, onDark = false, className = '' }: {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  c: Palette;
  onDark?: boolean;
  className?: string;
}) {
  const fg = onDark ? c.goldLight : c.gold;
  const bd = onDark ? 'rgba(255,255,255,0.16)' : c.border;
  const bg = onDark ? 'rgba(255,255,255,0.06)' : `${c.gold}0F`;
  const btn = 'w-6 h-6 flex items-center justify-center rounded-full transition hover:opacity-70 active:scale-90 disabled:opacity-25 disabled:cursor-default';
  return (
    <div className={`items-center gap-0.5 rounded-full border px-1 py-0.5 flex ${className}`} style={{ borderColor: bd, background: bg }}>
      <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} className={btn} style={{ color: fg }}
        onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}>
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button type="button" aria-label="Reset zoom" onClick={() => setZoom(1)}
        className="min-w-[2.75rem] text-[10px] font-bold tracking-wider tabular-nums transition hover:opacity-70" style={{ color: fg }}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} className={btn} style={{ color: fg }}
        onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}>
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ─── Card Preview ───────────────────────────────────────────────────────── */
function CardPreview({ form, c, dark, compact }: { form: FormState; c: Palette; dark: boolean; compact?: boolean }) {
  const layout = form.design.layout;
  // Every word below is in the card's language: fixed wording from
  // cardStrings(), the customer's own values through scriptText().
  const lang = langOf(form);
  const L = cardStrings(form).labels;
  const latin = isLatinCard(form);
  const template = templateText(form, form.selectedTemplate);
  const closing = closingText(form);
  const kidsLine = kidsLineText(form);
  const relation = relationText(form);
  const hasNames = !!(form.bride.name || form.groom.name);

  // Respect aboveWeds
  const aboveSide = form.aboveWeds;
  const belowSide = form.aboveWeds === 'bride' ? 'groom' : 'bride';
  const above = form[aboveSide];
  const below = form[belowSide];
  const nm = (side: 'bride' | 'groom') => scriptText(form, `${side}.name`, form[side].name);
  const pName = (side: 'bride' | 'groom', role: 'father' | 'mother' | 'grandfather' | 'grandmother') => personName(form, side, role);
  const pair = (a: string, b: string) => (a && b ? `${a}${L.and}${b}` : a || b);
  // Tracked capitals suit Latin; Indic scripts have no case, and spacing their
  // letters apart breaks up the joined forms of a word.
  const tracked = (em: string): React.CSSProperties => (latin ? { letterSpacing: em } : { letterSpacing: 0 });

  // Every page is exactly the card's trim size; FittedSheet scales the matter to
  // fit it. An out-of-range size can't be stored by the picker, but an order is
  // arbitrary JSON, so fall back rather than lay out a 0" or 500" sheet.
  const cardSize = isValidCardSize(form.design.cardSize) ? form.design.cardSize : DEFAULT_CARD_SIZE;

  // White card background for maximum legibility
  const cardBg = '#FFFFFF';

  if (!hasNames && compact) {
    return (
      <div className="@container">
        <div
          className="relative rounded-2xl overflow-hidden flex flex-col items-center justify-center py-12 px-6 text-center"
          style={{
            background: cardBg,
            minHeight: 230,
            boxShadow: '0 1px 1px rgba(18,6,9,0.10), 0 8px 18px -10px rgba(18,6,9,0.30), 0 34px 60px -30px rgba(18,6,9,0.50)',
          }}
        >
          <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(192,137,46,0.42)' }} />
          <div className="absolute inset-3 rounded-xl pointer-events-none" style={{ border: '1px dashed rgba(192,137,46,0.40)' }} />
          <DecorativeDivider compact />
          <div style={{ color: '#1A1A1A', fontFamily: "'Cormorant Garamond', serif", fontSize: '1.5rem', letterSpacing: '0.01em', lineHeight: 1.15 }}>
            Your card begins here
          </div>
          <div className="text-[11px] mt-2 max-w-[15rem] leading-snug font-medium" style={{ color: '#1A1A1A', opacity: 0.55 }}>
            Add the bride & groom names — this page fills itself as you type.
          </div>
          <div className="mt-6 flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: '#C0892E', opacity: 0.22 + i * 0.22 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pageContent = (
    <div className={`relative ${compact ? 'p-5 pt-6' : 'p-7 sm:p-10 pt-8'} text-center`}
      style={{ fontFamily: form.design.bodyFont, fontSize: `${form.design.fontSize}px`, letterSpacing: `${form.design.letterSpacing}px`, lineHeight: form.design.lineHeight }}>

      {/* Deities. A plain centred row, no danda marks and no box — the dashed
          box was screen-only chrome that would never have printed, and the
          danda marks belong to the mantra line directly below. */}
      {form.deities.length > 0 && (
        <div className="mb-2 flex items-center justify-center gap-3 flex-wrap"
          style={{ color: '#1A1A1A', fontFamily: form.design.headingFont }}>
          {form.deities.map(id => { const d = DEITIES.find(x => x.id === id); return <span key={id} className="text-xl sm:text-2xl leading-none">{d && <DeityGlyph glyph={d.glyph} title={d.name} />}</span>; })}
        </div>
      )}
      {form.deities[0] && (
        <div className="text-[9px] uppercase tracking-[0.35em] mb-3 font-bold" style={{ color: '#1A1A1A', fontFamily: form.design.headingFont }}>
          {DEITIES.find(d => d.id === form.deities[0])?.mantra}
        </div>
      )}

      {/* Host parents line */}
      {form.hostType === 'parents' && (above.fatherName || above.motherName || below.fatherName || below.motherName) && (
        <div className="text-[11px] mb-2 font-semibold" style={{ color: '#1A1A1A' }}>
          {pair(pName(aboveSide, 'mother') || pName(belowSide, 'mother'), pName(aboveSide, 'father') || pName(belowSide, 'father'))}
        </div>
      )}

      {/* Template */}
      {template && (
        <p className={`mb-5 opacity-80 max-w-md mx-auto whitespace-pre-line ${latin ? 'italic' : ''}`} style={{ fontSize: '0.88em', fontFamily: form.design.bodyFont, lineHeight: 1.6 }}>
          {template.replace(/\n\n\n/g, '\n\n')}
        </p>
      )}

      {/* Names */}
      <div className="my-5">
        <div className="font-medium leading-tight mb-1" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.7em' : '2.5em', color: '#111111' }}>
          {nm(aboveSide) || <span className="opacity-30 italic" style={{ fontSize: '0.7em' }}>Name</span>}
        </div>
        {(above.fatherName || above.motherName) && (
          <div className="text-[10px] opacity-70 font-semibold mt-0.5">
            {childOf(form, aboveSide, pair(pName(aboveSide, 'father'), pName(aboveSide, 'mother')))}
          </div>
        )}
        {above.grandfatherName && (
          <div className="text-[10px] opacity-55 mt-0.5">{pair(pName(aboveSide, 'grandfather'), pName(aboveSide, 'grandmother'))}</div>
        )}

        <div className="mt-4 mb-1">
          <div style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: compact ? '2.2em' : '3.2em', color: '#1A1A1A', lineHeight: 'normal' }}>
            {relation}
          </div>
          {/* Line height "normal", and the rule in flow below the word: html2canvas
              places script text lower than the browser whenever line-height is
              tighter than the font's own height, which struck the rule through "Weds" in the PDF. */}
          <div className="mx-auto mt-1 w-14 h-px" style={{ background: '#C0892E' }} />
        </div>

        <div className="font-medium leading-tight mb-1 mt-2" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.7em' : '2.5em', color: '#111111' }}>
          {nm(belowSide) || <span className="opacity-30 italic" style={{ fontSize: '0.7em' }}>Name</span>}
        </div>
        {(below.fatherName || below.motherName) && (
          <div className="text-[10px] opacity-70 font-semibold mt-0.5">
            {childOf(form, belowSide, pair(pName(belowSide, 'father'), pName(belowSide, 'mother')))}
          </div>
        )}
        {below.grandfatherName && (
          <div className="text-[10px] opacity-55 mt-0.5">{pair(pName(belowSide, 'grandfather'), pName(belowSide, 'grandmother'))}</div>
        )}
      </div>

      {form.family.residenceAddress && (
        <div className="mt-5 pt-4 text-[10px]" style={{ borderTop: '1px solid rgba(0, 0, 0, 0.10)' }}>
          <div className="font-bold mb-0.5" style={{ color: '#1A1A1A' }}>{L.residence}</div>
          <div className="opacity-65">{scriptText(form, 'family.residenceAddress', form.family.residenceAddress)}</div>
        </div>
      )}
      {form.withCompliments && (
        <div className="mt-3 text-[10px]">
          <div className="font-bold mb-0.5" style={{ color: '#1A1A1A' }}>{L.withCompliments}</div>
          <div className="opacity-65">{scriptText(form, 'withCompliments', form.withCompliments)}</div>
        </div>
      )}
      {kidsLine && (
        <div className="mt-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(192, 137, 46, 0.12)' }}>
          <div className={`text-[10px] font-medium ${latin ? 'italic' : ''}`} style={{ color: '#1A1A1A' }}>{kidsLine}</div>
        </div>
      )}
      {closing && (
        <div className="mt-4 text-[10px] font-bold" style={{ color: '#1A1A1A', ...tracked('0.28em') }}>✦ {latin ? closing.toUpperCase() : closing} ✦</div>
      )}
      <div className="mt-4 flex justify-center">
        <svg width="40" height="12" viewBox="0 0 40 12" fill="#C0892E" opacity="0.6">
          <circle cx="6" cy="6" r="2" /><circle cx="20" cy="6" r="3" /><circle cx="34" cy="6" r="2" />
        </svg>
      </div>
    </div>
  );

  const datedProgrammes = form.programmes.filter(f => f.date);
  const separate = separateSheets(form);
  const pageProgrammes = datedProgrammes.length && !separate ? (
    <div className={`relative ${compact ? 'p-5 pt-6' : 'p-7 sm:p-10 pt-8'} text-center`}
      style={{ fontFamily: form.design.bodyFont, fontSize: `${form.design.fontSize}px`, letterSpacing: `${form.design.letterSpacing}px`, lineHeight: form.design.lineHeight }}>
      <DecorativeDivider compact={compact} mini />
      <div className="text-[10px] font-bold mb-3 mt-2" style={{ color: '#1A1A1A', ...tracked('0.4em'), fontFamily: form.design.headingFont }}>◈ {latin ? L.programmes.toUpperCase() : L.programmes} ◈</div>
      <div className="grid grid-cols-1 gap-2">
        {datedProgrammes.map(f => {
          const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
          const when = progWhen(f, false, form);
          return (
            <div key={f.id} className="rounded-xl p-2.5 text-left" style={{ background: `linear-gradient(135deg, ${preset?.color || '#C0892E'}12, transparent)`, border: `1px solid ${preset?.color || '#C0892E'}28` }}>
              <div className="flex items-start gap-2">
                <div className="text-lg shrink-0">{preset?.icon || '✨'}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1em', color: '#1A1A1A' }}>{programmeName(form, f)}</div>
                  <div className="text-[10px] mt-0.5 font-semibold">
                    {when.date}
                    {when.time ? <span className="opacity-65"> · {when.time}</span> : null}
                  </div>
                  {f.venue && <div className="text-[10px] font-bold mt-0.5" style={{ color: '#1A1A1A' }}>{scriptText(form, `programme.${f.id}.venue`, f.venue)}</div>}
                  {f.address && <div className="text-[10px] opacity-65 mt-0.5 leading-tight">{scriptText(form, `programme.${f.id}.address`, f.address)}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  // One standalone insert per programme, laid out as its own composition rather
  // than reusing the combined page's small row. No height of its own: the
  // FittedSheet in paper() centres it on the sheet and scales it up to fill.
  // Every fixed word comes from cardStrings and every typed value goes through
  // scriptText, so the sheet prints in the card's language.
  const programmeSheet = (f: Programme) => {
    const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
    const tint = preset?.color || '#C0892E';
    const L = cardStrings(form).labels;
    const when = sheetWhen(form, f);
    const invite = sheetInviteParts(form, f);
    const [aboveName, belowName] = sheetCouple(form);
    const venue = f.venue.trim() ? scriptText(form, `programme.${f.id}.venue`, f.venue.trim()) : '';
    const address = f.address.trim() ? scriptText(form, `programme.${f.id}.address`, f.address.trim()) : '';
    const sentence = { fontSize: '0.95em', color: '#2A2A2A', lineHeight: 1.55 };
    const couple = (aboveName || belowName) ? (
      <div className="my-3" style={{ color: '#111111' }}>
        {aboveName && <div className="font-medium leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '2em' }}>{aboveName}</div>}
        {aboveName && belowName && (
          <div style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: '2em', color: tint, lineHeight: 1 }}>{L.and.trim()}</div>
        )}
        {belowName && <div className="font-medium leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '2em' }}>{belowName}</div>}
      </div>
    ) : null;
    const heading = (<>
      <FunctionMotif preset={f.preset} color={tint} size={compact ? 88 : 116} />
      <div className="font-medium leading-snug mt-3 pb-2" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '2.1em' : '2.7em', color: '#111111' }}>
        {sheetFunctionName(form, f)}
      </div>
      <SheetRule color={tint} />
      {invite.before && <p className="italic max-w-[22em] mx-auto" style={sentence}>{invite.before}</p>}
      {invite.hasCouple && couple}
      {invite.after && <p className="italic max-w-[22em] mx-auto" style={sentence}>{invite.after}</p>}
      {!invite.hasCouple && couple}
    </>);
    const details = (<>
      <div className="font-semibold uppercase" style={{ color: '#1A1A1A', letterSpacing: '0.12em', fontSize: '0.9em' }}>{when.date}</div>
      {when.time && <div className="mt-1" style={{ fontSize: '0.92em', color: '#3A3A3A' }}>{when.time}</div>}
      {venue && <div className="mt-4 font-bold" style={{ fontFamily: form.design.headingFont, fontSize: '1.2em', color: '#1A1A1A' }}>{venue}</div>}
      {address && <div className="mt-0.5 max-w-[20em] whitespace-pre-line" style={{ fontSize: '0.85em', color: '#4A4A4A' }}>{address}</div>}
      {when.note && (
        <div className="mt-5 px-5 py-2.5 max-w-[22em] rounded-lg" style={{ border: `1px solid ${tint}55`, background: `${tint}0D` }}>
          <div className="font-bold uppercase mb-0.5" style={{ fontSize: '0.62em', letterSpacing: '0.3em', color: tint }}>{L.note}</div>
          <div className="whitespace-pre-line" style={{ fontSize: '0.88em', color: '#1A1A1A' }}>{when.note}</div>
        </div>
      )}
    </>);
    const textStyle = { fontFamily: form.design.bodyFont, fontSize: `${form.design.fontSize}px`, letterSpacing: `${form.design.letterSpacing}px`, lineHeight: form.design.lineHeight };
    // A landscape card would leave one centred column stranded between empty
    // sides, so it sets the invitation and the particulars side by side.
    if (cardSize.widthIn / cardSize.heightIn > 1.2) {
      return (
        <div className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-10 text-center ${compact ? 'px-10 py-10' : 'px-16 py-14'}`} style={textStyle}>
          <div className="flex flex-col items-center min-w-0">{heading}</div>
          <div className="self-stretch flex flex-col items-center gap-2 py-6" aria-hidden="true">
            <div className="flex-1 w-px" style={{ background: `linear-gradient(transparent, ${tint}88)` }} />
            <svg width="9" height="9" viewBox="0 0 10 10"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill={tint} /></svg>
            <div className="flex-1 w-px" style={{ background: `linear-gradient(${tint}88, transparent)` }} />
          </div>
          <div className="flex flex-col items-center min-w-0">
            <DecorativeDivider compact={compact} mini />
            {details}
            <div className="mt-5"><SheetRule color={tint} small /></div>
          </div>
        </div>
      );
    }
    return (
      <div className="relative">
        <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-8 py-10' : 'px-12 sm:px-14 py-14'}`} style={textStyle}>
          {heading}
          <div className="mt-3 mb-1"><DecorativeDivider compact={compact} mini /></div>
          {details}
          <div className="mt-5"><SheetRule color={tint} small /></div>
        </div>
      </div>
    );
  };

  // ── Paper shell: the card reads as a real sheet resting on the stage.
  //    `wmp-hero-card` carries the theme-aware shadow ladder + gold ring;
  //    `wmp-card-page` makes each page print whole on its own sheet, and is
  //    how the exports find the pages. FittedSheet sizes it to the card. ───
  //    `extraDecor` sits on the sheet itself (not the scaled matter), for
  //    ornaments that belong to the paper's edges — the function sheets' corners.
  const paper = (children: React.ReactNode, label: string, showLabel: boolean, extraDecor?: React.ReactNode) => (
    <div>
      {showLabel && (
        <div lang="en" className="flex items-center gap-2 mb-2 px-0.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] shrink-0" style={{ color: c.gold }}>{label}</span>
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${c.gold}55, transparent)` }} />
        </div>
      )}
      <FittedSheet size={cardSize} background={cardBg} decor={
        <>
          {/* faint gold edge rule on the paper's own boundary */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none z-10" style={{ boxShadow: 'inset 0 0 0 1px rgba(192,137,46,0.42)' }} />
          {layout !== 'modern' && (
            <>
              <div className="absolute inset-2.5 rounded-xl pointer-events-none" style={{ border: '2px double #C0892E', opacity: 0.5 }} />
              <div className="absolute inset-4 rounded-lg pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.5 }} />
            </>
          )}
          {layout === 'modern' && <div className="absolute inset-3 rounded-xl pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.4 }} />}
          {extraDecor}
        </>
      }>
        {children}
      </FittedSheet>
    </div>
  );

  const hasTwoPages = !!pageProgrammes || separate;

  return (
    // `lang` gives the browser the right shaping, line breaking and hyphenation
    // for the card's script; the screen-only page labels set their own.
    <div className="@container space-y-5" lang={lang.code}>
      {paper(pageContent, 'Page 1 · Invitation', hasTwoPages)}
      {pageProgrammes && paper(pageProgrammes, 'Page 2 · Programmes', true)}
      {/* Keyed wrappers: paper() has no key of its own, and the sheet list
          changes length as programmes are dated or removed. */}
      {separate && datedProgrammes.map((f, i) => (
        <React.Fragment key={f.id}>
          {paper(programmeSheet(f), `Page ${i + 2} · ${f.name || PROGRAMME_PRESETS.find(p => p.id === f.preset)?.name || 'Function'}`, true,
            <SheetOrnament color={PROGRAMME_PRESETS.find(p => p.id === f.preset)?.color || '#C0892E'} size={cardSize} />)}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ─── Fitted card sheet ──────────────────────────────────────────────────────
   Each page is laid out at its real physical size (PX_PER_IN), so a card of
   any proportions gets the same typography, and the matter is then scaled as a
   block until it fills the sheet without spilling off it. The whole sheet is
   finally shrunk (or grown) to the preview column with a CSS transform. Two
   separate scales on purpose: the content scale is part of the card's design
   and is exported; the view scale is screen-only and the exports undo it. */

// A packed card shrinks its matter down to 35%; a sparse one grows it up to
// 130% so a big card with little on it isn't lost in whitespace.
const FIT_MIN = 0.35, FIT_MAX = 1.3;

/** Picks the content scale for one `.wmp-card-page` and applies it. Plain DOM
 *  rather than React state, so html2canvas's `onclone` can re-run it on its
 *  cloned sheet. Scaling by f while laying the matter out at width W/f makes
 *  it span the sheet's width after scaling; its height then decides the fit.
 *  h·f only grows with f (a narrower column wraps into more lines), so a
 *  binary search finds the largest f that fits. */
function fitSheetContent(sheet: HTMLElement) {
  const content = sheet.querySelector<HTMLElement>('.wmp-sheet-content');
  const W = sheet.clientWidth, H = sheet.clientHeight;
  if (!content || !W || !H) return;
  const fits = (f: number) => {
    content.style.width = `${W / f}px`;
    return content.offsetHeight * f <= H - 1;   // offsetHeight ignores transforms — the unscaled height
  };
  let f = FIT_MAX;
  if (!fits(FIT_MAX)) {
    // Below FIT_MIN the matter is clipped instead; at that point it is unreadable anyway.
    let lo = FIT_MIN, hi = FIT_MAX;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    f = lo;
  }
  content.style.width = `${W / f}px`;
  content.style.transform = `scale(${f})`;
}

function FittedSheet({ size, background, decor, children }: { size: CardSize; background: string; decor: React.ReactNode; children: React.ReactNode }) {
  const W = Math.round(size.widthIn * PX_PER_IN), H = Math.round(size.heightIn * PX_PER_IN);
  const frameRef = useRef<HTMLDivElement>(null);   // reserves the scaled sheet's footprint in the page flow
  const scalerRef = useRef<HTMLDivElement>(null);  // the screen-only view scale
  const sheetRef = useRef<HTMLDivElement>(null);

  // Styles are written to the DOM directly, never via React state: fitting has
  // to measure, and measuring through state would mean a render per guess and
  // a visible flash of the unfitted card.
  const layout = useCallback(() => {
    const frame = frameRef.current, scaler = scalerRef.current, sheet = sheetRef.current;
    if (!frame || !scaler || !sheet) return;
    fitSheetContent(sheet);
    const avail = frame.clientWidth;
    if (!avail) return;
    // Fill the column's width, but stop a tall, narrow card running taller
    // than 1.5× that width — it would push everything else off screen.
    const s = Math.min(avail / W, (avail * 1.5) / H);
    scaler.style.transform = `translateX(${(avail - W * s) / 2}px) scale(${s})`;
    frame.style.height = `${H * s}px`;
  }, [W, H]);

  // Every render, since the matter may have changed; a layout effect, so the
  // fitted card is the first thing painted.
  useLayoutEffect(layout);

  // Things that change the fit without a render: the column resizing, and web
  // fonts arriving (they reflow the matter, which shows up as a content resize).
  // Deferred a frame so re-fitting inside the observer can't trip its loop limit.
  useEffect(() => {
    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
    const ro = new ResizeObserver(schedule);
    if (frameRef.current) ro.observe(frameRef.current);
    const content = sheetRef.current?.querySelector('.wmp-sheet-content');
    if (content) ro.observe(content);
    document.fonts?.ready.then(schedule);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [layout]);

  return (
    <div ref={frameRef}>
      <div ref={scalerRef} className="wmp-sheet-scaler" style={{ width: W, height: H, transformOrigin: '0 0' }}>
        <motion.div
          ref={sheetRef}
          whileHover={{ y: -3 }}
          transition={{ type: 'tween', duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="wmp-card-page wmp-hero-card rounded-2xl overflow-hidden relative"
          data-width-in={size.widthIn}
          data-height-in={size.heightIn}
          style={{ width: W, height: H, background, color: '#111111' }}
        >
          {decor}
          {/* Centred both ways; an item wider than the sheet (FIT < 1) overflows
              evenly, then the centre-origin scale brings it back inside. */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="wmp-sheet-content shrink-0" style={{ transformOrigin: '50% 50%' }}>{children}</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Deity glyphs ───────────────────────────────────────────────────────────
   Deity icons are drawn from one fixed set rather than the device's emoji
   font. Device emoji vary: the flute 🪈 (2022) and lotus 🪷 (2021) are blank
   on older phones and Windows, and whatever the device draws is what goes
   into the PDF. The Twemoji SVGs in assets/deities/ (CC-BY 4.0, credited in
   the page footer) are bundled and set as INLINE svg: html2canvas would not
   draw them as <img> from a CDN, even with CORS, but exports inline svg fine
   (as it does the function motifs). The three that are text symbols, not
   emoji (or whose Twemoji art is a purple tile: ✝ ☪), use Google fonts that
   really contain them (checked glyph by glyph):
   ॐ Noto Serif Devanagari, ☬ ✝ ☪ Noto Sans Symbols, 卐 Noto Serif SC, loaded as
   a few-glyph subset in WeddingApp's font effect. */
const DEITY_SVGS = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/deities/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
    // Twemoji files carry only a viewBox; without a size an inline svg is 300×150.
    .map(([path, svg]) => [path.split('/').pop()!.replace('.svg', ''), svg.replace('<svg ', '<svg width="100%" height="100%" ')]),
) as Record<string, string>;
const TEXT_GLYPHS = ['ॐ', '☬', '卐', '✝', '☪'];
const SYMBOL_FONTS = "'Noto Serif Devanagari', 'Noto Sans Symbols', 'Noto Serif SC', serif";

function DeityGlyph({ glyph, title }: { glyph: string; title?: string }) {
  const file = [...glyph].map(ch => ch.codePointAt(0)!.toString(16)).filter(cp => cp !== 'fe0f').join('-');
  const svg = DEITY_SVGS[file];
  if (!svg) {
    return <span title={title} style={{ fontFamily: SYMBOL_FONTS, lineHeight: 1 }}>{glyph}</span>;
  }
  return (
    <span role="img" aria-label={title || glyph} title={title} dangerouslySetInnerHTML={{ __html: svg }}
      style={{ width: '1em', height: '1em', display: 'inline-block', verticalAlign: '-0.12em' }} />
  );
}

function DecorativeDivider({ compact, mini }: { compact?: boolean; mini?: boolean }) {
  const rule = mini ? 'w-10' : compact ? 'w-14' : 'w-24';
  const size = mini ? 14 : compact ? 16 : 20;
  return (
    <div className="flex items-center justify-center gap-2 mb-3" aria-hidden="true">
      <div className={`h-px ${rule}`} style={{ background: 'linear-gradient(90deg, transparent, rgba(192,137,46,0.18) 40%, #C0892E)' }} />
      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: '#C0892E', opacity: 0.55 }} />
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
        <path d="M12 2 L13.7 9 L21 12 L13.7 15 L12 22 L10.3 15 L3 12 L10.3 9 Z" fill="#C0892E" />
        <path d="M12 7.4 L12.8 11.2 L16.6 12 L12.8 12.8 L12 16.6 L11.2 12.8 L7.4 12 L11.2 11.2 Z" fill="#FFFFFF" opacity="0.55" />
      </svg>
      <span className="w-1 h-1 rounded-full shrink-0" style={{ background: '#C0892E', opacity: 0.55 }} />
      <div className={`h-px ${rule}`} style={{ background: 'linear-gradient(90deg, #C0892E, rgba(192,137,46,0.18) 60%, transparent)' }} />
    </div>
  );
}

/* ─── Function sheet artwork ─────────────────────────────────────────────────
   Line art for the separate function sheets, drawn in each function's own
   colour (PROGRAMME_PRESETS[].color). Single-colour strokes with at most a
   faint tint fill, so they print cleanly and a designer can retrace them.
   Every motif is drawn on a 120×120 grid. */

/** A flower outline of `n` rounded petals around (cx, cy) — the marigolds. */
function scallopPath(cx: number, cy: number, r: number, n: number): string {
  const pt = (a: number, rr: number) => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  let d = `M${pt(0, r)}`;
  for (let i = 0; i < n; i++) {
    const a1 = (i * 2 * Math.PI) / n, a2 = ((i + 1) * 2 * Math.PI) / n;
    d += ` Q${pt((a1 + a2) / 2, r * 1.45)} ${pt(a2, r)}`;
  }
  return d + ' Z';
}

/** A pointed leaf of length `len` from (0,0) along +x, with its midrib. */
const leaf = (len: number) => `M0 0 C${len * 0.3} ${-len * 0.22} ${len * 0.72} ${-len * 0.22} ${len} 0 C${len * 0.72} ${len * 0.22} ${len * 0.3} ${len * 0.22} 0 0 Z M2 0 H${len * 0.88}`;

function MotifArt({ preset, color }: { preset: string; color: string }) {
  const tint = { fill: color, fillOpacity: 0.13 };
  const solid = { fill: color, stroke: 'none' };
  const dots = { strokeDasharray: '0 5.5', strokeWidth: 2.6 };
  const thin = { strokeWidth: 1.3 };
  switch (preset) {
    case 'wedding':   // a mandap over the sacred fire
      return (<>
        <path d="M24 48 Q26 26 60 15 Q94 26 96 48 Z" {...tint} />
        <path d="M36 44 Q40 32 60 25 Q80 32 84 44" {...thin} />
        <path d="M60 15 V9" /><circle cx="60" cy="6.5" r="2.4" {...solid} />
        <path d="M21 48 H99" />
        <path d="M36 52 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0" {...thin} />
        <path d="M44 57 V63 M60 58 V66 M76 57 V63" {...thin} />
        <circle cx="44" cy="65" r="1.6" {...solid} /><circle cx="60" cy="68" r="1.8" {...solid} /><circle cx="76" cy="65" r="1.6" {...solid} />
        <path d="M27 52 H39 M81 52 H93" />
        <path d="M30 52 V100 M36 52 V100 M84 52 V100 M90 52 V100" />
        <path d="M27 100 H39 M81 100 H93" />
        <path d="M60 92 C52 86 54 78 60 70 C66 78 68 86 60 92 Z" {...tint} />
        <path d="M60 89 C57.5 86 58 82 60 78 C62 82 62.5 86 60 89 Z" {...solid} />
        <path d="M49 100 L53 93 H67 L71 100" />
        <path d="M18 100 H102" /><path d="M12 106 H108" />
      </>);
    case 'reception':   // a chandelier with a beaded swag
      return (<>
        <path d="M60 3 V20" /><circle cx="60" cy="24" r="4" /><path d="M60 28 V38" />
        <path d="M44 42 H76 L69 54 H51 Z" {...tint} />
        <path d="M51 52 C38 62 22 60 20 46" /><path d="M69 52 C82 62 98 60 100 46" />
        <path d="M54 54 C47 70 36 70 36 60" /><path d="M66 54 C73 70 84 70 84 60" />
        {[20, 100, 36, 84].map((x, i) => {
          const y = i < 2 ? 46 : 60;
          return (<g key={x}>
            <path d={`M${x - 5} ${y} H${x + 5} L${x + 3} ${y + 3} H${x - 3} Z`} {...tint} />
            <path d={`M${x - 1.8} ${y} V${y - 9} H${x + 1.8} V${y}`} {...thin} />
            <path d={`M${x} ${y - 11} C${x - 3} ${y - 14} ${x - 1} ${y - 18} ${x} ${y - 20} C${x + 1} ${y - 18} ${x + 3} ${y - 14} ${x} ${y - 11} Z`} {...solid} />
          </g>);
        })}
        <path d="M24 52 Q42 80 60 74 Q78 80 96 52" {...dots} />
        <path d="M60 54 V72" /><path d="M60 72 L65 80 L60 90 L55 80 Z" {...tint} />
        <path d="M47 60 V68 M73 60 V68" {...thin} />
        <circle cx="47" cy="70.5" r="2" {...solid} /><circle cx="73" cy="70.5" r="2" {...solid} />
        <path d="M60 96 V100" {...thin} /><circle cx="60" cy="103" r="2" {...solid} />
      </>);
    case 'mehendi': {   // a paisley in a ring of dots, on vines
      const paisley = 'M58 104 C34 104 24 84 30 66 C36 48 58 42 66 28 C70 20 69 13 64 8 C84 16 94 38 92 62 C90 88 76 104 58 104 Z';
      return (<>
        <path d={paisley} {...tint} />
        <path d={paisley} transform="translate(60 66) scale(1.16) translate(-60 -64)" {...dots} />
        <path d={paisley} transform="translate(61 76) scale(0.58) translate(-60 -64)" {...thin} />
        <circle cx="60" cy="80" r="5" /><circle cx="60" cy="80" r="1.8" {...solid} />
        <path d="M54 62 Q60 54 70 52 M52 70 Q56 66 62 64" {...thin} />
        <path d="M26 112 C18 104 14 96 14 84" /><path d="M94 112 C102 104 106 96 106 84" />
        {[[14, 84, -80], [16, 98, -140], [22, 106, 170], [106, 84, -100], [104, 98, -40], [98, 106, 10]].map(([x, y, r]) => (
          <path key={`${x}-${y}`} d={leaf(13)} transform={`translate(${x} ${y}) rotate(${r})`} {...tint} />
        ))}
      </>);
    }
    case 'haldi':   // a turmeric pot crowned with marigolds
      return (<>
        {[[-118, 40, 44], [-62, 80, 44]].map(([r, x, y]) => <path key={x} d={leaf(18)} transform={`translate(${x} ${y}) rotate(${r})`} {...tint} />)}
        {[[44, 40, 9.5], [76, 40, 9.5], [60, 28, 11]].map(([x, y, r]) => (
          <g key={`${x}-${y}`}>
            <path d={scallopPath(x, y, r, 11)} fill="#FFFFFF" />
            <path d={scallopPath(x, y, r, 11)} {...tint} />
            <path d={scallopPath(x, y, r * 0.58, 8)} {...thin} />
            <circle cx={x} cy={y} r={r * 0.22} {...solid} />
          </g>
        ))}
        <path d="M36 68 C20 78 22 104 42 110 H78 C98 104 100 78 84 68 Z" {...tint} />
        <path d="M42 68 C44 63 44 61 40 57 H80 C76 61 76 63 78 68" fill="#FFFFFF" />
        <path d="M35 57 H85" />
        <path d="M28 86 Q44 93 60 86 Q76 79 92 86" {...thin} />
        <path d="M30 96 H90" {...dots} />
      </>);
    case 'ladiessangeet':   // a dholak with notes rising
      return (<>
        <path d="M26 54 Q60 44 94 54 V88 Q60 98 26 88 Z" {...tint} />
        <path d="M26 54 Q60 44 94 54 M26 88 Q60 98 94 88" />
        <ellipse cx="26" cy="71" rx="6" ry="17" fill="#FFFFFF" /><ellipse cx="94" cy="71" rx="6" ry="17" fill="#FFFFFF" />
        <ellipse cx="94" cy="71" rx="2.5" ry="9" {...thin} />
        <path d="M44 49.5 Q46.5 71 44 92.5 M76 49.5 Q78.5 71 76 92.5" />
        <path d="M30 56 L44 86 M44 56 L30 86 M76 56 L90 86 M90 56 L76 86" {...thin} />
        <path d="M48 52 L60 90 L72 52" {...thin} />
        <ellipse cx="42" cy="34" rx="5" ry="3.6" transform="rotate(-22 42 34)" {...solid} />
        <ellipse cx="62" cy="28" rx="5" ry="3.6" transform="rotate(-22 62 28)" {...solid} />
        <path d="M46.5 32.5 V12 L66.5 6 V26.5" /><path d="M46.5 17 L66.5 11" />
        <ellipse cx="86" cy="36" rx="4.5" ry="3.2" transform="rotate(-22 86 36)" {...solid} />
        <path d="M90 34.5 V18 Q96 22 98 28" />
      </>);
    case 'engagement':
    case 'ring':   // two linked rings, one set with a stone
      return (<>
        <circle cx="47" cy="74" r="25" strokeWidth="3" /><circle cx="47" cy="74" r="20.5" {...thin} />
        <circle cx="73" cy="74" r="25" strokeWidth="3" /><circle cx="73" cy="74" r="20.5" {...thin} />
        <path d="M65 44 L69.5 37 H76.5 L81 44 L73 54 Z" fill="#FFFFFF" />
        <path d="M65 44 L69.5 37 H76.5 L81 44 L73 54 Z" {...tint} />
        <path d="M65 44 H81 M69.5 37 L73 44 L76.5 37 M73 44 V54" {...thin} />
        <path d="M73 25 V30 M60 32 L63.5 35.5 M86 32 L82.5 35.5" {...thin} />
        <path d="M26 30 L28 36 L34 38 L28 40 L26 46 L24 40 L18 38 L24 36 Z" {...solid} />
        <path d="M98 94 L99.3 98 L103 99.3 L99.3 100.6 L98 104.6 L96.7 100.6 L93 99.3 L96.7 98 Z" {...solid} />
      </>);
    case 'thread':   // the sacred thread: a three-strand loop and its knot
      return (<>
        <ellipse cx="60" cy="60" rx="44" ry="20" transform="rotate(-38 60 60)" />
        <ellipse cx="60" cy="60" rx="40" ry="16" transform="rotate(-38 60 60)" strokeDasharray="7 4" {...thin} />
        <ellipse cx="60" cy="60" rx="36" ry="12" transform="rotate(-38 60 60)" />
        <circle cx="86" cy="83" r="7" fill="#FFFFFF" /><circle cx="86" cy="83" r="7" {...tint} />
        <path d="M80 80 C84 74 92 76 90 83 C88 90 80 90 82 84 C83 80 88 81 87 85" {...thin} />
        <path d="M89 89 C92 96 90 102 86 106 M84 90 C84 97 80 101 76 103" />
        <circle cx="30" cy="28" r="3.2" {...solid} /><circle cx="22" cy="40" r="2" {...solid} /><circle cx="40" cy="20" r="2" {...solid} />
      </>);
    case 'garba':   // crossed dandiya sticks under a ring of dancers' dots
      return (<>
        <path d="M18 30 Q60 -2 102 30" {...dots} />
        {[34, -34].map(r => (
          <g key={r} transform={`rotate(${r} 60 66)`}>
            <rect x="56.5" y="18" width="7" height="90" rx="3.5" fill="#FFFFFF" />
            <rect x="56.5" y="18" width="7" height="90" rx="3.5" {...tint} />
            <path d="M56.5 28 H63.5 M56.5 32 H63.5 M56.5 58 H63.5 M56.5 62 H63.5 M56.5 66 H63.5 M56.5 92 H63.5 M56.5 96 H63.5" {...thin} />
            <path d="M60 108 L54 118 M60 108 L60 119 M60 108 L66 118" {...thin} />
            <circle cx="60" cy="108" r="1.8" {...solid} />
          </g>
        ))}
        <circle cx="60" cy="66" r="4" {...solid} />
      </>);
    case 'cocktail':   // two flutes raised in a toast
      return (<>
        {[[36, 16], [84, -16]].map(([x, r]) => (
          <g key={x} transform={`translate(${x} 76) rotate(${r})`}>
            <path d="M-11 -46 C-11 -18 -7 -4 0 -2 C7 -4 11 -18 11 -46 Z" fill="#FFFFFF" />
            <path d="M-10.6 -32 C-10 -16 -6 -5 0 -3 C6 -5 10 -16 10.6 -32 Z" {...tint} />
            <path d="M-11 -46 C-11 -18 -7 -4 0 -2 C7 -4 11 -18 11 -46 Z" />
            <path d="M-10.6 -32 H10.6" {...thin} />
            <circle cx="-3" cy="-22" r="1.3" {...thin} /><circle cx="3" cy="-14" r="1.1" {...thin} /><circle cx="1" cy="-26" r="0.9" {...thin} />
            <path d="M0 -2 V30" /><path d="M-11 32 Q0 27 11 32" />
          </g>
        ))}
        <path d="M60 8 V18 M50 14 L54 20 M70 14 L66 20" {...thin} />
        <path d="M60 22 L61.5 25.5 L65 27 L61.5 28.5 L60 32 L58.5 28.5 L55 27 L58.5 25.5 Z" {...solid} />
      </>);
    case 'matakijyot':
    case 'chowki':   // a diya with its flame and rays
      return (<>
        {Array.from({ length: 7 }, (_, i) => {
          const a = ((-160 + i * (140 / 6)) * Math.PI) / 180;
          const p = (rr: number) => `${(60 + rr * Math.cos(a)).toFixed(1)} ${(54 + rr * Math.sin(a)).toFixed(1)}`;
          return <path key={i} d={`M${p(28)} L${p(i % 2 ? 34 : 38)}`} {...thin} />;
        })}
        <path d="M60 78 C47 66 52 50 60 33 C68 50 73 66 60 78 Z" {...tint} />
        <path d="M60 74 C55 68 56 60 60 51 C64 60 65 68 60 74 Z" {...solid} />
        <path d="M20 80 Q60 70 100 80 Q98 101 60 103 Q22 101 20 80 Z" {...tint} />
        <path d="M20 80 Q60 90 100 80" {...thin} />
        <path d="M32 92 Q60 99 88 92" {...dots} />
        <path d="M48 103 L44 111 H76 L72 103" />
      </>);
    case 'satyanarayan':   // a kalash with coconut and mango leaves
      return (<>
        {[[-168, 50, 56], [-140, 52, 54], [-12, 70, 56], [-40, 68, 54]].map(([r, x, y]) => (
          <path key={r} d={leaf(30)} transform={`translate(${x} ${y}) rotate(${r})`} {...tint} />
        ))}
        <ellipse cx="60" cy="40" rx="13" ry="16" fill="#FFFFFF" />
        <ellipse cx="60" cy="40" rx="13" ry="16" {...tint} />
        <path d="M54 29 Q51 40 54 52 M66 29 Q69 40 66 52" {...thin} />
        <path d="M60 24 C57 18 63 14 60 9" />
        <path d="M40 72 C22 82 24 106 44 112 H76 C96 106 98 82 80 72 Z" {...tint} />
        <path d="M44 72 C46 66 46 64 42 60 H78 C74 64 74 66 76 72" fill="#FFFFFF" />
        <path d="M37 59 H83" />
        <path d="M30 86 H90" {...dots} />
        <circle cx="60" cy="98" r="6" {...thin} /><circle cx="60" cy="98" r="2" {...solid} />
      </>);
    case 'pathbhog':   // an open book with a lotus — no sacred symbols drawn
      return (<>
        <path d="M60 58 C48 57 37 48 34 35 C46 37 55 45 60 58 Z" {...tint} />
        <path d="M60 58 C72 57 83 48 86 35 C74 37 65 45 60 58 Z" {...tint} />
        <path d="M60 58 C45 61 31 56 24 47 C37 45 51 49 60 58 Z" {...tint} />
        <path d="M60 58 C75 61 89 56 96 47 C83 45 69 49 60 58 Z" {...tint} />
        <path d="M60 58 C51 48 51 33 60 21 C69 33 69 48 60 58 Z" fill="#FFFFFF" />
        <path d="M60 58 C51 48 51 33 60 21 C69 33 69 48 60 58 Z" {...tint} />
        <circle cx="60" cy="13" r="1.8" {...solid} /><circle cx="48" cy="17" r="1.3" {...solid} /><circle cx="72" cy="17" r="1.3" {...solid} />
        <path d="M60 100 C48 92 32 90 16 94 V64 C32 60 48 62 60 70 Z" fill="#FFFFFF" />
        <path d="M60 100 C72 92 88 90 104 94 V64 C88 60 72 62 60 70 Z" fill="#FFFFFF" />
        <path d="M60 100 C48 92 32 90 16 94 V64 C32 60 48 62 60 70 Z M60 100 C72 92 88 90 104 94 V64 C88 60 72 62 60 70 Z M60 70 V100" />
        <path d="M24 74 C34 71 44 72 52 77 M24 81 C34 78 44 79 52 84 M24 88 C34 85 44 86 52 91 M96 74 C86 71 76 72 68 77 M96 81 C86 78 76 79 68 84 M96 88 C86 85 76 86 68 91" {...thin} />
        <path d="M12 98 C30 94 48 96 60 106 C72 96 90 94 108 98" />
      </>);
    default: {   // custom and anything unknown: an eight-petal rosette
      return (<>
        {Array.from({ length: 8 }, (_, i) => (
          <path key={`l${i}`} d={leaf(16)} transform={`rotate(${i * 45 + 22.5} 60 60) translate(60 60) translate(30 0)`} {...tint} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d="M60 60 C52 50 52 36 60 24 C68 36 68 50 60 60 Z" transform={`rotate(${i * 45} 60 60)`} {...tint} />
        ))}
        <circle cx="60" cy="60" r="15" {...dots} />
        <circle cx="60" cy="60" r="8" fill="#FFFFFF" /><circle cx="60" cy="60" r="8" />
        <circle cx="60" cy="60" r="3" {...solid} />
      </>);
    }
  }
}

/** The artwork at the top of a separate function sheet. */
function FunctionMotif({ preset, color, size }: { preset: string; color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={2.1}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 overflow-visible">
      <MotifArt preset={preset} color={color} />
    </svg>
  );
}

/** A thin rule with a lozenge, in the function's colour. */
function SheetRule({ color, small }: { color: string; small?: boolean }) {
  const w = small ? 28 : 44;
  return (
    <div className="flex items-center justify-center gap-1.5 my-3" aria-hidden="true">
      <div className="h-px" style={{ width: w, background: `linear-gradient(90deg, transparent, ${color})` }} />
      <svg width="9" height="9" viewBox="0 0 10 10"><path d="M5 0 L10 5 L5 10 L0 5 Z" fill={color} /></svg>
      <div className="h-px" style={{ width: w, background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </div>
  );
}

/** Filigree corners for a function sheet, sitting just inside paper()'s gold
 *  borders. Sized off the sheet's own short side (it is laid out at real
 *  size), so a big card gets proportionally bigger corners. */
function SheetOrnament({ color, size }: { color: string; size: CardSize }) {
  const s = Math.round(Math.min(110, Math.max(46, Math.min(size.widthIn, size.heightIn) * PX_PER_IN * 0.15)));
  const corner = (
    <svg width={s} height={s} viewBox="0 0 100 100" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6 H70 M6 6 V70" strokeWidth="1.6" />
      <path d="M12 12 H38 M12 12 V38" strokeWidth="0.9" />
      <path d="M14 48 Q14 14 48 14" strokeWidth="1.1" />
      <path d="M48 14 C57 14 61 21 56 25 C52 28 48 24 51 21" strokeWidth="1.1" />
      <path d="M14 48 C14 57 21 61 25 56 C28 52 24 48 21 51" strokeWidth="1.1" />
      <path d="M17 17 C30 20 38 28 42 42 C28 38 20 30 17 17 Z" fill={color} fillOpacity="0.16" strokeWidth="1.2" />
      <path d="M21 21 L36 36" strokeWidth="0.8" />
      <path d="M28 18 C34 16 40 18 44 22 M18 28 C16 34 18 40 22 44" strokeWidth="0.9" />
      <circle cx="76" cy="6" r="2.2" fill={color} stroke="none" /><circle cx="6" cy="76" r="2.2" fill={color} stroke="none" />
      <circle cx="83" cy="6" r="1.2" fill={color} stroke="none" /><circle cx="6" cy="83" r="1.2" fill={color} stroke="none" />
      <circle cx="47" cy="47" r="1.8" fill={color} stroke="none" />
    </svg>
  );
  const at = (pos: React.CSSProperties, flip: string) => (
    <div className="absolute pointer-events-none" style={{ ...pos, transform: flip, opacity: 0.85 }}>{corner}</div>
  );
  const inset = 22;
  return (
    <div aria-hidden="true">
      {at({ top: inset, left: inset }, 'none')}
      {at({ top: inset, right: inset }, 'scaleX(-1)')}
      {at({ bottom: inset, left: inset }, 'scaleY(-1)')}
      {at({ bottom: inset, right: inset }, 'scale(-1, -1)')}
    </div>
  );
}

/** Opens a Gmail compose tab with the draft pre-filled.
 *
 *  Deliberately NOT `mailto:`. That hands the draft to whatever app Windows has
 *  registered for the scheme — on the studio machine an Outlook association
 *  nobody uses — and when that handler is missing or declined the click does
 *  nothing at all, with no way for us to detect it. A normal https link always
 *  lands somewhere the user can see.
 *
 *  It also lifts the length ceiling: a `mailto:` body is silently truncated
 *  past roughly 2000 characters, so the full matter rarely fitted. A Gmail URL
 *  carries it comfortably, and `fallback` now only applies to genuinely huge
 *  matters. Called from a click handler, so the popup blocker allows it. */
function openMailDraft(subject: string, body: string, fallback: string) {
  const build = (b: string) =>
    `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`;
  const url = build(body);
  window.open(url.length > 7500 ? build(fallback) : url, '_blank', 'noopener');
}

/** Every card page under `root`, rendered once. html2canvas is the expensive
 *  part of an export, so the PNGs and the PDF are both built from these rather
 *  than rendering the card twice. */
interface CardCanvas { canvas: HTMLCanvasElement; widthIn: number; heightIn: number }

async function cardCanvases(root: HTMLElement): Promise<CardCanvas[]> {
  // html2canvas-pro, not html2canvas: the original draws fonts with built-in
  // line spacing (Tangerine, Great Vibes, Cormorant) ~0.4em too low, which put
  // the rule under "Weds" through the middle of the word in every PDF.
  const { default: html2canvas } = await import('html2canvas-pro');
  // Each rendered card page carries .wmp-card-page. Selecting on that rather
  // than root.children matters: the ref wraps CardPreview, whose own root is a
  // single spacing container, so children[] is one element holding both pages.
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.wmp-card-page'));
  const targets = pages.length ? pages : [root];
  const out: CardCanvas[] = [];
  for (const el of targets) {
    // Sheets are laid out at PX_PER_IN, so ~3× is roughly 300dpi print quality.
    // Capped near 16 megapixels, past which iOS Safari silently draws nothing.
    const scale = Math.min(3, Math.sqrt(16_000_000 / Math.max(1, el.offsetWidth * el.offsetHeight)));
    const canvas = await html2canvas(el, {
      scale, backgroundColor: '#ffffff', useCORS: true,
      // On screen the sheet sits inside a scale() that fits it to the preview
      // column. Captured as-is, html2canvas would measure that shrunken box and
      // render the sheet mis-sized inside it; so the clone drops the view scale
      // (and any hover lift) and is captured at its true physical size. The
      // fit is then re-run, because the clone's iframe has its own viewport
      // and font loading and could wrap a line differently from the screen.
      //
      // Box shadows go too, as they do in the print stylesheet: they are screen
      // chrome, and html2canvas paints the sheet's inset edge-ring shadow as a
      // solid tint across the whole card.
      onclone: (doc, clone) => {
        const style = doc.createElement('style');
        style.textContent = '.wmp-card-page, .wmp-card-page * { box-shadow: none !important; }';
        doc.head.appendChild(style);
        const scaler = clone.closest<HTMLElement>('.wmp-sheet-scaler');
        if (scaler) scaler.style.transform = 'none';
        if (clone.classList.contains('wmp-card-page')) {
          clone.style.transform = 'none';
          fitSheetContent(clone);
        }
      },
    });
    out.push({
      canvas,
      widthIn: Number(el.dataset.widthIn) || el.offsetWidth / PX_PER_IN,
      heightIn: Number(el.dataset.heightIn) || el.offsetHeight / PX_PER_IN,
    });
  }
  return out;
}

// Lets a headless check drive the real export path (the buttons only exist
// after submitting an order). Dev server only; production builds drop it.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__wmpCardCanvases = cardCanvases;

async function cardPngFiles(pages: CardCanvas[], base: string): Promise<File[]> {
  const files: File[] = [];
  for (let i = 0; i < pages.length; i++) {
    const blob = await new Promise<Blob | null>(res => pages[i].canvas.toBlob(res, 'image/png'));
    if (blob) {
      const name = pages.length > 1 ? `${base}-page-${i + 1}.png` : `${base}.png`;
      files.push(new File([blob], name, { type: 'image/png' }));
    }
  }
  return files;
}

/** One PDF page per card page, at the card's real trim size in inches, so a
 *  printer can print it at 100% and get the right card. */
async function cardPdfFile(pages: CardCanvas[], base: string): Promise<File | null> {
  if (!pages.length) return null;
  const { jsPDF } = await import('jspdf');
  let doc: InstanceType<typeof jsPDF> | null = null;
  for (const { canvas, widthIn, heightIn } of pages) {
    // jsPDF swaps the format's sides to match `orientation`, so it has to agree with them.
    const orientation = widthIn > heightIn ? 'l' : 'p';
    if (!doc) {
      doc = new jsPDF({ orientation, unit: 'in', format: [widthIn, heightIn], compress: true });
    } else {
      doc.addPage([widthIn, heightIn], orientation);
    }
    // JPEG, not PNG: jsPDF stores a PNG as raw uncompressed pixels (~12 MB a
    // page at print resolution, 60 MB for a 5-page card), which older
    // importers such as CorelDRAW X4 choke on and report as corrupt. A JPEG
    // (DCTDecode) page is ~0.5 MB and readable by every PDF consumer. The
    // card is opaque white, so dropping alpha loses nothing.
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, widthIn, heightIn, undefined, 'NONE');
  }
  return doc ? new File([doc.output('blob')], `${base}.pdf`, { type: 'application/pdf' }) : null;
}

/** The card as shareable files: one PNG per page, plus a single PDF holding
 *  every page. Both formats go along because they get used differently — the
 *  PNGs preview inline in a chat or mail body, the PDF is what a printer or
 *  designer wants. */
async function cardFiles(root: HTMLElement, base: string): Promise<File[]> {
  const pages = await cardCanvases(root);
  const pdf = await cardPdfFile(pages, base);
  return [...await cardPngFiles(pages, base), ...(pdf ? [pdf] : [])];
}

/** Whether the OS share sheet will both carry these files AND be likely to
 *  offer Gmail or WhatsApp — in practice, a phone. Desktop Chrome also reports
 *  it can share files, but the Windows sheet lists installed apps only, so the
 *  studio would be offered Mail and OneNote rather than Gmail; there the mail
 *  draft plus a download is the more useful path. */
function canShareCardFiles(files: File[]): boolean {
  const uaMobile = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  const mobile = uaMobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return mobile && typeof navigator.share === 'function' && !!navigator.canShare?.({ files });
}

function downloadFiles(files: File[]) {
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

/** Downloads the matter as a Word document. Self-contained (its own busy
 *  state), styled by the caller to match the export buttons around it. */
function DocxDownloadButton({ form, base, order, c, className, style }: {
  form: FormState; base: string; order?: { orderId: string; at: string; status?: string };
  c: Palette; className: string; style: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      downloadFiles([await matterDocxFile(form, base, order)]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={download} disabled={busy} className={className} style={style} {...focusRing(`${c.gold}55`)}>
      {busy
        ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Preparing…</>
        : <><FileText className="w-4 h-4" aria-hidden="true" /> Word document (.docx)</>}
    </button>
  );
}

/** Sends the matter and the card files together.
 *
 *  On a phone the OS share sheet takes text and files in one go, so picking
 *  Gmail or WhatsApp there genuinely attaches the card. Anywhere else this is
 *  not possible from a web page: neither `mailto:` nor Gmail's compose URL
 *  accepts an attachment, and no site can attach to Gmail without the Gmail
 *  API and an OAuth consent flow. So the desktop path saves the files and
 *  opens the draft, leaving one drag to the user rather than pretending the
 *  attachment happened. Returns which of the two actually ran. */
async function shareMatterAndCard(opts: {
  root: HTMLElement; base: string; subject: string; body: string; fallback: string;
}): Promise<'shared' | 'downloaded'> {
  const files = await cardFiles(opts.root, opts.base);
  if (files.length && canShareCardFiles(files)) {
    try {
      await navigator.share({ files, title: opts.subject, text: opts.body });
      return 'shared';
    } catch (err) {
      // Dismissing the sheet is a choice, not a failure — don't then dump
      // downloads and a mail draft on someone who just backed out.
      if ((err as Error)?.name === 'AbortError') return 'shared';
    }
  }
  downloadFiles(files);
  openMailDraft(opts.subject, opts.body, opts.fallback);
  return 'downloaded';
}

/* ─── Success ────────────────────────────────────────────────────────────── */
function Success({ submitted, c, form, dark, onReset }: { submitted: SubmittedOrder; c: Palette; form: FormState; dark: boolean; onReset: () => void }) {
  const corel = generateCorelText(form);
  const [copied, setCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareHint, setShareHint] = useState<'shared' | 'downloaded' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const copyId = () => { navigator.clipboard?.writeText(submitted.orderId); setIdCopied(true); setTimeout(() => setIdCopied(false), 1600); };
  // Names are free text, so strip the characters Windows/macOS reject in filenames.
  const fileBase = [submitted.orderId, form.bride.name, form.groom.name]
    .filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-');
  const downloadPng = async () => {
    if (!previewRef.current || downloadingPng) return;
    setDownloadingPng(true);
    try {
      // One PNG per page, each at the card's proportions. Capturing the whole
      // preview instead would stack the pages with their screen labels, and at
      // the preview's on-screen scale.
      downloadFiles(await cardPngFiles(await cardCanvases(previewRef.current), fileBase));
    } finally {
      setDownloadingPng(false);
    }
  };
  const shareEmail = async () => {
    if (!previewRef.current || sharing) return;
    setSharing(true);
    try {
      const couple = [form.bride.name, form.groom.name].filter(Boolean).join(' & ');
      const heading = `Order Number: ${submitted.orderId}\nCouple: ${couple || '—'}\nSubmitted: ${submitted.at}`;
      setShareHint(await shareMatterAndCard({
        root: previewRef.current,
        base: fileBase,
        subject: `Wedding Matter ${submitted.orderId}${couple ? ` — ${couple}` : ''}`,
        body: `${heading}\n\n${corel}\n\n— Wedding Matter Pro`,
        fallback: `${heading}\n\nThe full matter was too long for one draft. Use "Copy Export" on the confirmation page and paste it below this line.\n\n— Wedding Matter Pro`,
      }));
    } finally {
      setSharing(false);
    }
  };
  const shareWA = () => {
    const text = encodeURIComponent(`🌹 *New Wedding Matter Order*\n\n*Order ID:* ${submitted.orderId}\n*Couple:* ${form.bride.name} ❤️ ${form.groom.name}\n*Submitted:* ${submitted.at}\n\n_Wedding Matter Pro_`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const steps = [
    { icon: FileText, title: 'With the designer', body: 'Your matter is already in the studio queue, exactly as you typed it.' },
    { icon: Eye,      title: 'Proof for approval', body: 'You will be shown a proof of the finished card before anything is printed.' },
    { icon: Printer,  title: 'Printing begins',    body: 'Once you approve the proof, your invitations go to print.' },
  ];

  const panel: React.CSSProperties = { borderColor: c.border, background: c.surface };

  return (
    <div className="max-w-3xl mx-auto px-1 pt-8 sm:pt-12 pb-24">
      {/* Seal */}
      <div className="relative flex justify-center mb-7">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-56 h-56 rounded-full" style={{ background: `radial-gradient(circle, ${c.gold}26 0%, transparent 68%)` }} />
        </div>
        <motion.div
          initial={reduce ? false : { scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: 'easeOut' }}
          className="relative"
          style={{ width: 108, height: 108 }}
        >
          <div className="absolute inset-0 rounded-full" style={{ border: `1px solid ${c.gold}66` }} />
          <div className="absolute inset-[5px] rounded-full" style={{ border: `1px solid ${c.gold}33` }} />
          <div className="absolute inset-[11px] rounded-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 22px 55px -18px ${c.primary}` }}>
            <Check className="w-12 h-12" style={{ color: c.onAccent }} strokeWidth={2.5} aria-hidden="true" />
          </div>
        </motion.div>
      </div>

      {/* Headline */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.15, ease: 'easeOut' }}
        className="text-center"
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.34em] mb-3" style={{ color: c.gold }}>Order Received</div>
        <h1 className="font-medium leading-[1.05]" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(2.4rem, 9vw, 3.6rem)', color: c.text }}>
          Beautifully <em style={{ fontFamily: "'Italianno', cursive", color: c.gold, fontSize: '1.3em', lineHeight: 0.8, fontStyle: 'normal' }}>done!</em>
        </h1>
        {form.bride.name && form.groom.name && (
          <div className="mt-3" style={{ fontFamily: "'Italianno', cursive", color: c.gold, fontSize: 'clamp(2rem, 8vw, 2.8rem)', lineHeight: 1.1 }}>
            {form.bride.name} & {form.groom.name}
          </div>
        )}
        <p className="text-base font-medium mt-3 leading-relaxed max-w-md mx-auto" style={{ color: c.subtext }}>
          Your wedding matter is safely with our designers. Nothing more is needed from you right now.
        </p>
      </motion.div>

      <Divider c={c} />

      {/* Order number */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.25, ease: 'easeOut' }}
        className="relative rounded-3xl border shadow-2xl mt-7 px-6 py-7 text-center overflow-hidden"
        style={panel}
      >
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.gold}, transparent)` }} aria-hidden="true" />
        <div className="text-[10px] uppercase tracking-[0.34em] font-bold mb-3" style={{ color: c.subtext }}>Your Order Number</div>
        <div className="font-mono font-bold tracking-[0.16em] leading-none" style={{ color: c.gold, fontSize: 'clamp(2.2rem, 10vw, 3rem)' }}>
          {submitted.orderId}
        </div>
        <div className="text-sm mt-3 font-semibold" style={{ color: c.subtext }}>Submitted {submitted.at}</div>
        <button
          type="button"
          onClick={copyId}
          className="inline-flex items-center gap-2 mt-5 px-5 rounded-full border text-xs font-bold uppercase tracking-[0.14em] transition hover:opacity-80"
          style={{ minHeight: 44, borderColor: c.border, color: idCopied ? c.gold : c.text, background: idCopied ? `${c.gold}12` : 'transparent' }}
          {...focusRing(`${c.gold}55`)}
        >
          {idCopied ? <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy order number</>}
        </button>
        <div className="text-xs mt-4 font-medium leading-snug max-w-sm mx-auto" style={{ color: c.subtext }}>
          Keep this number safe — quote it whenever you contact the studio about your card.
        </div>
      </motion.div>

      {/* Share / copy */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.33, ease: 'easeOut' }}
        className="mt-4"
      >
        <button onClick={shareWA}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl text-white font-bold text-sm transition hover:opacity-90"
          style={{ minHeight: 54, background: 'linear-gradient(135deg, #1DA851, #128C3E)', boxShadow: '0 14px 32px -16px #128C3E' }}
          {...focusRing('#1DA85166')}>
          <MessageCircle className="w-5 h-5" aria-hidden="true" /> Share on WhatsApp
        </button>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <button onClick={shareEmail} disabled={sharing}
            className="flex items-center justify-center gap-2 rounded-2xl font-bold text-sm border transition hover:opacity-80 disabled:opacity-60 disabled:cursor-wait"
            style={{ minHeight: 54, borderColor: c.border, color: c.text, background: c.surface }}
            {...focusRing(`${c.gold}55`)}>
            {sharing
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Preparing…</>
              : <><Mail className="w-4 h-4" aria-hidden="true" /> Email with card</>}
          </button>
          <button onClick={downloadPng} disabled={downloadingPng}
            className="flex items-center justify-center gap-2 rounded-2xl font-bold text-sm border transition hover:opacity-80 disabled:opacity-60 disabled:cursor-wait"
            style={{ minHeight: 54, borderColor: c.border, color: c.text, background: c.surface }}
            {...focusRing(`${c.gold}55`)}>
            {downloadingPng
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Preparing…</>
              : <><Download className="w-4 h-4" aria-hidden="true" /> Download Image</>}
          </button>
          <button onClick={copy}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 rounded-2xl font-bold text-sm border-2 transition hover:opacity-80"
            style={{ minHeight: 54, borderColor: c.gold, color: c.gold, background: `${c.gold}12` }}
            {...focusRing(`${c.gold}55`)}>
            {copied ? <><Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" /> Copied!</> : <><Copy className="w-4 h-4" aria-hidden="true" /> Copy Export</>}
          </button>
        </div>
        <DocxDownloadButton form={form} base={fileBase} order={submitted} c={c}
          className="w-full mt-3 flex items-center justify-center gap-2 rounded-2xl font-bold text-sm border transition hover:opacity-80 disabled:opacity-60 disabled:cursor-wait"
          style={{ minHeight: 54, borderColor: c.border, color: c.text, background: c.surface }} />
        <p className="text-xs mt-3 text-center font-medium leading-snug max-w-md mx-auto" style={{ color: c.subtext }}>
          WhatsApp and Gmail open pre-filled with your order details as text — neither can attach the card, so download the image if you want to send the card itself.
        </p>
      </motion.div>

      {/* What happens next */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.41, ease: 'easeOut' }}
        className="rounded-3xl border shadow-xl mt-4 p-6 sm:p-7"
        style={panel}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-5 text-center" style={{ color: c.gold }}>What happens next</div>
        <ol className="relative space-y-6">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.title} className="relative flex gap-4">
                {i < steps.length - 1 && (
                  <span className="absolute left-[21px] top-11 bottom-[-24px] w-px" style={{ background: `linear-gradient(180deg, ${c.gold}55, ${c.gold}12)` }} aria-hidden="true" />
                )}
                <span className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center relative z-10"
                  style={{ background: `${c.gold}14`, border: `1px solid ${c.gold}55` }}>
                  <Icon className="w-5 h-5" style={{ color: c.gold }} aria-hidden="true" />
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block font-medium leading-tight" style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.35rem', color: c.text }}>{s.title}</span>
                  <span className="block text-sm mt-1 font-medium leading-relaxed" style={{ color: c.subtext }}>{s.body}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </motion.div>

      {/* The finished card */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.49, ease: 'easeOut' }}
        className="rounded-3xl border shadow-xl mt-4 p-4 sm:p-6"
        style={panel}
      >
        <div className="text-center mb-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: c.gold }}>Your Card</div>
          <div className="text-sm mt-1.5 font-medium" style={{ color: c.subtext }}>Exactly the matter our designer received</div>
        </div>
        {/* NOTE: this div must contain ONLY <CardPreview /> — the PNG download
            captures each .wmp-card-page inside it exactly as it is rendered. */}
        <div ref={previewRef}>
          <CardPreview form={form} c={c} dark={dark} compact />
        </div>
      </motion.div>

      {/* Designer export (secondary) */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : 0.57, ease: 'easeOut' }}
        className="rounded-3xl border mt-4 overflow-hidden"
        style={panel}
      >
        <div className="flex items-center justify-between gap-3 p-4 sm:px-6">
          <button
            type="button"
            onClick={() => setShowExport(v => !v)}
            aria-expanded={showExport}
            className="flex items-center gap-2 min-w-0 text-left transition hover:opacity-80"
            style={{ minHeight: 44 }}
            {...focusRing(`${c.gold}55`)}
          >
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-300 ${showExport ? 'rotate-180' : ''}`} style={{ color: c.gold }} aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-[0.26em] truncate" style={{ color: c.gold }}>Designer Export (CorelDRAW)</span>
          </button>
          <button onClick={copy}
            className="flex items-center gap-1.5 px-4 rounded-full text-xs font-bold shrink-0 transition hover:opacity-90"
            style={{ minHeight: 44, background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, color: c.onAccent }}
            {...focusRing(`${c.gold}55`)}>
            {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />} {copied ? 'Copied' : 'Copy All'}
          </button>
        </div>
        {showExport && (
          <div className="px-4 sm:px-6 pb-5">
            <pre className="text-[10px] whitespace-pre-wrap font-mono max-h-56 overflow-y-auto p-3.5 rounded-xl border leading-relaxed"
              style={{ borderColor: c.border, background: dark ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.7)', color: c.text, opacity: 0.85 }}>{corel}</pre>
          </div>
        )}
      </motion.div>

      <button onClick={onReset}
        className="mt-6 mx-auto flex items-center gap-2 px-7 rounded-full border text-sm font-bold transition hover:opacity-80"
        style={{ minHeight: 48, borderColor: c.border, color: c.text, background: c.surface }}
        {...focusRing(`${c.gold}55`)}>
        <Plus className="w-4 h-4" aria-hidden="true" /> Submit another order
      </button>
    </div>
  );
}

/* ─── Admin Dashboard ────────────────────────────────────────────────────── */
function AdminDashboard({ c, dark, orders, ordersLoading, onStatusChange, onDelete }: { c: Palette; dark: boolean; orders: SubmittedOrder[]; ordersLoading: boolean; onStatusChange: (orderId: string, status: SubmittedOrder['status']) => void; onDelete: (orderId: string) => void }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SubmittedOrder | null>(null);
  const reduce = usePrefersReducedMotion();

  const filtered = orders.filter(o =>
    (filter === 'All' || o.status === filter) &&
    (o.couple.toLowerCase().includes(search.toLowerCase()) || o.orderId.toLowerCase().includes(search.toLowerCase()))
  );

  const updateStatus = (orderId: string, status: SubmittedOrder['status']) => {
    onStatusChange(orderId, status);
    if (selected?.orderId === orderId) setSelected(prev => prev ? { ...prev, status } : null);
  };

  const deleteOrder = (orderId: string) => { onDelete(orderId); if (selected?.orderId === orderId) setSelected(null); };

  const BLUE = '#2563EB';
  const GREEN = '#15803D';
  const statusAccent = (s: string) => s === 'Completed' ? GREEN : s === 'In Progress' ? BLUE : c.gold;

  const stats = [
    { key: 'All',         label: 'All orders',  value: orders.length,                                        icon: Package,      tint: c.gold },
    { key: 'New',         label: 'New',         value: orders.filter(o => o.status === 'New').length,         icon: Bell,         tint: c.primary },
    { key: 'In Progress', label: 'In progress', value: orders.filter(o => o.status === 'In Progress').length, icon: Clock,        tint: BLUE },
    { key: 'Completed',   label: 'Completed',   value: orders.filter(o => o.status === 'Completed').length,   icon: CheckCircle2, tint: GREEN },
  ];

  const panelBg = c.surface;
  const rowBg = dark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.62)';
  const shimmer = `${c.gold}22`;
  const pulse = reduce ? '' : 'animate-pulse';

  return (
    <div className="pt-4 sm:pt-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6 sm:mb-8">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.34em] mb-1.5" style={{ color: c.gold }}>Designer Console</div>
          <h1 className="font-medium leading-none" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(2.1rem, 6vw, 3.4rem)', color: c.text }}>
            Orders
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] px-3 py-2 rounded-full"
          style={{ background: `${c.gold}12`, border: `1px solid ${c.border}`, color: c.subtext }}>
          <span className={`w-2 h-2 rounded-full ${reduce ? '' : 'animate-pulse'}`} style={{ background: '#22C55E' }} aria-hidden="true" />
          Live · syncs across devices
        </div>
      </div>

      {/* Status counts (also act as filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
        {stats.map(s => {
          const Icon = s.icon;
          const active = filter === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setFilter(s.key)}
              aria-pressed={active}
              aria-label={`Show ${s.label} — ${s.value} order${s.value === 1 ? '' : 's'}`}
              className={`relative overflow-hidden text-left rounded-3xl border p-4 sm:p-5 transition-all ${active ? 'shadow-xl' : 'shadow-md hover:shadow-lg'}`}
              style={{
                minHeight: 96,
                borderColor: active ? s.tint : c.border,
                borderWidth: active ? 1.5 : 1,
                background: active ? `${s.tint}12` : panelBg,
              }}
              {...focusRing(`${c.gold}55`)}
            >
              <span className="absolute -top-10 -right-10 w-24 h-24 rounded-full opacity-10 pointer-events-none" style={{ background: s.tint }} />
              <span className="relative flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] leading-tight" style={{ color: active ? s.tint : c.subtext }}>{s.label}</span>
                <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${s.tint}1F`, border: `1px solid ${s.tint}44` }}>
                  <Icon className="w-4 h-4" style={{ color: s.tint }} aria-hidden="true" />
                </span>
              </span>
              <span className="relative block font-medium leading-none" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(2rem, 7vw, 2.7rem)', color: c.text }}>
                {ordersLoading ? '—' : s.value}
              </span>
            </button>
          );
        })}
      </div>


      {/* Search + filters + list */}
      <div className="rounded-3xl border shadow-xl p-4 sm:p-6" style={{ borderColor: c.border, background: panelBg }}>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none z-10" style={{ color: c.gold, opacity: 0.8 }} aria-hidden="true" />
          <Input
            c={c}
            className="pl-11 pr-11"
            type="search"
            placeholder="Search by couple or order number…"
            aria-label="Search orders by couple or order number"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition hover:opacity-70"
              style={{ color: c.subtext }}
              {...focusRing(`${c.gold}55`)}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between flex-wrap mb-4">
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 py-0.5" style={{ scrollbarWidth: 'none' }}>
            {['All', 'New', 'In Progress', 'Completed'].map(f => {
              const on = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={on}
                  className="px-4 rounded-full text-sm font-bold whitespace-nowrap transition-all shrink-0"
                  style={{
                    minHeight: 44,
                    background: on ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                    border: `1px solid ${on ? 'transparent' : c.border}`,
                    color: on ? c.onAccent : c.text,
                  }}
                  {...focusRing(`${c.gold}55`)}
                >
                  {f}
                </button>
              );
            })}
          </div>
          {!ordersLoading && orders.length > 0 && (
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] shrink-0" style={{ color: c.subtext }}>
              {filtered.length} of {orders.length}
            </div>
          )}
        </div>

        {ordersLoading ? (
          <div className="space-y-2.5" aria-busy="true" aria-label="Loading orders">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border" style={{ borderColor: c.border, background: rowBg }}>
                <div className={`w-11 h-11 rounded-full shrink-0 ${pulse}`} style={{ background: shimmer }} />
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className={`h-3.5 rounded-full ${pulse}`} style={{ background: shimmer, width: `${62 - i * 7}%` }} />
                  <div className={`h-2.5 rounded-full ${pulse}`} style={{ background: shimmer, width: '34%' }} />
                </div>
                <div className={`h-7 w-24 rounded-full shrink-0 hidden sm:block ${pulse}`} style={{ background: shimmer }} />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: `${c.gold}12`, border: `1px solid ${c.border}` }}>
              <Package className="w-7 h-7" style={{ color: c.gold }} aria-hidden="true" />
            </div>
            <div className="font-medium mb-2" style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.7rem', color: c.text }}>No orders yet</div>
            <div className="text-sm font-medium leading-relaxed max-w-xs mx-auto" style={{ color: c.subtext }}>
              As soon as a customer submits their wedding matter, it lands here — on every device, instantly.
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 px-6">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `${c.gold}12`, border: `1px solid ${c.border}` }}>
              <Search className="w-6 h-6" style={{ color: c.gold }} aria-hidden="true" />
            </div>
            <div className="font-medium mb-1.5" style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', color: c.text }}>Nothing matches</div>
            <div className="text-sm font-medium mb-5" style={{ color: c.subtext }}>
              No orders match {search ? <>“{search}”</> : 'this filter'}{filter !== 'All' ? ` in ${filter}` : ''}.
            </div>
            <button
              type="button"
              onClick={() => { setSearch(''); setFilter('All'); }}
              className="inline-flex items-center gap-2 px-5 rounded-full border text-sm font-bold transition hover:opacity-80"
              style={{ minHeight: 44, borderColor: c.gold, color: c.gold, background: `${c.gold}10` }}
              {...focusRing(`${c.gold}55`)}
            >
              <X className="w-3.5 h-3.5" /> Clear search &amp; filters
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((o, i) => (
              <motion.button
                key={o.orderId}
                type="button"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.32, delay: reduce ? 0 : Math.min(i * 0.03, 0.3), ease: 'easeOut' }}
                whileHover={reduce ? undefined : { x: 3 }}
                onClick={() => setSelected(o)}
                aria-label={`Open order ${o.orderId} — ${o.couple}, status ${o.status}`}
                className="relative w-full overflow-hidden text-left flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 pl-5 rounded-2xl border transition-shadow hover:shadow-lg"
                style={{ minHeight: 72, borderColor: c.border, background: rowBg }}
                {...focusRing(`${c.gold}55`)}
              >
                <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: statusAccent(o.status) }} aria-hidden="true" />
                <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${c.primary}22, ${c.gold}2E)`, border: `1px solid ${c.border}` }}>
                  <Heart className="w-5 h-5" style={{ color: c.gold }} aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1 block">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium leading-tight" style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.25rem', color: c.text }}>{o.couple}</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: `${c.gold}18`, color: c.gold }}>{o.orderId}</span>
                  </span>
                  <span className="flex items-center gap-2 flex-wrap text-[11px] mt-1.5 font-semibold" style={{ color: c.subtext }}>
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />{o.at}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" aria-hidden="true" />{o.form?.programmes?.length ?? 0} event{(o.form?.programmes?.length ?? 0) === 1 ? '' : 's'}</span>
                    <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider" style={{ background: `${c.primary}15`, color: c.primary }}>
                      <Type className="w-2.5 h-2.5" aria-hidden="true" /> Typed
                    </span>
                  </span>
                  <span className="block mt-2.5 sm:hidden"><StatusBadge s={o.status} c={c} /></span>
                </span>

                <span className="hidden sm:flex items-center gap-3 shrink-0">
                  <StatusBadge s={o.status} c={c} />
                  <ChevronRight className="w-4 h-4 opacity-40" aria-hidden="true" />
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <OrderModal order={selected} onClose={() => setSelected(null)} c={c} dark={dark}
            onStatusChange={s => updateStatus(selected.orderId, s)}
            onDelete={() => { deleteOrder(selected.orderId); setSelected(null); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ s, c }: { s: string; c: Palette }) {
  // Three states, each distinguishable by colour AND shape AND icon — never colour alone.
  //  New         -> gold outlined PILL      + bell
  //  In Progress -> blue tinted RECTANGLE   + clock
  //  Completed   -> solid green RECTANGLE   + check-circle
  const map: Record<string, { fg: string; bg: string; ring: string; icon: React.ElementType; radius: number; solid: boolean }> = {
    'New':         { fg: c.gold,    bg: `${c.gold}1F`,             ring: `${c.gold}70`,             icon: Bell,         radius: 999, solid: false },
    'In Progress': { fg: '#1D4ED8', bg: 'rgba(37, 99, 235, 0.14)', ring: 'rgba(37, 99, 235, 0.45)', icon: Clock,        radius: 8,   solid: false },
    'Completed':   { fg: '#FFFFFF', bg: '#15803D',                 ring: 'rgba(21, 128, 61, 0.65)', icon: CheckCircle2, radius: 8,   solid: true },
  };
  const st = map[s] || map['New'];
  const Icon = st.icon;
  return (
    <span
      role="status"
      aria-label={`Status: ${s}`}
      title={`Status: ${s}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] leading-none whitespace-nowrap shrink-0"
      style={{
        background: st.bg,
        color: st.fg,
        borderRadius: st.radius,
        border: `1px solid ${st.ring}`,
        boxShadow: st.solid ? '0 3px 10px -4px rgba(21, 128, 61, 0.75)' : 'none',
      }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      {s}
    </span>
  );
}

function OrderModal({ order, onClose, c, dark, onStatusChange, onDelete }: { order: SubmittedOrder; onClose: () => void; c: Palette; dark: boolean; onStatusChange: (s: SubmittedOrder['status']) => void; onDelete: () => void }) {
  const corel = generateCorelText(order.form);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareHint, setShareHint] = useState<'shared' | 'downloaded' | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  // The size the customer chose — what the preview, PNG and PDF are fitted to.
  const cardSize = order.form.design.cardSize;
  // wa.me can only pre-fill text, never an image — so the full matter goes as text;
  // the card image is a separate manual attach step in WhatsApp.
  const shareWA = () => { const text = encodeURIComponent(`🌹 *Order ${order.orderId}* — ${order.couple}\n\n${corel}`); window.open(`https://wa.me/?text=${text}`, '_blank'); };
  // mailto: bodies are silently truncated past ~2000 chars by many mail clients,
  // so the matter only travels inline when it fits; otherwise the draft carries
  // the order details and the matter goes across by clipboard.
  const shareEmail = async () => {
    if (!previewRef.current || sharing) return;
    setSharing(true);
    try {
      const heading = `Order Number: ${order.orderId}\nCouple: ${order.couple}\nSubmitted: ${order.at}`;
      setShareHint(await shareMatterAndCard({
        root: previewRef.current,
        base: fileBase,
        subject: `Order ${order.orderId} — ${order.couple}`,
        body: `${heading}\n\n${corel}`,
        fallback: `${heading}\n\nThe full matter was too long for one draft. Copy it with "Copy matter for CorelDRAW" and paste it here.`,
      }));
    } finally {
      setSharing(false);
    }
  };
  const fileBase = `${order.orderId}-${order.couple.replace(/\s+/g, '-')}`;
  const downloadPng = async () => {
    if (!previewRef.current || downloadingPng) return;
    setDownloadingPng(true);
    try {
      // One PNG per page, each at the card's proportions (see Success).
      downloadFiles(await cardPngFiles(await cardCanvases(previewRef.current), fileBase));
    } finally {
      setDownloadingPng(false);
    }
  };
  // Each card page becomes its own PDF page at the card's real trim size. This
  // used to walk previewRef's children, which is one wrapper holding every
  // page — the same bug that once gave the shared PDF a single tall page.
  const downloadPdf = async () => {
    if (!previewRef.current || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const pdf = await cardPdfFile(await cardCanvases(previewRef.current), fileBase);
      if (pdf) downloadFiles([pdf]);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Escape closes the modal; the page behind it must not scroll while it's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const BLUE = '#2563EB';
  const GREEN = '#15803D';
  const DANGER = '#B91C1C';
  const STATUSES: SubmittedOrder['status'][] = ['New', 'In Progress', 'Completed'];
  const statusTint = (s: string) => s === 'Completed' ? GREEN : s === 'In Progress' ? BLUE : c.gold;
  const statusIcon: Record<string, React.ElementType> = { 'New': Bell, 'In Progress': Clock, 'Completed': CheckCircle2 };
  const panelStyle: React.CSSProperties = { borderColor: c.border, background: dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.62)' };
  const codeBg = dark ? 'rgba(0,0,0,0.34)' : 'rgba(255,255,255,0.8)';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/85 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <motion.div
        role="dialog" aria-modal="true" aria-label={`Order ${order.orderId} — ${order.couple}`}
        initial={reduce ? false : { scale: 0.97, y: 18, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={reduce ? { opacity: 0 } : { scale: 0.97, opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.28, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-5xl my-2 sm:my-0 max-h-[96vh] sm:max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl border"
        style={{ background: dark ? palette.dark.bg1 : palette.light.bg1, borderColor: c.border }}>

        {/* Sticky header */}
        <div className="sticky top-0 z-10 px-4 sm:px-6 py-4 border-b flex items-start justify-between gap-3"
          style={{ borderColor: c.border, background: dark ? palette.dark.bg1 : palette.light.bg1 }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full" style={{ background: `${c.gold}18`, color: c.gold }}>{order.orderId}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: `${c.primary}15`, color: c.primary }}>
                <Type className="w-2.5 h-2.5" aria-hidden="true" /> Typed
              </span>
            </div>
            <h2 className="font-medium truncate leading-tight" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.5rem, 5vw, 2rem)', color: c.text }}>{order.couple}</h2>
            <div className="text-xs mt-1 font-semibold flex items-center gap-1.5" style={{ color: c.subtext }}>
              <Clock className="w-3 h-3" aria-hidden="true" /> {order.at}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block"><StatusBadge s={order.status} c={c} /></div>
            <button onClick={onClose} aria-label="Close order" title="Close (Esc)"
              className="w-11 h-11 rounded-full border flex items-center justify-center transition hover:opacity-75"
              style={{ borderColor: c.border, color: c.text, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)' }}
              {...focusRing(`${c.gold}55`)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status control */}
        <div className="px-4 sm:px-6 pt-5">
          <div className="rounded-2xl border p-3.5" style={panelStyle}>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] mb-2.5" style={{ color: c.subtext }}>Order status</div>
            <div className="grid grid-cols-3 gap-2">
              {STATUSES.map(st => {
                const on = order.status === st;
                const tint = statusTint(st);
                const Icon = statusIcon[st];
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onStatusChange(st)}
                    aria-pressed={on}
                    className="flex items-center justify-center gap-1.5 px-2 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all"
                    style={{
                      minHeight: 46,
                      border: `1.5px solid ${on ? tint : c.border}`,
                      background: on ? `${tint}1A` : 'transparent',
                      color: on ? tint : c.subtext,
                    }}
                    {...focusRing(`${c.gold}55`)}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{st}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 pt-5 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Card preview */}
          <div className="order-2 lg:order-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: c.gold }}>Card Preview</div>
              {isValidCardSize(cardSize) && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${c.gold}15`, color: c.gold }}>{cardSizeName(cardSize)} · {cardSizeText(cardSize)}</span>}
            </div>
            {/* NOTE: this div must contain ONLY <CardPreview /> — the PNG/PDF export
                captures each .wmp-card-page inside it exactly as it is rendered. */}
            <div ref={previewRef}>
              <CardPreview form={order.form} c={c} dark={dark} compact />
            </div>
          </div>

          {/* Working column */}
          <div className="order-1 lg:order-2">
            {/* Hand-off block */}
            <div className="rounded-2xl border p-4 shadow-lg" style={{ borderColor: `${c.gold}55`, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)' }}>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4" style={{ color: c.gold }} aria-hidden="true" />
                <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: c.gold }}>CorelDRAW Matter</div>
              </div>
              <div className="text-xs font-medium mb-3.5 leading-snug" style={{ color: c.subtext }}>
                The full typed matter, ready to paste straight into CorelDRAW.
              </div>
              <button
                onClick={copy}
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl text-sm font-bold tracking-wide transition"
                style={{
                  minHeight: 56,
                  background: copied ? `linear-gradient(135deg, ${GREEN}, #22A356)` : `linear-gradient(135deg, ${c.primary}, ${c.gold})`,
                  color: copied ? '#FFFFFF' : c.onAccent,
                  boxShadow: `0 14px 34px -16px ${copied ? GREEN : c.primary}`,
                }}
                {...focusRing(`${c.gold}66`)}
              >
                {copied ? <Check className="w-5 h-5" strokeWidth={3} aria-hidden="true" /> : <Copy className="w-[18px] h-[18px]" aria-hidden="true" />}
                {copied ? 'Copied to clipboard' : 'Copy matter for CorelDRAW'}
              </button>
              <pre
                className="text-[10px] whitespace-pre-wrap font-mono p-3.5 rounded-xl border mt-3 max-h-[300px] overflow-y-auto leading-relaxed"
                style={{ borderColor: c.border, background: codeBg, color: c.text }}
              >{corel}</pre>
            </div>

            {/* Exports & share */}
            <div className="rounded-2xl border p-4 mt-4" style={panelStyle}>
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] mb-3" style={{ color: c.subtext }}>Export &amp; share</div>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={downloadPng} disabled={downloadingPng}
                  className="flex items-center justify-center gap-2 rounded-2xl text-sm font-bold border transition hover:opacity-85 disabled:opacity-60 disabled:cursor-wait"
                  style={{ minHeight: 50, borderColor: c.border, color: c.text, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)' }}
                  {...focusRing(`${c.gold}55`)}>
                  {downloadingPng ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />} {downloadingPng ? 'Preparing…' : 'PNG Image'}
                </button>
                <button onClick={downloadPdf} disabled={downloadingPdf}
                  className="flex items-center justify-center gap-2 rounded-2xl text-sm font-bold border transition hover:opacity-85 disabled:opacity-60 disabled:cursor-wait"
                  style={{ minHeight: 50, borderColor: c.border, color: c.text, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)' }}
                  {...focusRing(`${c.gold}55`)}>
                  {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileText className="w-4 h-4" aria-hidden="true" />} {downloadingPdf ? 'Preparing…' : 'PDF File'}
                </button>
              </div>
              <DocxDownloadButton form={order.form} base={fileBase} order={order} c={c}
                className="w-full mt-2.5 flex items-center justify-center gap-2 rounded-2xl text-sm font-bold border transition hover:opacity-85 disabled:opacity-60 disabled:cursor-wait"
                style={{ minHeight: 50, borderColor: c.border, color: c.text, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)' }} />
              <button onClick={shareWA}
                className="w-full mt-2.5 flex items-center justify-center gap-2 rounded-2xl text-white text-sm font-bold transition hover:opacity-90"
                style={{ minHeight: 50, background: 'linear-gradient(135deg, #1DA851, #128C3E)', boxShadow: '0 12px 28px -14px #128C3E' }}
                {...focusRing('#1DA85166')}>
                <MessageCircle className="w-4 h-4" aria-hidden="true" /> Send matter on WhatsApp
              </button>
              <button onClick={shareEmail} disabled={sharing}
                className="w-full mt-2.5 flex items-center justify-center gap-2 rounded-2xl text-sm font-bold border transition hover:opacity-85 disabled:opacity-60 disabled:cursor-wait"
                style={{ minHeight: 50, borderColor: c.border, color: c.text, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)' }}
                {...focusRing(`${c.gold}55`)}>
                {sharing
                  ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Preparing card…</>
                  : <><Mail className="w-4 h-4" aria-hidden="true" /> Send matter + card by email</>}
              </button>
              <div className="text-[11px] mt-2.5 leading-snug font-medium" style={{ color: c.subtext }}>
                {shareHint === 'downloaded'
                  ? 'Card pages (PNG) and the PDF were saved to your downloads, and the Gmail draft has the full matter — drag the files into the draft to attach them. A web page cannot attach to Gmail on its own.'
                  : 'WhatsApp opens with the full matter as text. Email opens a Gmail draft with the matter and saves the card as PNG pages and a PDF to attach; on a phone the share sheet attaches them for you.'}
              </div>
            </div>

            {/* Danger zone — deliberately separated from the everyday actions */}
            <div className="mt-6 pt-5 border-t" style={{ borderColor: c.border }}>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl text-sm font-bold border transition hover:opacity-80"
                  style={{ minHeight: 46, borderColor: `${DANGER}45`, color: DANGER, background: 'transparent' }}
                  {...focusRing(`${DANGER}55`)}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete this order
                </button>
              ) : (
                <div className="rounded-2xl border p-4" style={{ borderColor: `${DANGER}66`, background: `${DANGER}12` }}>
                  <div className="flex items-start gap-2.5 mb-3.5">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-px" style={{ color: DANGER }} aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold leading-snug" style={{ color: DANGER }}>Delete {order.orderId} permanently?</div>
                      <div className="text-xs mt-1 font-medium leading-snug" style={{ color: c.subtext }}>
                        {order.couple}’s matter will be removed for everyone, on every device. This cannot be undone.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      autoFocus
                      className="flex items-center justify-center gap-2 rounded-xl text-sm font-bold border transition hover:opacity-85"
                      style={{ minHeight: 46, borderColor: c.border, color: c.text, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.8)' }}
                      {...focusRing(`${c.gold}55`)}
                    >
                      Keep order
                    </button>
                    <button
                      onClick={onDelete}
                      className="flex items-center justify-center gap-2 rounded-xl text-white text-sm font-bold transition hover:opacity-90"
                      style={{ minHeight: 46, background: DANGER }}
                      {...focusRing(`${DANGER}66`)}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
