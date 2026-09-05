import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import type { Palette, FormState, PersonInfo, Programme, SubmittedOrder } from './types';
import {
  INVITATION_TEMPLATES, DEITIES, RELATION_WORDS, CLOSING_TAGS, KIDS_LINES,
  PROGRAMME_PRESETS, FONTS, CARD_SIZES, SALUTATIONS
} from './data/constants';
import { fetchOrders, insertOrder, updateOrderStatus, deleteOrder as deleteOrderRow, subscribeToOrders } from './lib/orders';
import { getSession, onAuthChange, signIn, signOut } from './lib/auth';

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
    language: 'English',
    headingFont: "'Cormorant Garamond', serif",
    bodyFont: "'EB Garamond', serif",
    scriptFont: "'Tangerine', cursive",
    fontSize: 16,
    letterSpacing: 0.5,
    lineHeight: 1.7,
    layout: 'royal',
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

function fillTemplate(text: string, form: FormState): string {
  return text.replace(/\{bride\}/g, form.bride.name || '').replace(/\{groom\}/g, form.groom.name || '');
}

const KIDS_CUSTOM = 'custom';  // sentinel kidsLine id — the KIDS_LINES presets use numeric ids, so it can't collide

/** The kids line as it should print: the couple's own words when they chose to
 *  write one, otherwise the chosen preset. Blank custom text means no line. */
function kidsLineText(form: FormState): string {
  if (form.kidsLine === KIDS_CUSTOM) return (form.kidsCustom || '').trim();
  return KIDS_LINES.find(t => t.id === form.kidsLine)?.label || '';
}

function generateCorelText(form: FormState): string {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = kidsLineText(form);
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);
  const deityNames = form.deities.map(id => DEITIES.find(d => d.id === id)?.name).join(' · ');
  const deityGlyphs = form.deities.map(id => DEITIES.find(d => d.id === id)?.glyph).join(' ');

  const above = form.aboveWeds === 'bride' ? form.bride : form.groom;
  const below = form.aboveWeds === 'bride' ? form.groom : form.bride;
  const aboveRole = form.aboveWeds === 'bride' ? 'BRIDE (ABOVE WEDS)' : 'GROOM (ABOVE WEDS)';
  const belowRole = form.aboveWeds === 'bride' ? 'GROOM (BELOW WEDS)' : 'BRIDE (BELOW WEDS)';
  const aboveRelation = form.aboveWeds === 'bride' ? 'D/o' : 'S/o';
  const belowRelation = form.aboveWeds === 'bride' ? 'S/o' : 'D/o';

  const personBlock = (label: string, p: PersonInfo, rel: string) => {
    let s = `─── ${label} ───\n`;
    s += `${p.name}\n`;
    if (p.fatherName) s += `${rel} ${pn(p.fatherPrefix, p.fatherName)}\n`;
    if (p.motherName) s += `${pn(p.motherPrefix, p.motherName)}\n`;
    if (p.grandfatherName) s += `G/o ${pn(p.grandfatherPrefix, p.grandfatherName)}\n`;
    if (p.grandmotherName) s += `${pn(p.grandmotherPrefix, p.grandmotherName)}\n`;
    return s + '\n';
  };

  let s = '';
  s += `╔══════════════════════════════════╗\n║   WEDDING CARD MATTER EXPORT     ║\n╚══════════════════════════════════╝\n\n`;
  s += `─── CARD ORDER ───\n${form.aboveWeds === 'bride' ? 'Bride ABOVE Weds · Groom BELOW' : 'Groom ABOVE Weds · Bride BELOW'}\n\n`;
  s += `─── DEITIES ───\n${deityGlyphs}\n${deityNames}\nMantra: ${DEITIES.find(d => d.id === form.deities[0])?.mantra || '—'}\n\n`;
  s += `─── DESIGN ───\nLayout: ${form.design.layout.toUpperCase()} | Language: ${form.design.language}\nHeading: ${form.design.headingFont}\nBody: ${form.design.bodyFont}\nScript: ${form.design.scriptFont}\nSize ${form.design.fontSize}px\n\n`;
  s += `─── INVITATION TEMPLATE #${template?.id} (${template?.category}) ───\n${fillTemplate(template?.text || '', form)}\n\n`;
  s += personBlock(aboveRole, above, aboveRelation);
  s += `─── RELATION ───\n${relation?.label || 'Weds'}\n\n`;
  s += personBlock(belowRole, below, belowRelation);
  s += `─── PROGRAMMES ───\n`;
  form.programmes.forEach((f, i) => {
    s += `\n[${i + 1}] ${f.name}\n  Date: ${f.date}\n`;
    if (f.hour) s += `  Time: ${fmtTime(f.hour, f.minute, f.ampm)}\n`;
    if (f.venue) s += `  Venue: ${f.venue}\n`;
    if (f.address) s += `  Address: ${f.address}\n`;
  });
  if (form.family.residenceAddress) s += `\n─── RESIDENCE ───\n${form.family.residenceAddress}\n`;
  if (form.withCompliments) s += `\n─── WITH COMPLIMENTS ───\n${form.withCompliments}\n`;
  if (kidsLine) s += `\n─── KIDS LINE ───\n${kidsLine}\n`;
  if (closing) s += `\n─── CLOSING TAG ───\n[${closing.id.toUpperCase()}] ${closing.label}\n`;
  return s;
}

function loadDraft(): FormState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FormState;
      return { ...initialForm, ...parsed, meta: { accepted: false } };
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
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400&family=Cormorant+Garamond:wght@400;500;600;700&family=Cinzel:wght@400;700;900&family=Cinzel+Decorative:wght@400;700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Marcellus&family=Tangerine:wght@400;700&family=Great+Vibes&family=Italianno&family=Pinyon+Script&family=Allura&family=Tiro+Devanagari+Hindi&family=Noto+Serif+Devanagari:wght@400;700&family=Rozha+One&family=Yatra+One&family=Sahitya:wght@400;700&family=Modak&family=Noto+Serif+Gujarati:wght@400;700&family=Rasa:wght@400;600&family=Hind+Vadodara:wght@400;600&display=swap';
    document.head.appendChild(link);
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
                  className="relative flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[12px] transition-colors duration-200"
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

  const fillSample = () => { setForm(sampleForm); showToast('Sample card loaded!'); };
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

      <div className="grid lg:grid-cols-12 gap-6 xl:gap-8 mt-4 lg:mt-6 items-start">
        <div className="lg:col-span-7 xl:col-span-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28 }}>
              {step === 0 && <StepFamily form={form} update={update} setForm={setForm} c={c} dark={dark} />}
              {step === 1 && <StepDeities form={form} setForm={setForm} c={c} />}
              {step === 2 && <StepInvitation form={form} update={update} c={c} dark={dark} />}
              {step === 3 && <StepProgrammes form={form} setForm={setForm} c={c} />}
              {step === 4 && <StepExtras form={form} update={update} c={c} />}
              {step === 5 && <StepDesign form={form} update={update} c={c} dark={dark} />}
              {step === 6 && <StepPreview form={form} update={update} c={c} dark={dark} />}
              {step === 7 && <StepSubmit form={form} update={update} c={c} onSubmit={submit} setStep={setStep} submitting={submitting} />}
            </motion.div>
          </AnimatePresence>
          <NavButtons step={step} prev={prev} next={next} onSubmit={submit} c={c} canNext={canNext} submitting={submitting} />
        </div>

        <div className="lg:col-span-5 xl:col-span-6">
          <div className="lg:sticky lg:top-[4.5rem]">
            <div className="rounded-[1.75rem] border overflow-hidden shadow-2xl"
              style={{ borderColor: c.border, background: c.surface }}>

              {/* ── Header ─────────────────────────────────────────────── */}
              <div className="flex items-end justify-between gap-3 px-4 sm:px-5 py-3 border-b" style={{ borderColor: c.border }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="relative flex w-1.5 h-1.5">
                      <span className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping" style={{ background: c.gold }} />
                      <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: c.gold }} />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: c.gold }}>Live Preview</span>
                  </div>
                  <div className="truncate leading-tight mt-0.5"
                    style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.15rem', color: coupleNames ? c.text : c.subtext }}>
                    {coupleNames || 'Untitled invitation'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
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
      <header className="px-5 sm:px-8 pt-6 sm:pt-7 pb-5">
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

      <div aria-hidden className="h-px mx-5 sm:mx-8" style={{ background: `linear-gradient(90deg, transparent, ${withAlpha(c.gold, 0.4)}, transparent)` }} />

      <div className="px-5 sm:px-8 py-6 sm:py-8">{children}</div>
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
      <div className="flex gap-2">
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
          className="flex-1 min-w-0"
          aria-label={label}
          value={nameValue}
          onChange={e => update(namePath, e.target.value)}
          placeholder={namePlaceholder}
        />
      </div>
    </Field>
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

function OptionRow({ active, onClick, c, children }: { active: boolean; onClick: () => void; c: Palette; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="w-full flex items-start gap-3 p-4 rounded-2xl border text-left transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}12` : 'transparent', outlineColor: c.gold }}>
      <span className="mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors duration-300"
        style={{ borderColor: active ? c.gold : c.border, background: active ? c.gold : 'transparent' }}>
        {active && <Check className="w-3 h-3" strokeWidth={3.5} style={{ color: c.onAccent }} />}
      </span>
      <span className="flex-1 min-w-0">{children}</span>
    </button>
  );
}

/* ─── Step 0: Family ─────────────────────────────────────────────────────── */
function StepFamily({ form, update, setForm, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette; dark: boolean }) {
  const bothNamed = !!(form.bride.name.trim() && form.groom.name.trim());
  const aboveName = form.aboveWeds === 'bride' ? form.bride.name : form.groom.name;
  const belowName = form.aboveWeds === 'bride' ? form.groom.name : form.bride.name;
  const abovePh = form.aboveWeds === 'bride' ? 'Bride' : 'Groom';
  const belowPh = form.aboveWeds === 'bride' ? 'Groom' : 'Bride';
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord)?.label || 'Weds';
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
      <div className="grid gap-4">
        <PersonCard side="Bride" person={form.bride} update={update} prefix="bride" c={c} />
        <PersonCard side="Groom" person={form.groom} update={update} prefix="groom" c={c} />
      </div>

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
          <div className="grid sm:grid-cols-2 gap-4 pt-1">
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
      <div className="p-5">
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
                    <span aria-hidden="true">{d.glyph}</span>
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
              <span className="text-[26px] leading-none" aria-hidden="true">{d.glyph}</span>
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
  const q = search.trim().toLowerCase();
  const filtered = INVITATION_TEMPLATES.filter(t =>
    (cat === 'All' || t.category === cat) &&
    (!q || t.preview.toLowerCase().includes(q) || t.text.toLowerCase().includes(q))
  );
  const countFor = (ct: string) => ct === 'All' ? INVITATION_TEMPLATES.length : INVITATION_TEMPLATES.filter(t => t.category === ct).length;
  const aboveName = form.aboveWeds === 'bride' ? (form.bride.name || 'Bride') : (form.groom.name || 'Groom');
  const belowName = form.aboveWeds === 'bride' ? (form.groom.name || 'Groom') : (form.bride.name || 'Bride');
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord)?.label || 'Weds';

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
          <div className="grid gap-3 max-h-[540px] overflow-y-auto pr-1 -mr-1" style={{ scrollbarWidth: 'thin' }}>
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

                    <p className="whitespace-pre-line"
                      style={{ fontFamily: form.design.bodyFont, fontSize: '0.95rem', lineHeight: 1.7, color: c.text, opacity: 0.9, fontStyle: 'italic' }}>
                      {fillTemplate(t.text, form)}
                    </p>

                    <div className="mt-4 pt-3 text-center" style={{ borderTop: `1px solid ${c.border}` }}>
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
                  {r.label}
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
                        className="w-full bg-transparent outline-none min-w-0 rounded-md leading-tight focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: c.text, fontFamily: "'Playfair Display', serif", fontSize: '1.25rem', fontWeight: 600, outlineColor: c.gold }} />
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
                          <div className="grid sm:grid-cols-2 gap-4">
                            <Field label="Date" required c={c}
                              error={past ? 'That date has already passed. Please pick today or a later date.' : undefined}>
                              <Input c={c} type="date" min={todayISO()} value={f.date} invalid={past}
                                onChange={e => updateProg(f.id, 'date', e.target.value)} />
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
    </Section>
  );
}

/* ─── Step 4: Extras ─────────────────────────────────────────────────────── */
function StepExtras({ form, update, c }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette }) {
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kids = kidsLineText(form);

  return (
    <>
      <Section title="Closing Line" eyebrow="Step 5A of 8"
        subtitle="The line about blessings and gifts, printed near the bottom of the card."
        c={c} icon={Star}>

        <div className="mb-6 px-5 py-5 rounded-2xl text-center" style={{ border: `1px dashed ${c.gold}66`, background: `${c.gold}0A` }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2" style={{ color: c.gold }}>On your card</div>
          <div className="leading-snug" style={{ fontFamily: form.design.headingFont, fontSize: '1.2rem', color: closing ? c.text : c.subtext }}>
            {closing ? closing.label : 'Choose a line below'}
          </div>
        </div>

        <GroupHeading label="Choose one" note={`${CLOSING_TAGS.length} options`} c={c} />
        <div className="grid sm:grid-cols-2 gap-2">
          {CLOSING_TAGS.map(t => (
            <OptionRow key={t.id} active={form.closingTag === t.id} onClick={() => update('closingTag', t.id)} c={c}>
              <span className="block text-[13px] leading-snug font-semibold" style={{ color: c.text }}>{t.label}</span>
            </OptionRow>
          ))}
        </div>
      </Section>

      <div className="mt-5">
        <Section title="Kids Message" eyebrow="Optional" subtitle="A playful line from the little ones — leave it out if you prefer." c={c} icon={Heart}>
          <div className="grid gap-2">
            <OptionRow active={form.kidsLine === ''} onClick={() => update('kidsLine', '')} c={c}>
              <span className="block text-[13px] leading-snug font-semibold italic" style={{ color: c.subtext }}>No kids message</span>
            </OptionRow>
            {KIDS_LINES.map(t => (
              <OptionRow key={t.id} active={form.kidsLine === t.id} onClick={() => update('kidsLine', t.id)} c={c}>
                <span className="block text-[13px] leading-snug font-semibold" style={{ color: c.text }}>{t.label}</span>
              </OptionRow>
            ))}
            <OptionRow active={form.kidsLine === KIDS_CUSTOM} onClick={() => update('kidsLine', KIDS_CUSTOM)} c={c}>
              <span className="block text-[13px] leading-snug font-semibold" style={{ color: c.text }}>Write our own</span>
              <span className="block text-[11px] leading-snug font-medium mt-1" style={{ color: c.subtext }}>Name your kids, or word it however you like.</span>
            </OptionRow>
          </div>
          {form.kidsLine === KIDS_CUSTOM && (
            <div className="mt-4">
              <Field label="Your kids message" hint="printed exactly as typed" c={c}>
                <Textarea c={c} rows={2} value={form.kidsCustom} onChange={e => update('kidsCustom', e.target.value)}
                  placeholder="e.g. Aarav & Myra are waiting to meet you 😊" />
              </Field>
            </div>
          )}
          {kids && (
            <div className="mt-4 px-4 py-3 rounded-2xl text-center" style={{ background: `${c.gold}12`, border: `1px solid ${c.border}` }}>
              <span className="text-[12px] font-medium italic" style={{ color: c.text }}>{kids}</span>
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
function StepDesign({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [target, setTarget] = useState('heading');
  const cats = ['All', ...Array.from(new Set(FONTS.map(f => f.cat)))];
  const filtered = FONTS.filter(f => (cat === 'All' || f.cat === cat) && f.langs.includes('English') && f.name.toLowerCase().includes(search.toLowerCase()));

  const targetKey: 'headingFont' | 'bodyFont' | 'scriptFont' = target === 'heading' ? 'headingFont' : target === 'body' ? 'bodyFont' : 'scriptFont';
  const currentFamily = form.design[targetKey];
  const currentName = FONTS.find(f => f.family === currentFamily)?.name || 'Custom';

  const aboveName = form.aboveWeds === 'bride' ? (form.bride.name || 'Aditi Sharma') : (form.groom.name || 'Rohan Mehta');
  const belowName = form.aboveWeds === 'bride' ? (form.groom.name || 'Rohan Mehta') : (form.bride.name || 'Aditi Sharma');
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord)?.label || 'Weds';
  const sampleText = target === 'heading' ? (form.bride.name || 'Aditi Sharma')
    : target === 'script' ? relation
      : 'Request the honour of your presence';

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
        <div style={{
          fontFamily: form.design.bodyFont,
          fontSize: `${form.design.fontSize}px`,
          letterSpacing: `${form.design.letterSpacing}px`,
          lineHeight: form.design.lineHeight,
          color: c.text,
        }}>
          <p className="italic max-w-sm mx-auto" style={{ fontSize: '0.86em', opacity: 0.78 }}>
            Request the pleasure of your company at the wedding celebration of
          </p>
          <div className="mt-4 leading-tight break-words" style={{ fontFamily: form.design.headingFont, fontSize: '1.9em' }}>{aboveName}</div>
          <div className="leading-none my-1" style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: '2.1em', color: c.gold }}>{relation}</div>
          <div className="leading-tight break-words" style={{ fontFamily: form.design.headingFont, fontSize: '1.9em' }}>{belowName}</div>
        </div>
      </div>

      {/* Sliders */}
      <GroupHeading label="Size & spacing" c={c} />
      <div className="grid sm:grid-cols-3 gap-5 mb-8">
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
                <div className="truncate leading-tight mt-0.5" style={{ fontFamily: t.fam, fontSize: '1.15rem', color: c.text }}>Abc</div>
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

        {filtered.length === 0 ? (
          <div className="text-center py-10 px-6 text-[13px] font-semibold" style={{ color: c.subtext }}>No fonts match that search.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto p-3 border-t" style={{ borderColor: c.border, scrollbarWidth: 'thin' }}>
            {filtered.map(f => {
              const active = currentFamily === f.family;
              return (
                <motion.button key={f.name} type="button" onClick={() => update(`design.${targetKey}`, f.family)} aria-pressed={active}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="flex items-center justify-between gap-2 p-3.5 rounded-2xl border text-left min-h-[76px] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}12` : 'transparent', outlineColor: c.gold }}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ fontFamily: f.family, fontSize: '1.5rem', color: c.text, lineHeight: 1.25 }}>{sampleText}</div>
                    <div className="text-[10px] mt-1 flex items-center gap-2 uppercase tracking-[0.12em]" style={{ color: c.subtext }}>
                      <span className="font-bold truncate">{f.name}</span>
                      <span className="opacity-45">·</span>
                      <span className="opacity-80">{f.cat}</span>
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
function StepPreview({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  const wide = form.preview.device !== 'mobile';
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
        <div className={`wmp-print-area relative mx-auto px-4 sm:px-8 py-8 sm:py-12 transition-all duration-500 ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
          <CardPreview form={form} c={c} dark={dark} />
        </div>
      </div>

      <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: c.subtext }}>
        Shown at true print proportions
      </div>
    </Section>
  );
}

/* ─── Step 7: Submit ─────────────────────────────────────────────────────── */
function StepSubmit({ form, update, c, onSubmit, setStep, submitting }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; onSubmit: () => void; setStep: (n: number) => void; submitting?: boolean }) {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const sections = [
    { label: 'Bride & Groom', step: 0, value: `${form.bride.name || '—'} & ${form.groom.name || '—'}`, icon: Heart, ok: !!(form.bride.name && form.groom.name) },
    { label: 'Card Order', step: 0, value: form.aboveWeds === 'bride' ? 'Bride above Weds' : 'Groom above Weds', icon: ArrowLeftRight, ok: true },
    { label: 'Deities', step: 1, value: `${form.deities.length} selected`, icon: Star, ok: form.deities.length > 0 },
    { label: 'Template', step: 2, value: template ? `#${template.id} · ${template.category}` : 'Not selected', icon: BookOpen, ok: !!template },
    { label: 'Programmes', step: 3, value: `${form.programmes.filter(p => p.date).length} with dates`, icon: Calendar, ok: form.programmes.some(p => p.date) && !form.programmes.some(p => isPastDate(p.date)) },
    { label: 'Closing Line', step: 4, value: closing?.label || '—', icon: FileText, ok: true },
    { label: 'Design', step: 5, value: `${form.design.language} · ${form.design.layout}`, icon: Type, ok: true },
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
                <div className="text-[14px] font-semibold truncate" style={{ color: c.text }}>{s.value}</div>
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
function CardPreview({ form, c, dark, compact, sizeId }: { form: FormState; c: Palette; dark: boolean; compact?: boolean; sizeId?: string }) {
  const layout = form.design.layout;
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = kidsLineText(form);
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);
  const hasNames = !!(form.bride.name || form.groom.name);

  // Respect aboveWeds
  const above = form.aboveWeds === 'bride' ? form.bride : form.groom;
  const below = form.aboveWeds === 'bride' ? form.groom : form.bride;
  const aboveRelation = form.aboveWeds === 'bride' ? 'D/o' : 'S/o';
  const belowRelation = form.aboveWeds === 'bride' ? 'S/o' : 'D/o';

  // Card size sets a *minimum* height matching the real print proportions — using
  // aspectRatio directly would lock the box to that height and silently clip any
  // matter that doesn't fit, hiding content from the designer. minHeight (via a
  // container-query width unit, so it tracks the box's own rendered width) lets the
  // box grow taller automatically whenever there's more matter than the nominal size holds.
  const sizeConf = CARD_SIZES.find(s => s.id === sizeId);
  const aspectStyle: React.CSSProperties = sizeConf
    ? { minHeight: `calc(100cqw * ${sizeConf.heightIn} / ${sizeConf.widthIn})` }
    : {};

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
          {form.deities.map(id => { const d = DEITIES.find(x => x.id === id); return <span key={id} className="text-xl sm:text-2xl leading-none" title={d?.name}>{d?.glyph}</span>; })}
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
          {pn(above.motherPrefix, above.motherName) || pn(below.motherPrefix, below.motherName) || ''}
          {((above.motherName || below.motherName) && (above.fatherName || below.fatherName)) ? ' & ' : ''}
          {pn(above.fatherPrefix, above.fatherName) || pn(below.fatherPrefix, below.fatherName) || ''}
        </div>
      )}

      {/* Template */}
      {template && (
        <p className="mb-5 italic opacity-80 max-w-md mx-auto whitespace-pre-line" style={{ fontSize: '0.88em', fontFamily: form.design.bodyFont, lineHeight: 1.6 }}>
          {fillTemplate(template.text, form).replace(/\n\n\n/g, '\n\n')}
        </p>
      )}

      {/* Names */}
      <div className="my-5">
        <div className="font-medium leading-tight mb-1" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.7em' : '2.5em', color: '#111111' }}>
          {above.name || <span className="opacity-30 italic" style={{ fontSize: '0.7em' }}>Name</span>}
        </div>
        {(above.fatherName || above.motherName) && (
          <div className="text-[10px] opacity-70 font-semibold mt-0.5">
            {aboveRelation} {pn(above.fatherPrefix, above.fatherName)}{above.fatherName && above.motherName ? ' & ' : ''}{pn(above.motherPrefix, above.motherName)}
          </div>
        )}
        {above.grandfatherName && (
          <div className="text-[10px] opacity-55 mt-0.5">{pn(above.grandfatherPrefix, above.grandfatherName)}{above.grandfatherName && above.grandmotherName ? ' & ' : ''}{pn(above.grandmotherPrefix, above.grandmotherName)}</div>
        )}

        <div className="my-4 relative">
          <div style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: compact ? '2.2em' : '3.2em', color: '#1A1A1A', lineHeight: 0.9 }}>
            {relation?.label || 'Weds'}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-14 h-px" style={{ background: '#C0892E' }} />
        </div>

        <div className="font-medium leading-tight mb-1 mt-2" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.7em' : '2.5em', color: '#111111' }}>
          {below.name || <span className="opacity-30 italic" style={{ fontSize: '0.7em' }}>Name</span>}
        </div>
        {(below.fatherName || below.motherName) && (
          <div className="text-[10px] opacity-70 font-semibold mt-0.5">
            {belowRelation} {pn(below.fatherPrefix, below.fatherName)}{below.fatherName && below.motherName ? ' & ' : ''}{pn(below.motherPrefix, below.motherName)}
          </div>
        )}
        {below.grandfatherName && (
          <div className="text-[10px] opacity-55 mt-0.5">{pn(below.grandfatherPrefix, below.grandfatherName)}{below.grandfatherName && below.grandmotherName ? ' & ' : ''}{pn(below.grandmotherPrefix, below.grandmotherName)}</div>
        )}
      </div>

      {form.family.residenceAddress && (
        <div className="mt-5 pt-4 text-[10px]" style={{ borderTop: '1px solid rgba(0, 0, 0, 0.10)' }}>
          <div className="font-bold mb-0.5" style={{ color: '#1A1A1A' }}>Residence:</div>
          <div className="opacity-65">{form.family.residenceAddress}</div>
        </div>
      )}
      {form.withCompliments && (
        <div className="mt-3 text-[10px]">
          <div className="font-bold mb-0.5" style={{ color: '#1A1A1A' }}>With Best Compliments:</div>
          <div className="opacity-65">{form.withCompliments}</div>
        </div>
      )}
      {kidsLine && (
        <div className="mt-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(192, 137, 46, 0.12)' }}>
          <div className="text-[10px] italic font-medium" style={{ color: '#1A1A1A' }}>{kidsLine}</div>
        </div>
      )}
      {closing && (
        <div className="mt-4 text-[10px] font-bold tracking-[0.28em]" style={{ color: '#1A1A1A' }}>✦ {closing.label.toUpperCase()} ✦</div>
      )}
      <div className="mt-4 flex justify-center">
        <svg width="40" height="12" viewBox="0 0 40 12" fill="#C0892E" opacity="0.6">
          <circle cx="6" cy="6" r="2" /><circle cx="20" cy="6" r="3" /><circle cx="34" cy="6" r="2" />
        </svg>
      </div>
    </div>
  );

  const hasProgrammes = form.programmes.some(p => p.date);
  const pageProgrammes = hasProgrammes ? (
    <div className={`relative ${compact ? 'p-5 pt-6' : 'p-7 sm:p-10 pt-8'} text-center`}
      style={{ fontFamily: form.design.bodyFont, fontSize: `${form.design.fontSize}px`, letterSpacing: `${form.design.letterSpacing}px`, lineHeight: form.design.lineHeight }}>
      <DecorativeDivider compact={compact} mini />
      <div className="text-[10px] font-bold mb-3 mt-2" style={{ color: '#1A1A1A', letterSpacing: '0.4em', fontFamily: form.design.headingFont }}>◈ PROGRAMMES ◈</div>
      <div className="grid gap-2">
        {form.programmes.filter(f => f.date).map(f => {
          const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
          const isReception = f.preset === 'reception';
          const mealText = isReception && f.mealType && f.mealType !== 'none' ? ` from ${fmtTime(f.hour, f.minute, f.ampm)} onwards (${f.mealType})` : null;
          return (
            <div key={f.id} className="rounded-xl p-2.5 text-left" style={{ background: `linear-gradient(135deg, ${preset?.color || '#C0892E'}12, transparent)`, border: `1px solid ${preset?.color || '#C0892E'}28` }}>
              <div className="flex items-start gap-2">
                <div className="text-lg shrink-0">{preset?.icon || '✨'}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1em', color: '#1A1A1A' }}>{f.name}</div>
                  <div className="text-[10px] mt-0.5 font-semibold">
                    {new Date(f.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {f.hour && !mealText ? <span className="opacity-65"> · {fmtTime(f.hour, f.minute, f.ampm)}</span> : null}
                    {mealText ? <span className="opacity-65"> · {mealText}</span> : null}
                  </div>
                  {f.venue && <div className="text-[10px] font-bold mt-0.5" style={{ color: '#1A1A1A' }}>{f.venue}</div>}
                  {f.address && <div className="text-[10px] opacity-65 mt-0.5 leading-tight">{f.address}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  // ── Paper shell: the card reads as a real sheet resting on the stage.
  //    `wmp-hero-card` carries the theme-aware shadow ladder + gold ring;
  //    `wmp-card-page` makes each page print whole on its own sheet. ───────
  const paper = (children: React.ReactNode, label: string, showLabel: boolean) => (
    <div>
      {showLabel && (
        <div className="flex items-center gap-2 mb-2 px-0.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] shrink-0" style={{ color: c.gold }}>{label}</span>
          <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${c.gold}55, transparent)` }} />
        </div>
      )}
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: 'tween', duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="wmp-card-page wmp-hero-card rounded-2xl overflow-hidden relative"
        style={{ background: cardBg, color: '#111111', ...aspectStyle }}
      >
        {/* faint gold edge rule on the paper's own boundary */}
        <div className="absolute inset-0 rounded-2xl pointer-events-none z-10" style={{ boxShadow: 'inset 0 0 0 1px rgba(192,137,46,0.42)' }} />
        {layout !== 'modern' && (
          <>
            <div className="absolute inset-2.5 rounded-xl pointer-events-none" style={{ border: '2px double #C0892E', opacity: 0.5 }} />
            <div className="absolute inset-4 rounded-lg pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.5 }} />
          </>
        )}
        {layout === 'modern' && <div className="absolute inset-3 rounded-xl pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.4 }} />}
        {children}
      </motion.div>
    </div>
  );

  const hasTwoPages = !!pageProgrammes;

  return (
    <div className="@container space-y-5">
      {paper(pageContent, 'Page 1 · Invitation', hasTwoPages)}
      {pageProgrammes && paper(pageProgrammes, 'Page 2 · Programmes', true)}
    </div>
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
async function cardCanvases(root: HTMLElement): Promise<HTMLCanvasElement[]> {
  const { default: html2canvas } = await import('html2canvas');
  // Each rendered card page carries .wmp-card-page. Selecting on that rather
  // than root.children matters: the ref wraps CardPreview, whose own root is a
  // single spacing container, so children[] is one element holding both pages.
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.wmp-card-page'));
  const targets = pages.length ? pages : [root];
  const out: HTMLCanvasElement[] = [];
  for (const el of targets) {
    out.push(await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }));
  }
  return out;
}

/** The card as shareable files: one PNG per page, plus a single PDF holding
 *  every page. Both formats go along because they get used differently — the
 *  PNGs preview inline in a chat or mail body, the PDF is what a printer or
 *  designer wants. PDF pages are sized 1:1 in pixels to their canvas so
 *  nothing is stretched or clipped, matching the standalone PDF export. */
async function cardFiles(root: HTMLElement, base: string): Promise<File[]> {
  const canvases = await cardCanvases(root);
  if (!canvases.length) return [];
  const files: File[] = [];
  for (let i = 0; i < canvases.length; i++) {
    const blob = await new Promise<Blob | null>(res => canvases[i].toBlob(res, 'image/png'));
    if (blob) {
      const name = canvases.length > 1 ? `${base}-page-${i + 1}.png` : `${base}.png`;
      files.push(new File([blob], name, { type: 'image/png' }));
    }
  }
  const { jsPDF } = await import('jspdf');
  let doc: InstanceType<typeof jsPDF> | null = null;
  for (const canvas of canvases) {
    const orientation = canvas.width > canvas.height ? 'l' : 'p';
    if (!doc) {
      doc = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height], hotfixes: ['px_scaling'] });
    } else {
      doc.addPage([canvas.width, canvas.height], orientation);
    }
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
  }
  if (doc) files.push(new File([doc.output('blob')], `${base}.pdf`, { type: 'application/pdf' }));
  return files;
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
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.download = `${fileBase}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
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
            captures it exactly as it is rendered. */}
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
  const [cardSizeId, setCardSizeId] = useState('sq7x7');
  const [sizeOpen, setSizeOpen] = useState(false);
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
  const activeSize = CARD_SIZES.find(s => s.id === cardSizeId);
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

      {/* Card size for the order preview */}
      <div className="rounded-3xl border shadow-md overflow-hidden mb-5" style={{ borderColor: c.border, background: panelBg }}>
        <button
          type="button"
          onClick={() => setSizeOpen(v => !v)}
          aria-expanded={sizeOpen}
          className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left transition hover:opacity-90"
          style={{ minHeight: 54 }}
          {...focusRing(`${c.gold}55`)}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Maximize2 className="w-4 h-4 shrink-0" style={{ color: c.gold }} aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] shrink-0" style={{ color: c.subtext }}>Preview size</span>
            <span className="text-sm font-bold truncate" style={{ color: c.text }}>{activeSize?.label}</span>
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-300 ${sizeOpen ? 'rotate-180' : ''}`} style={{ color: c.gold }} aria-hidden="true" />
        </button>
        {sizeOpen && (
          <div className="px-4 sm:px-5 pb-4 pt-4 border-t" style={{ borderColor: c.border }}>
            <div className="flex flex-wrap gap-2">
              {CARD_SIZES.map(sz => {
                const on = cardSizeId === sz.id;
                return (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setCardSizeId(sz.id)}
                    aria-pressed={on}
                    className="flex items-center gap-2 px-4 rounded-full border text-sm font-bold transition-all"
                    style={{
                      minHeight: 46,
                      borderWidth: on ? 1.5 : 1,
                      borderColor: on ? c.gold : c.border,
                      background: on ? `${c.gold}1A` : rowBg,
                      color: on ? c.gold : c.text,
                    }}
                    {...focusRing(`${c.gold}55`)}
                  >
                    {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />}
                    {sz.label} <span className="opacity-55 text-xs font-semibold">({sz.widthIn}×{sz.heightIn}")</span>
                  </button>
                );
              })}
            </div>
            <div className="text-xs mt-3 font-medium leading-snug" style={{ color: c.subtext }}>
              The card preview inside each order is sized to match these print dimensions.
            </div>
          </div>
        )}
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
          <OrderModal order={selected} onClose={() => setSelected(null)} c={c} dark={dark} cardSizeId={cardSizeId}
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

function OrderModal({ order, onClose, c, dark, cardSizeId, onStatusChange, onDelete }: { order: SubmittedOrder; onClose: () => void; c: Palette; dark: boolean; cardSizeId: string; onStatusChange: (s: SubmittedOrder['status']) => void; onDelete: () => void }) {
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
  const sizeConf = CARD_SIZES.find(s => s.id === cardSizeId);
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
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const link = document.createElement('a');
      link.download = `${fileBase}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setDownloadingPng(false);
    }
  };
  // Each physical card page (Page 1, Page 2 programmes) becomes its own PDF page,
  // sized in pixels 1:1 to the captured canvas so nothing gets stretched or clipped.
  const downloadPdf = async () => {
    if (!previewRef.current || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const pages = Array.from(previewRef.current.children) as HTMLElement[];
      let doc: InstanceType<typeof jsPDF> | null = null;
      for (const pageEl of pages) {
        const canvas = await html2canvas(pageEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const orientation = canvas.width > canvas.height ? 'l' : 'p';
        if (!doc) {
          doc = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height], hotfixes: ['px_scaling'] });
        } else {
          doc.addPage([canvas.width, canvas.height], orientation);
        }
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
      }
      doc?.save(`${fileBase}.pdf`);
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
        <div className="px-4 sm:px-6 pt-5 pb-6 grid lg:grid-cols-2 gap-5 lg:gap-6">
          {/* Card preview */}
          <div className="order-2 lg:order-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: c.gold }}>Card Preview</div>
              {sizeConf && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${c.gold}15`, color: c.gold }}>{sizeConf.label} · {sizeConf.widthIn}×{sizeConf.heightIn}"</span>}
            </div>
            {/* NOTE: this div must contain ONLY <CardPreview /> — the PNG/PDF export
                captures it (and iterates its children) exactly as it is rendered. */}
            <div ref={previewRef}>
              <CardPreview form={order.form} c={c} dark={dark} compact sizeId={cardSizeId} />
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
