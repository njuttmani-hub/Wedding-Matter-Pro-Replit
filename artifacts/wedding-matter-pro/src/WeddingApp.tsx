import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ChevronRight, ChevronLeft, Check, Plus, Trash2,
  Heart, Calendar, FileText, Type, Eye, Send, Copy, Search,
  Sun, Moon, LayoutDashboard, Clock, CheckCircle2, Edit3, X,
  Smartphone, Monitor, Printer, ArrowUp, ArrowDown, User, Package,
  Bell, Palette as PaletteIcon, Crown, Flame, Gem, Star, BookOpen,
  MessageCircle, Zap, Info, ArrowLeftRight, CloudOff, Save, Maximize2,
  Upload, Camera, Image as ImageIcon, ZoomIn
} from 'lucide-react';
import type { Palette, FormState, PersonInfo, Programme, SubmittedOrder, UploadedImage, DesignPage, UploadOrderData } from './types';
import { useExtractMatter, type ExtractedMatter } from '@workspace/api-client-react';
import {
  INVITATION_TEMPLATES, DEITIES, RELATION_WORDS, CLOSING_TAGS, KIDS_LINES,
  PROGRAMME_PRESETS, FONTS, CARD_SIZES, SALUTATIONS
} from './data/constants';

/* ─── Storage keys ───────────────────────────────────────────────────────── */
const DRAFT_KEY = 'wmp_draft_v3';
const ORDERS_KEY = 'wmp_orders_v2';

/* ─── Colour palette ─────────────────────────────────────────────────────── */
const palette: { light: Palette; dark: Palette } = {
  light: {
    bg1: '#FBF5E6', bg2: '#F4E4C0',
    surface: 'rgba(255, 252, 243, 0.88)',
    border: 'rgba(196, 130, 52, 0.28)',
    text: '#1E0A10', subtext: 'rgba(30, 10, 16, 0.60)',
    primary: '#8C1A2A', primaryDark: '#5A0F1C',
    gold: '#C0892E', goldLight: '#D8AB48', goldDeep: '#8B6018',
    accent: '#C83A28', ink: '#1A0608',
  },
  dark: {
    bg1: '#0D0407', bg2: '#180810',
    surface: 'rgba(22, 8, 14, 0.82)',
    border: 'rgba(192, 137, 46, 0.30)',
    text: '#F5E8CC', subtext: 'rgba(245, 232, 204, 0.62)',
    primary: '#C83A28', primaryDark: '#8C1A2A',
    gold: '#D8AB48', goldLight: '#ECC870', goldDeep: '#C0892E',
    accent: '#ECC870', ink: '#FBF5E6',
  }
};

/* ─── UI Constants ───────────────────────────────────────────────────────── */
const LAYOUTS = [
  { id: 'royal',       name: 'Royal',       desc: 'Ornate borders, grand fonts',   icon: Crown },
  { id: 'traditional', name: 'Traditional', desc: 'Classic Indian aesthetic',      icon: Flame },
  { id: 'modern',      name: 'Modern',      desc: 'Clean, editorial spacing',      icon: Gem },
];

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
  3: 'Please add at least one programme with a date.',
};

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
  return { id: Date.now(), preset, name: p?.name || 'Our Function', date: '', hour: '07', minute: '00', ampm: 'PM', venue: '', address: '' };
};

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
  programmes: [
    { id: 1, preset: 'mehendi',   name: 'Mehendi Party',    date: '2026-12-13', hour: '04', minute: '00', ampm: 'PM', venue: 'Sharma Residence',  address: '12-B Rose Garden, Jaipur' },
    { id: 2, preset: 'haldi',     name: 'Haldi Ceremony',   date: '2026-12-14', hour: '10', minute: '00', ampm: 'AM', venue: 'Sharma Residence',  address: '12-B Rose Garden, Jaipur' },
    { id: 3, preset: 'wedding',   name: 'Wedding Ceremony', date: '2026-12-15', hour: '07', minute: '00', ampm: 'PM', venue: 'Taj Mahal Palace',  address: 'Ajmer Road, Jaipur - 302001' },
    { id: 4, preset: 'reception', name: 'Reception',        date: '2026-12-16', hour: '07', minute: '30', ampm: 'PM', venue: 'Taj Mahal Palace',  address: 'Ajmer Road, Jaipur - 302001' },
  ],
  withCompliments: 'Sharma & Mehta Families',
};

/* ─── AI matter → FormState mapper ───────────────────────────────────────── */
function matchDeities(names: string[]): string[] {
  const ids = new Set<string>();
  for (const raw of names) {
    const q = raw.toLowerCase();
    const hit = DEITIES.find(d =>
      q.includes(d.id) || d.name.toLowerCase().split(/\s+/).some(w => w.length > 2 && q.includes(w))
    );
    if (hit) ids.add(hit.id);
  }
  return ids.size ? [...ids] : ['ganesh'];
}

function matchLanguage(lang: string): string {
  const q = (lang || '').toLowerCase();
  if (q.includes('hindi')) return 'Hindi';
  if (q.includes('marathi')) return 'Marathi';
  if (q.includes('gujarati')) return 'Gujarati';
  return 'English';
}

function matchRelationWord(word: string): string {
  const q = (word || '').toLowerCase().trim();
  const hit = RELATION_WORDS.find(r => r.id === q || r.label.toLowerCase() === q);
  return hit ? hit.id : initialForm.relationWord;
}

function parseTime(time: string): { hour: string; minute: string; ampm: 'AM' | 'PM' } {
  const m = (time || '').match(/(\d{1,2})[:.]?(\d{2})?\s*(am|pm)?/i);
  if (!m) return { hour: '07', minute: '00', ampm: 'PM' };
  let h = parseInt(m[1], 10);
  const min = m[2] ?? '00';
  let ap = (m[3] || '').toUpperCase();
  if (!ap) { ap = h >= 12 ? 'PM' : 'AM'; }
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return { hour: String(h).padStart(2, '0'), minute: min.padStart(2, '0'), ampm: ap === 'AM' ? 'AM' : 'PM' };
}

function parseDate(date: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  // Use local date parts (not toISOString) to avoid a timezone off-by-one shift.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function matchPreset(name: string): string {
  const q = (name || '').toLowerCase();
  const hit = PROGRAMME_PRESETS.find(p => q.includes(p.id) || p.name.toLowerCase().split(/\s+/).some(w => w.length > 3 && q.includes(w)));
  return hit ? hit.id : 'custom';
}

function mapExtractedToForm(ext: ExtractedMatter): FormState {
  const person = (p: ExtractedMatter['bride'], fallbackName: string): PersonInfo => ({
    ...emptyPerson(),
    name: (p?.name || fallbackName || '').trim(),
    fatherName: (p?.fatherName || '').trim(),
    motherName: (p?.motherName || '').trim(),
    grandfatherName: (p?.grandfatherName || '').trim(),
    grandmotherName: (p?.grandmotherName || '').trim(),
  });

  const programmes: Programme[] = (ext.programmes || []).map((pr, i) => {
    const t = parseTime(pr.time);
    return {
      id: Date.now() + i,
      preset: matchPreset(pr.name),
      name: (pr.name || 'Our Function').trim(),
      date: parseDate(pr.date),
      hour: t.hour, minute: t.minute, ampm: t.ampm,
      venue: (pr.venue || '').trim(),
      address: (pr.address || '').trim(),
    };
  });

  return {
    ...initialForm,
    bride: person(ext.bride, ext.brideName),
    groom: person(ext.groom, ext.groomName),
    family: {
      title: (ext.familyTitle || '').trim(),
      nativePlace: (ext.nativePlace || '').trim(),
      residenceAddress: (ext.residenceAddress || '').trim(),
    },
    deities: matchDeities(ext.deities || []),
    relationWord: matchRelationWord(ext.relationWord),
    programmes: programmes.length ? programmes : [emptyProgramme('wedding')],
    withCompliments: (ext.familyTitle || '').trim(),
    design: { ...initialForm.design, language: matchLanguage(ext.language) },
  };
}

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
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);
  const above = form.aboveWeds === 'bride' ? form.bride : form.groom;
  const below = form.aboveWeds === 'bride' ? form.groom : form.bride;
  const childName = `${above.name || '___'} ${relation ? relation.label : 'Weds'} ${below.name || '___'}`;
  return text.replace(/\{child\}/g, childName)
    .replace(/\{bride\}/g, form.bride.name || '___')
    .replace(/\{groom\}/g, form.groom.name || '___');
}

function generateCorelText(form: FormState): string {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = KIDS_LINES.find(t => t.id === form.kidsLine);
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
  if (kidsLine) s += `\n─── KIDS LINE ───\n${kidsLine.label}\n`;
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

function loadOrders(): SubmittedOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SubmittedOrder[];
      // Migrate legacy orders that predate the `mode` discriminator
      return parsed.map(o => o.mode ? o : { ...o, mode: 'type' as const });
    }
  } catch { /* ignore */ }
  return [];
}

// Returns true on success, false if persistence failed (e.g. localStorage quota exceeded)
function saveOrders(orders: SubmittedOrder[]): boolean {
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    return true;
  } catch {
    return false;
  }
}

/* ─── Root App ───────────────────────────────────────────────────────────── */
export default function WeddingApp() {
  const [mode, setMode] = useState<'customer' | 'admin'>('customer');
  const [inputMode, setInputMode] = useState<'choose' | 'type' | 'upload'>('choose');
  const [dark, setDark] = useState(false);
  const [orders, setOrders] = useState<SubmittedOrder[]>(() => loadOrders());
  const c = dark ? palette.dark : palette.light;

  const ordersRef = React.useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  const addOrder = useCallback((order: SubmittedOrder): boolean => {
    const next = [order, ...ordersRef.current];
    if (!saveOrders(next)) return false;   // persistence failed — don't update UI
    setOrders(next);
    return true;
  }, []);

  useEffect(() => {
    const id = 'wmp-fonts-v3';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Playfair+Display:wght@400;700;900&family=Cinzel:wght@400;700;900&family=Cinzel+Decorative:wght@400;700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Marcellus&family=Tangerine:wght@400;700&family=Great+Vibes&family=Italianno&family=Pinyon+Script&family=Allura&family=Tiro+Devanagari+Hindi&family=Noto+Serif+Devanagari:wght@400;700&family=Rozha+One&family=Yatra+One&family=Sahitya:wght@400;700&family=Modak&family=Noto+Serif+Gujarati:wght@400;700&family=Rasa:wght@400;600&family=Hind+Vadodara:wght@400;600&display=swap';
    document.head.appendChild(link);
  }, []);

  return (
    <div className="min-h-screen relative transition-colors duration-700" style={{ background: c.bg1, color: c.text, fontFamily: "'EB Garamond', serif" }}>
      <Atmosphere c={c} />
      <Nav mode={mode} setMode={setMode} dark={dark} setDark={setDark} c={c} orderCount={orders.filter(o => o.status === 'New').length} />
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-32 pt-6">
        <AnimatePresence mode="wait">
          {mode === 'customer' ? (
            inputMode === 'choose' ? (
              <motion.div key="choose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
                <ModeChooser c={c} onPick={setInputMode} />
              </motion.div>
            ) : inputMode === 'type' ? (
              <motion.div key="c" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
                <CustomerFlow c={c} dark={dark} addOrder={addOrder} onBack={() => setInputMode('choose')} />
              </motion.div>
            ) : (
              <motion.div key="u" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
                <UploadFlow c={c} dark={dark} addOrder={addOrder} onBack={() => setInputMode('choose')} />
              </motion.div>
            )
          ) : (
            <motion.div key="a" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <AdminDashboard c={c} dark={dark} orders={orders} setOrders={o => { setOrders(o); saveOrders(o); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ─── Atmosphere ─────────────────────────────────────────────────────────── */
function Atmosphere({ c }: { c: Palette }) {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 15% 0%, ${c.gold}18 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, ${c.primary}1A 0%, transparent 55%), linear-gradient(180deg, ${c.bg1} 0%, ${c.bg2} 55%, ${c.bg1} 100%)` }} />
      <svg className="absolute -top-28 -right-28 w-[580px] h-[580px] opacity-[0.055]" viewBox="0 0 200 200">
        <defs><g id="petal"><path d="M100 30 Q 110 60 100 90 Q 90 60 100 30" fill={c.gold} /></g></defs>
        <circle cx="100" cy="100" r="95" fill="none" stroke={c.gold} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="78" fill="none" stroke={c.gold} strokeWidth="0.3" />
        {Array.from({ length: 24 }).map((_, i) => <use key={i} href="#petal" transform={`rotate(${i * 15} 100 100)`} />)}
      </svg>
    </div>
  );
}

/* ─── Navigation ─────────────────────────────────────────────────────────── */
function Nav({ mode, setMode, dark, setDark, c, orderCount }: { mode: string; setMode: (m: 'customer' | 'admin') => void; dark: boolean; setDark: (d: boolean) => void; c: Palette; orderCount: number }) {
  return (
    <nav className="relative z-20 border-b" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(24px)' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            <Heart className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold leading-none" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.2rem', color: c.text }}>Wedding Matter Pro</div>
            <div className="text-[9px] uppercase tracking-[0.3em] opacity-45">Premium Card Studio</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border p-0.5" style={{ borderColor: c.border }}>
            <button onClick={() => setMode('customer')} className="px-4 py-1.5 rounded-full text-[12px] font-bold transition-all"
              style={{ background: mode === 'customer' ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: mode === 'customer' ? 'white' : c.subtext }}>
              Customer
            </button>
            <button onClick={() => setMode('admin')} className="px-4 py-1.5 rounded-full text-[12px] font-bold transition-all flex items-center gap-1.5 relative"
              style={{ background: mode === 'admin' ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: mode === 'admin' ? 'white' : c.subtext }}>
              <LayoutDashboard className="w-3.5 h-3.5" /> Admin
              {orderCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: c.accent }}>{orderCount}</span>
              )}
            </button>
          </div>
          <button onClick={() => setDark(!dark)} className="w-9 h-9 rounded-full flex items-center justify-center border transition-all hover:scale-110" style={{ borderColor: c.border, background: c.surface }}>
            {dark ? <Sun className="w-4 h-4" style={{ color: c.gold }} /> : <Moon className="w-4 h-4" style={{ color: c.primary }} />}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ─── Customer Flow ──────────────────────────────────────────────────────── */
function CustomerFlow({ c, dark, addOrder, onBack }: { c: Palette; dark: boolean; addOrder: (o: SubmittedOrder) => boolean; onBack?: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [submitted, setSubmitted] = useState<SubmittedOrder | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
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

  const update = (path: string, value: unknown) => {
    setForm(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as FormState;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = next;
      const keys = path.split('.');
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
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
    if (step === 3) return form.programmes.length > 0 && form.programmes.some(p => p.date);
    return true;
  }, [step, form]);

  const showToast = (msg: string, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); };
  const next = () => { if (!canNext) { showToast(VALIDATION_HINTS[step] || 'Please complete this step.', 'error'); return; } setStep(s => Math.min(STEPS.length - 1, s + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const prev = () => { setStep(s => Math.max(0, s - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submit = () => {
    if (!form.meta.accepted) { showToast('Please tick the confirmation checkbox.', 'error'); return; }
    const order: SubmittedOrder = {
      orderId: `WMP-${Math.floor(2400 + Math.random() * 800)}`,
      at: new Date().toLocaleString(),
      couple: `${form.bride.name}${form.groom.name ? ` & ${form.groom.name}` : ''}`,
      mode: 'type',
      form: JSON.parse(JSON.stringify(form)),
      status: 'New',
    };
    if (!addOrder(order)) { showToast('Could not save — your device storage is full. Please clear some space and try again.', 'error'); return; }
    setSubmitted(order);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const coupleNames = form.bride.name && form.groom.name ? `${form.bride.name} & ${form.groom.name}` : null;

  if (submitted) return <Success submitted={submitted} c={c} form={form} dark={dark} onReset={() => { setSubmitted(null); setForm(initialForm); setStep(0); }} />;

  return (
    <div className="pt-4 sm:pt-6">
      {onBack && (
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5 border transition-all hover:scale-105" style={{ borderColor: c.border, color: c.subtext, background: c.surface }}>
          <ChevronLeft className="w-3.5 h-3.5" /> Change method
        </button>
      )}
      <Hero c={c} onFillSample={fillSample} onClear={clearDraft} hasDraft={JSON.stringify(form) !== JSON.stringify(initialForm)} />
      <Stepper step={step} setStep={setStep} c={c} dark={dark} saving={saving} offline={offline} />

      <div className="grid lg:grid-cols-12 gap-6 mt-6">
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28 }}>
              {step === 0 && <StepFamily form={form} update={update} setForm={setForm} c={c} dark={dark} />}
              {step === 1 && <StepDeities form={form} setForm={setForm} c={c} />}
              {step === 2 && <StepInvitation form={form} update={update} c={c} dark={dark} />}
              {step === 3 && <StepProgrammes form={form} setForm={setForm} c={c} />}
              {step === 4 && <StepExtras form={form} update={update} c={c} />}
              {step === 5 && <StepDesign form={form} update={update} c={c} dark={dark} />}
              {step === 6 && <StepPreview form={form} update={update} c={c} dark={dark} />}
              {step === 7 && <StepSubmit form={form} update={update} c={c} onSubmit={submit} setStep={setStep} />}
            </motion.div>
          </AnimatePresence>
          <NavButtons step={step} prev={prev} next={next} onSubmit={submit} c={c} canNext={canNext} />
        </div>

        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <div className="rounded-3xl border shadow-2xl overflow-hidden" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: c.border }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: c.gold }} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>Live Preview</span>
                  {coupleNames && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${c.primary}15`, color: c.primary }}>{coupleNames}</span>}
                </div>
                <button onClick={() => setPreviewExpanded(true)} className="p-2 rounded-full hover:scale-110 transition flex items-center gap-1 text-[11px] font-bold" style={{ color: c.gold, background: `${c.gold}12` }}>
                  <Maximize2 className="w-3.5 h-3.5" /> Expand
                </button>
              </div>
              <div className="p-3"><CardPreview form={form} c={c} dark={dark} compact /></div>
              <div className="px-4 pb-3">
                <button onClick={() => setPreviewExpanded(true)} className="w-full py-2.5 rounded-2xl text-[12px] font-bold text-white tracking-wide transition hover:opacity-90 active:scale-95 lg:hidden"
                  style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
                  👁️ View Full Card
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {previewExpanded && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreviewExpanded(false)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }} onClick={e => e.stopPropagation()} className="max-w-lg w-full my-8">
              {coupleNames && <div className="text-center text-white/80 mb-4" style={{ fontFamily: "'Tangerine', cursive", fontSize: '2.2rem' }}>{coupleNames}</div>}
              <CardPreview form={form} c={c} dark={dark} />
              <button onClick={() => setPreviewExpanded(false)} className="mt-5 w-full py-3.5 rounded-full text-white font-bold text-sm tracking-wide"
                style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>✓ Close Preview</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 48, scale: 0.88 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 48, scale: 0.88 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-full shadow-2xl text-sm font-bold text-white flex items-center gap-2 max-w-xs text-center"
            style={{ background: toast.type === 'error' ? `linear-gradient(135deg, ${c.primary}, #c44)` : `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            {toast.type === 'error' ? <Info className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────── */
function Hero({ c, onFillSample, onClear, hasDraft }: { c: Palette; onFillSample: () => void; onClear: () => void; hasDraft: boolean }) {
  return (
    <div className="text-center mb-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-[0.25em] mb-5"
        style={{ borderColor: c.border, color: c.gold, background: `${c.gold}12` }}>
        <Sparkles className="w-3 h-3" /> Premium Card Studio
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="font-medium leading-[1.05] tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(2.6rem, 6vw, 4.5rem)' }}>
        Pick your perfect
        <br />
        <span style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.45em', fontWeight: 700, lineHeight: 0.85 }}>wedding matter</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
        className="mt-4 max-w-sm mx-auto leading-relaxed font-medium" style={{ color: c.subtext, fontSize: '1.05rem' }}>
        15 clean invitation texts · 12 deities · No writing needed
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}
        className="flex items-center justify-center gap-2 sm:gap-4 mt-6 flex-wrap">
        {[{ n:'1',l:'Fill names' },{ n:'2',l:'Pick deities' },{ n:'3',l:'Choose text' },{ n:'4',l:'Add events' },{ n:'5',l:'Submit!' }].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: c.gold }}>{s.n}</div>
              <span className="text-sm font-semibold" style={{ color: c.subtext }}>{s.l}</span>
            </div>
            {i < 4 && <ChevronRight className="w-3 h-3 opacity-30" />}
          </React.Fragment>
        ))}
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.36 }} className="mt-5 flex items-center justify-center gap-2 flex-wrap">
        <button onClick={onFillSample} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-bold transition-all hover:scale-105 active:scale-95"
          style={{ borderColor: c.gold, color: c.gold, background: `${c.gold}10` }}>
          <Zap className="w-3.5 h-3.5" /> See a sample card first
        </button>
        {hasDraft && (
          <button onClick={onClear} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all hover:scale-105"
            style={{ borderColor: c.border, color: c.subtext }}>
            <X className="w-3 h-3" /> Clear & start fresh
          </button>
        )}
      </motion.div>
      <Divider c={c} />
    </div>
  );
}

function Divider({ c, w = 'w-28' }: { c: Palette; w?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 mt-6">
      <div className={`h-px ${w}`} style={{ background: `linear-gradient(90deg, transparent, ${c.gold})` }} />
      <svg width="18" height="18" viewBox="0 0 20 20" fill={c.gold}><path d="M10 2 L 12 8 L 18 10 L 12 12 L 10 18 L 8 12 L 2 10 L 8 8 Z" /></svg>
      <div className={`h-px ${w}`} style={{ background: `linear-gradient(90deg, ${c.gold}, transparent)` }} />
    </div>
  );
}

/* ─── Stepper ────────────────────────────────────────────────────────────── */
function Stepper({ step, setStep, c, dark, saving, offline }: { step: number; setStep: (n: number) => void; c: Palette; dark: boolean; saving: boolean; offline: boolean }) {
  const pct = (step / (STEPS.length - 1)) * 100;
  return (
    <div className="rounded-3xl border p-5 shadow-xl" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>Step {step + 1} of {STEPS.length} · {STEPS[step].label}</div>
          <div className="text-sm mt-0.5 leading-snug font-medium" style={{ color: c.subtext }}>{STEPS[step].tip}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {offline && <div className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: '#f9923220', color: '#f97316' }}><CloudOff className="w-3 h-3" /> Offline</div>}
          <motion.div animate={{ opacity: saving ? 1 : 0.65 }} className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: saving ? c.gold : c.subtext }}>
            {saving ? (<><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.gold }} />Saving…</>) : (<><Save className="w-3 h-3" style={{ color: '#22c55e' }} />Saved</>)}
          </motion.div>
        </div>
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden mb-5" style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}>
        <motion.div initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 65, damping: 18 }}
          className="absolute inset-y-0 left-0 rounded-full" style={{ background: `linear-gradient(90deg, ${c.primary}, ${c.gold})` }} />
      </div>
      <div className="flex justify-between gap-0.5 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => i <= step && setStep(i)} disabled={i > step} title={s.label}
              className="flex flex-col items-center gap-1.5 min-w-[52px] py-1 px-1 transition disabled:cursor-not-allowed disabled:opacity-35">
              <div className="relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
                style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : done ? `${c.primary}22` : 'transparent', border: `1.5px solid ${active ? 'transparent' : done ? c.primary : c.border}`, color: active ? 'white' : done ? c.primary : c.subtext, boxShadow: active ? `0 6px 18px -6px ${c.primary}90` : 'none', transform: active ? 'scale(1.1)' : 'scale(1)' }}>
                {done ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Icon className="w-3.5 h-3.5" />}
              </div>
              <div className="text-[9px] font-bold whitespace-nowrap leading-none" style={{ color: active ? c.gold : done ? c.primary : c.subtext }}>{s.short}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Nav Buttons ────────────────────────────────────────────────────────── */
function NavButtons({ step, prev, next, onSubmit, c, canNext }: { step: number; prev: () => void; next: () => void; onSubmit: () => void; c: Palette; canNext: boolean }) {
  const hint = !canNext && VALIDATION_HINTS[step];
  return (
    <div className="mt-6 space-y-3">
      {hint && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 px-4 py-3 rounded-2xl text-sm font-semibold leading-snug"
          style={{ background: `${c.gold}12`, border: `1px solid ${c.gold}30`, color: c.gold }}>
          <Info className="w-4 h-4 shrink-0 mt-0.5" /> {hint}
        </motion.div>
      )}
      <div className="flex items-center justify-between gap-3">
        <button onClick={prev} disabled={step === 0}
          className="flex items-center gap-1.5 px-5 py-3 rounded-full border text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95"
          style={{ borderColor: c.border, background: c.surface, color: c.text }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <motion.button onClick={next} whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }}
            className="flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white shadow-2xl tracking-wide"
            style={{ background: canNext ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.subtext}38`, boxShadow: canNext ? `0 12px 36px -10px ${c.primary}70` : 'none' }}>
            Continue <ChevronRight className="w-4 h-4" />
          </motion.button>
        ) : (
          <motion.button onClick={onSubmit} whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }}
            className="flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white shadow-2xl tracking-wide"
            style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 12px 36px -10px ${c.primary}70` }}>
            Submit to Designer <Send className="w-4 h-4" />
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ─── Reusable UI ────────────────────────────────────────────────────────── */
function Section({ title, subtitle, children, c, icon: Icon, eyebrow, tip }: { title: string; subtitle?: string; children: React.ReactNode; c: Palette; dark?: boolean; icon?: React.ElementType; eyebrow?: string; tip?: string }) {
  return (
    <div className="rounded-3xl border shadow-xl overflow-hidden" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
      <div className="px-6 sm:px-8 pt-6 pb-5 border-b relative" style={{ borderColor: c.border }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.gold}80, transparent)` }} />
        <div className="flex items-start gap-4">
          {Icon && <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${c.primary}18, ${c.gold}22)`, border: `1px solid ${c.border}` }}><Icon className="w-5 h-5" style={{ color: c.gold }} /></div>}
          <div className="min-w-0">
            {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.28em] mb-1" style={{ color: c.gold }}>{eyebrow}</div>}
            <h2 className="font-medium leading-tight" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>{title}</h2>
            {subtitle && <p className="text-sm mt-1 leading-snug font-medium" style={{ color: c.subtext }}>{subtitle}</p>}
            {tip && <div className="flex items-start gap-1.5 mt-2 text-xs font-bold" style={{ color: c.gold }}><Sparkles className="w-3 h-3 shrink-0 mt-0.5" /> {tip}</div>}
          </div>
        </div>
      </div>
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  );
}

function Field({ label, children, hint, required, c }: { label: string; children: React.ReactNode; hint?: string; required?: boolean; c: Palette }) {
  return (
    <label className="block">
      <div className="text-xs font-bold uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5" style={{ color: c.subtext }}>
        {label} {required && <span style={{ color: '#C83A28' }}>*</span>}
        {hint && <span className="text-[10px] font-normal normal-case tracking-normal opacity-70">— {hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({ c, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { c: Palette }) {
  return (
    <input className={`w-full px-4 py-3 rounded-2xl text-sm font-medium transition-all outline-none ${className}`}
      style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text }}
      onFocus={e => { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = 'rgba(255,255,255,0.55)'; }}
      {...props} />
  );
}

function Textarea({ c, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { c: Palette }) {
  return (
    <textarea className="w-full px-4 py-3 rounded-2xl text-sm font-medium transition-all outline-none resize-none"
      style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text }}
      onFocus={e => { e.currentTarget.style.borderColor = c.gold; }}
      onBlur={e => { e.currentTarget.style.borderColor = c.border; }}
      {...props} />
  );
}

function Select({ c, children, className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { c: Palette }) {
  return (
    <select className={`w-full px-4 py-3 rounded-2xl text-sm font-medium transition-all outline-none appearance-none cursor-pointer ${className}`}
      style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(c.gold)}' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', paddingRight: '2.5rem' }}
      {...props}>{children}</select>
  );
}

/* Salutation + Name row */
function SalutNameField({ label, salValue, salPath, nameValue, namePath, namePlaceholder, required, update, c }: { label: string; salValue: string; salPath: string; nameValue: string; namePath: string; namePlaceholder?: string; required?: boolean; update: (path: string, value: unknown) => void; c: Palette }) {
  return (
    <Field label={label} required={required} c={c}>
      <div className="flex gap-2">
        <select value={salValue} onChange={e => update(salPath, e.target.value)}
          className="shrink-0 px-3 py-3 rounded-2xl text-sm font-medium outline-none appearance-none cursor-pointer"
          style={{ width: '130px', background: `${c.gold}15`, border: `1.5px solid ${c.gold}60`, color: c.gold }}>
          <option value="">—</option>
          {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Input c={c} className="flex-1" value={nameValue} onChange={e => update(namePath, e.target.value)} placeholder={namePlaceholder} />
      </div>
    </Field>
  );
}

/* 12-hour time picker */
function TimePicker({ hour, minute, ampm, onChange, c }: { hour: string; minute: string; ampm: 'AM' | 'PM'; onChange: (h: string, m: string, ap: 'AM' | 'PM') => void; c: Palette }) {
  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const mins = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
  return (
    <div className="flex items-center gap-2">
      <select value={hour} onChange={e => onChange(e.target.value, minute, ampm)}
        className="px-3 py-3 rounded-2xl text-sm font-medium outline-none appearance-none cursor-pointer text-center"
        style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text, width: '72px' }}>
        {hours.map(h => <option key={h}>{h}</option>)}
      </select>
      <span className="font-bold text-lg" style={{ color: c.gold }}>:</span>
      <select value={minute} onChange={e => onChange(hour, e.target.value, ampm)}
        className="px-3 py-3 rounded-2xl text-sm font-medium outline-none appearance-none cursor-pointer text-center"
        style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text, width: '72px' }}>
        {mins.map(m => <option key={m}>{m}</option>)}
      </select>
      <div className="flex rounded-2xl overflow-hidden border-2" style={{ borderColor: c.border }}>
        {(['AM', 'PM'] as const).map(ap => (
          <button key={ap} type="button" onClick={() => onChange(hour, minute, ap)}
            className="px-4 py-3 text-sm font-bold transition-all"
            style={{ background: ampm === ap ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'rgba(255,255,255,0.5)', color: ampm === ap ? 'white' : c.subtext }}>
            {ap}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 0: Family ─────────────────────────────────────────────────────── */
function StepFamily({ form, update, setForm, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette; dark: boolean }) {
  const filled = form.bride.name && form.groom.name;

  return (
    <Section title="The Two Families" eyebrow="Step 1 of 8"
      subtitle="Enter names of bride, groom, their parents and grandparents."
      c={c} icon={Heart}>

      {filled && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-4 rounded-2xl text-center border"
          style={{ borderColor: `${c.gold}40`, background: `linear-gradient(135deg, ${c.gold}10, ${c.primary}08)` }}>
          <div style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '2rem' }}>🌹 {form.bride.name} & {form.groom.name}</div>
          <div className="text-xs font-bold uppercase tracking-wider mt-1" style={{ color: c.subtext }}>Your card is looking beautiful!</div>
        </motion.div>
      )}

      {/* Above / Below Weds toggle */}
      <div className="mb-6 p-4 rounded-2xl border" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.35)' }}>
        <div className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: c.gold }}>Which Name Appears Above "Weds"?</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {(['bride', 'groom'] as const).map(side => (
            <button key={side} onClick={() => update('aboveWeds', side)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-sm font-bold transition-all"
              style={{ borderColor: form.aboveWeds === side ? c.gold : c.border, background: form.aboveWeds === side ? `${c.gold}15` : 'transparent', color: form.aboveWeds === side ? c.gold : c.text }}>
              {side === 'bride' ? '👰' : '🤵'} {side.charAt(0).toUpperCase() + side.slice(1)} above Weds
            </button>
          ))}
        </div>
        <div className="text-xs mt-2 font-medium" style={{ color: c.subtext }}>
          <ArrowLeftRight className="w-3 h-3 inline mr-1" />
          {form.aboveWeds === 'bride' ? `${form.bride.name || 'Bride'} above · ${form.groom.name || 'Groom'} below` : `${form.groom.name || 'Groom'} above · ${form.bride.name || 'Bride'} below`}
        </div>
      </div>

      {/* Host type */}
      <div className="mb-6">
        <Field label="Who is inviting?" c={c}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
            {[{ id: 'parents', label: 'Parents', emoji: '👨‍👩‍👧' }, { id: 'grandparents', label: 'Grandparents', emoji: '👴👵' }, { id: 'siblings', label: 'Siblings', emoji: '👫' }, { id: 'self', label: 'Couple Themselves', emoji: '💑' }].map(h => (
              <button key={h.id} onClick={() => update('hostType', h.id)}
                className="py-3 px-2 rounded-2xl border-2 text-sm font-bold transition-all text-center"
                style={{ borderColor: form.hostType === h.id ? c.gold : c.border, background: form.hostType === h.id ? `${c.gold}15` : 'rgba(255,255,255,0.4)', color: form.hostType === h.id ? c.gold : c.text }}>
                <div className="text-xl mb-1">{h.emoji}</div>{h.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <PersonCard side="Bride" person={form.bride} update={update} prefix="bride" c={c} />
        <PersonCard side="Groom" person={form.groom} update={update} prefix="groom" c={c} />
      </div>

      <div className="mt-7 pt-6 border-t" style={{ borderColor: c.border }}>
        <div className="text-xs font-bold uppercase tracking-[0.25em] mb-4" style={{ color: c.gold }}>Family Details (Optional)</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Family Title" hint="e.g. Parivaar" c={c}><Input c={c} value={form.family.title} onChange={e => update('family.title', e.target.value)} placeholder="Parivaar" /></Field>
          <Field label="Native Place" c={c}><Input c={c} value={form.family.nativePlace} onChange={e => update('family.nativePlace', e.target.value)} placeholder="Jaipur, Rajasthan" /></Field>
          <div className="sm:col-span-2"><Field label="Residence Address" c={c}><Input c={c} value={form.family.residenceAddress} onChange={e => update('family.residenceAddress', e.target.value)} placeholder="House No, Street, City" /></Field></div>
        </div>
      </div>
    </Section>
  );
}

function PersonCard({ side, person, update, prefix, c }: { side: string; person: PersonInfo; update: (path: string, value: unknown) => void; prefix: string; c: Palette }) {
  const isBride = side === 'Bride';
  return (
    <div className="rounded-2xl p-5 border relative overflow-hidden" style={{ borderColor: c.border, background: `linear-gradient(180deg, ${isBride ? c.primary : c.gold}08, transparent)` }}>
      <div className="absolute top-3 right-3 text-2xl opacity-20 select-none">{isBride ? '👰' : '🤵'}</div>
      <div className="text-xs font-bold uppercase tracking-[0.3em] mb-4" style={{ color: isBride ? c.primary : c.goldDeep }}>
        {isBride ? '👰' : '🤵'} {side}
      </div>
      <div className="space-y-3">
        {/* Name — no salutation for bride/groom themselves */}
        <Field label={`${side}'s Full Name`} required c={c}>
          <Input c={c} value={person.name} onChange={e => update(`${prefix}.name`, e.target.value)} placeholder={isBride ? 'Aditi Sharma' : 'Rohan Mehta'} />
        </Field>
        {/* Father */}
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.12em] mb-1.5 flex items-center gap-1.5" style={{ color: c.subtext }}>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-black" style={{ background: `${c.gold}25`, color: c.gold }}>{isBride ? 'D/o' : 'S/o'}</span>
            Father's Name
          </div>
          <div className="flex gap-2">
            <select value={person.fatherPrefix} onChange={e => update(`${prefix}.fatherPrefix`, e.target.value)}
              className="shrink-0 px-3 py-3 rounded-2xl text-sm font-medium outline-none appearance-none cursor-pointer"
              style={{ width: '120px', background: `${c.gold}15`, border: `1.5px solid ${c.gold}60`, color: c.gold }}>
              <option value="">—</option>
              {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <Input c={c} className="flex-1" value={person.fatherName} onChange={e => update(`${prefix}.fatherName`, e.target.value)} placeholder={isBride ? 'Rajesh Sharma' : 'Mahesh Mehta'} />
          </div>
        </div>
        {/* Mother */}
        <SalutNameField label="Mother's Name" salValue={person.motherPrefix} salPath={`${prefix}.motherPrefix`} nameValue={person.motherName} namePath={`${prefix}.motherName`} namePlaceholder={isBride ? 'Sunita Sharma' : 'Kavita Mehta'} update={update} c={c} />
        {/* Grandparents — two separate rows */}
        <div className="pt-2 border-t" style={{ borderColor: c.border }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: c.subtext }}>Grandparents (Optional)</div>
          <div className="space-y-2">
            <SalutNameField label="Grandfather's Name" salValue={person.grandfatherPrefix} salPath={`${prefix}.grandfatherPrefix`} nameValue={person.grandfatherName} namePath={`${prefix}.grandfatherName`} namePlaceholder="Full Name" update={update} c={c} />
            <SalutNameField label="Grandmother's Name" salValue={person.grandmotherPrefix} salPath={`${prefix}.grandmotherPrefix`} nameValue={person.grandmotherName} namePath={`${prefix}.grandmotherName`} namePlaceholder="Full Name" update={update} c={c} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 1: Deities ────────────────────────────────────────────────────── */
function StepDeities({ form, setForm, c }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette }) {
  const toggle = (id: string) => setForm(prev => ({ ...prev, deities: prev.deities.includes(id) ? prev.deities.filter(d => d !== id) : [...prev.deities, id] }));
  return (
    <Section title="Deities & Blessings" eyebrow="Step 2 of 8"
      subtitle="Tap any deity to add it. Numbers show the order on your card."
      tip={`${form.deities.length} selected`} c={c} icon={Star}>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {DEITIES.map(d => {
          const active = form.deities.includes(d.id);
          const order = form.deities.indexOf(d.id) + 1;
          return (
            <motion.button key={d.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.94 }} onClick={() => toggle(d.id)}
              className="relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all p-3"
              style={{ borderColor: active ? c.gold : c.border, background: active ? `linear-gradient(135deg, ${c.gold}22, ${c.primary}16)` : 'rgba(255,255,255,0.45)', boxShadow: active ? `0 8px 24px -8px ${c.gold}60` : 'none' }}>
              <div className="text-3xl">{d.glyph}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight" style={{ color: active ? c.gold : c.subtext }}>{d.name}</div>
              {active && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: c.gold }}>{order}</motion.div>}
            </motion.button>
          );
        })}
      </div>
    </Section>
  );
}

/* ─── Step 2: Invitation Text ────────────────────────────────────────────── */
function StepInvitation({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const cats = ['All', ...Array.from(new Set(INVITATION_TEMPLATES.map(t => t.category)))];
  const filtered = INVITATION_TEMPLATES.filter(t => (cat === 'All' || t.category === cat) && t.preview.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Section title="Invitation Text" eyebrow="Step 3 of 8"
        subtitle="15 clean invitation paragraphs — no parent names included. Just pick one!"
        tip="Click any card to select it." c={c} icon={BookOpen}>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" /><Input c={c} className="pl-10" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <Select c={c} className="sm:w-44" value={cat} onChange={e => setCat(e.target.value)}>{cats.map(ct => <option key={ct}>{ct}</option>)}</Select>
        </div>
        <div className="grid gap-3 max-h-[480px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {filtered.map(t => {
            const active = form.selectedTemplate === t.id;
            return (
              <motion.button key={t.id} whileHover={{ x: 3 }} onClick={() => update('selectedTemplate', t.id)}
                className="text-left p-4 rounded-2xl border-2 transition-all"
                style={{ borderColor: active ? c.gold : c.border, background: active ? `linear-gradient(135deg, ${c.gold}14, ${c.primary}08)` : 'rgba(255,255,255,0.45)', boxShadow: active ? `0 8px 24px -8px ${c.gold}40` : 'none' }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold mt-0.5" style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`, color: active ? 'white' : c.gold }}>{t.id}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${c.gold}15`, color: c.gold }}>{t.category}</span>
                      {active && <span className="text-[10px] font-bold text-green-600 flex items-center gap-0.5"><Check className="w-3 h-3" strokeWidth={3} /> Selected</span>}
                    </div>
                    <p className="text-sm italic leading-relaxed line-clamp-2" style={{ color: c.text, opacity: 0.82 }}>{t.preview}</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </Section>
      <div className="mt-5">
        <Section title="Relation Word" eyebrow="Between Names" subtitle="How the couple is joined on the card" c={c} icon={Heart}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {RELATION_WORDS.map(r => {
              const active = form.relationWord === r.id;
              return (
                <motion.button key={r.id} whileHover={{ y: -2 }} onClick={() => update('relationWord', r.id)}
                  className="py-3 px-2 rounded-2xl border-2 text-center transition-all"
                  style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}15` : 'rgba(255,255,255,0.4)', color: active ? c.gold : c.text, fontFamily: "'Tangerine', cursive", fontSize: '1.3rem', fontWeight: 700 }}>
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
function StepProgrammes({ form, setForm, c }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette }) {
  const addProg = (preset: string) => setForm(prev => ({ ...prev, programmes: [...prev.programmes, emptyProgramme(preset)] }));
  const removeProg = (id: number) => setForm(prev => ({ ...prev, programmes: prev.programmes.filter(f => f.id !== id) }));
  const updateProg = (id: number, key: keyof Programme, val: string) => setForm(prev => ({ ...prev, programmes: prev.programmes.map(f => f.id === id ? { ...f, [key]: val } : f) }));
  const move = (id: number, dir: number) => {
    const idx = form.programmes.findIndex(f => f.id === id);
    const tgt = idx + dir;
    if (tgt < 0 || tgt >= form.programmes.length) return;
    const next = [...form.programmes]; [next[idx], next[tgt]] = [next[tgt], next[idx]];
    setForm(prev => ({ ...prev, programmes: next }));
  };

  return (
    <Section title="Functions & Events" eyebrow="Step 4 of 8" subtitle="Add all functions. Date is required for each." tip="Tap a quick-add button to instantly add that function." c={c} icon={Calendar}>
      <div className="mb-6">
        <div className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: c.subtext }}>Quick Add</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {PROGRAMME_PRESETS.filter(p => p.id !== 'custom').map(p => (
            <motion.button key={p.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => addProg(p.id)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all hover:shadow-md" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.55)' }}>
              <span className="text-xl">{p.icon}</span>
              <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: c.text }}>{p.name}</span>
            </motion.button>
          ))}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => addProg('custom')}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            <Plus className="w-5 h-5" /><span className="text-[10px] font-bold">Custom</span>
          </motion.button>
        </div>
      </div>

      {form.programmes.length === 0 && (
        <div className="text-center py-10 rounded-2xl border-2 border-dashed text-sm font-medium" style={{ borderColor: c.border, color: c.subtext }}>
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />Tap a function above to add it
        </div>
      )}

      <div className="space-y-4">
        <AnimatePresence>
          {form.programmes.map((f, i) => {
            const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
            return (
              <motion.div key={f.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                className="rounded-2xl border overflow-hidden" style={{ borderColor: !f.date ? `${c.accent}50` : c.border, background: 'rgba(255,255,255,0.45)' }}>
                <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: c.border, background: `${preset?.color || c.gold}10` }}>
                  <div className="flex flex-col">
                    <button onClick={() => move(f.id, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-20" style={{ color: c.gold }}><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => move(f.id, 1)} disabled={i === form.programmes.length - 1} className="p-0.5 disabled:opacity-20" style={{ color: c.gold }}><ArrowDown className="w-3 h-3" /></button>
                  </div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${preset?.color || c.gold}22` }}>{preset?.icon || '✨'}</div>
                  <input value={f.name} onChange={e => updateProg(f.id, 'name', e.target.value)}
                    className="flex-1 bg-transparent font-semibold outline-none text-base min-w-0" style={{ color: c.text }} placeholder="Function name" />
                  {!f.date && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${c.accent}18`, color: c.accent }}>Add date ↓</span>}
                  <button onClick={() => removeProg(f.id)} className="p-2 rounded-lg transition shrink-0" style={{ color: '#dc2626' }}><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="p-4 space-y-3">
                  {/* Date */}
                  <Field label="Date" required c={c}><Input c={c} type="date" value={f.date} onChange={e => updateProg(f.id, 'date', e.target.value)} /></Field>
                  {/* Time — 12h with AM/PM */}
                  <Field label="Time" c={c}>
                    <TimePicker hour={f.hour} minute={f.minute} ampm={f.ampm as 'AM' | 'PM'}
                      onChange={(h, m, ap) => setForm(prev => ({ ...prev, programmes: prev.programmes.map(p => p.id === f.id ? { ...p, hour: h, minute: m, ampm: ap } : p) }))}
                      c={c} />
                  </Field>
                  {/* Venue */}
                  <Field label="Venue Name" c={c}><Input c={c} value={f.venue} onChange={e => updateProg(f.id, 'venue', e.target.value)} placeholder="e.g. Taj Palace Banquet Hall" /></Field>
                  {/* Address */}
                  <Field label="Full Address" c={c}><Textarea c={c} rows={2} value={f.address} onChange={e => updateProg(f.id, 'address', e.target.value)} placeholder="Street, City, PIN Code" /></Field>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Section>
  );
}

/* ─── Step 4: Extras ─────────────────────────────────────────────────────── */
function StepExtras({ form, update, c }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette }) {
  return (
    <>
      <Section title="Closing Line" eyebrow="Step 5A of 8" subtitle="Message about blessings and gifts." c={c} icon={Star}>
        <div className="grid sm:grid-cols-2 gap-2">
          {CLOSING_TAGS.map(t => {
            const active = form.closingTag === t.id;
            return (
              <motion.button key={t.id} whileHover={{ x: 2 }} onClick={() => update('closingTag', t.id)}
                className="flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all"
                style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}12` : 'rgba(255,255,255,0.45)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`, color: active ? 'white' : c.gold }}>{t.id.toUpperCase()}</div>
                <span className="text-sm flex-1 leading-snug font-medium" style={{ color: c.text }}>{t.label}</span>
                {active && <Check className="w-4 h-4 shrink-0" style={{ color: c.gold }} strokeWidth={3} />}
              </motion.button>
            );
          })}
        </div>
      </Section>
      <div className="mt-5">
        <Section title="Kids Message" eyebrow="Optional" subtitle="A cute message from the little ones." c={c} icon={Heart}>
          <div className="grid gap-2">
            <motion.button whileHover={{ x: 2 }} onClick={() => update('kidsLine', '')}
              className="flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all"
              style={{ borderColor: form.kidsLine === '' ? c.gold : c.border, background: form.kidsLine === '' ? `${c.gold}10` : 'rgba(255,255,255,0.45)' }}>
              <X className="w-4 h-4 shrink-0 opacity-40" />
              <span className="text-sm italic font-medium" style={{ color: c.subtext }}>No kids message</span>
            </motion.button>
            {KIDS_LINES.map(t => {
              const active = form.kidsLine === t.id;
              return (
                <motion.button key={t.id} whileHover={{ x: 2 }} onClick={() => update('kidsLine', t.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}10` : 'rgba(255,255,255,0.45)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`, color: active ? 'white' : c.gold }}>{t.id}</div>
                  <span className="text-sm flex-1 leading-snug font-medium" style={{ color: c.text }}>{t.label}</span>
                  {active && <Check className="w-4 h-4 shrink-0" style={{ color: c.gold }} strokeWidth={3} />}
                </motion.button>
              );
            })}
          </div>
        </Section>
      </div>
      <div className="mt-5">
        <Section title="With Best Compliments" eyebrow="Optional" subtitle="Names of well-wishers to list at the bottom." c={c} icon={FileText}>
          <Textarea c={c} rows={3} value={form.withCompliments} onChange={e => update('withCompliments', e.target.value)} placeholder="e.g. Sharma & Gupta Families, All relatives…" />
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
  const filtered = FONTS.filter(f => (cat === 'All' || f.cat === cat) && (form.design.language === 'English' ? f.langs.includes('English') : f.langs.includes(form.design.language) || f.langs.includes('English')) && f.name.toLowerCase().includes(search.toLowerCase()));
  const previewText = form.design.language === 'Hindi' ? 'विवाह आमंत्रण' : form.design.language === 'Marathi' ? 'विवाह सोहळा' : form.design.language === 'Gujarati' ? 'લગ્ન આમંત્રણ' : 'Wedding Invitation';

  return (
    <>
      <Section title="Layout & Language" eyebrow="Step 6A of 8" subtitle="Choose language and card layout." c={c} icon={PaletteIcon}>
        <Field label="Card Language" c={c}>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {['English', 'Hindi', 'Marathi', 'Gujarati'].map(l => (
              <button key={l} onClick={() => update('design.language', l)}
                className="py-3 rounded-2xl border-2 text-sm font-bold transition-all"
                style={{ borderColor: form.design.language === l ? c.gold : c.border, background: form.design.language === l ? `${c.gold}15` : 'rgba(255,255,255,0.4)', color: form.design.language === l ? c.gold : c.text }}>
                {l}
              </button>
            ))}
          </div>
        </Field>
        <div className="mt-5">
          <Field label="Card Layout Style" c={c}>
            <div className="grid sm:grid-cols-3 gap-3 mt-1">
              {LAYOUTS.map(l => {
                const Icon = l.icon; const active = form.design.layout === l.id;
                return (
                  <motion.button key={l.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => update('design.layout', l.id)}
                    className="p-4 rounded-2xl border-2 text-left transition-all"
                    style={{ borderColor: active ? c.gold : c.border, background: active ? `linear-gradient(135deg, ${c.gold}12, ${c.primary}08)` : 'rgba(255,255,255,0.4)', boxShadow: active ? `0 10px 30px -10px ${c.gold}50` : 'none' }}>
                    <Icon className="w-5 h-5 mb-2" style={{ color: active ? c.gold : c.subtext }} />
                    <div className="font-bold text-sm" style={{ color: c.text }}>{l.name}</div>
                    <div className="text-xs mt-0.5 font-medium" style={{ color: c.subtext }}>{l.desc}</div>
                  </motion.button>
                );
              })}
            </div>
          </Field>
        </div>
      </Section>
      <div className="mt-5">
        <Section title="Typography" eyebrow="Step 6B · Optional" subtitle="Fine-tune fonts and sizes." c={c} icon={Type}>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <SliderField label="Font Size" value={form.design.fontSize} min={12} max={22} step={1} unit="px" onChange={v => update('design.fontSize', v)} c={c} />
            <SliderField label="Letter Spacing" value={form.design.letterSpacing} min={0} max={4} step={0.1} unit="px" onChange={v => update('design.letterSpacing', v)} c={c} />
            <SliderField label="Line Height" value={form.design.lineHeight} min={1.2} max={2.2} step={0.05} unit="×" onChange={v => update('design.lineHeight', v)} c={c} />
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: c.border }}>
            <div className="flex gap-1 p-2 m-2 rounded-xl" style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
              {[{ k: 'heading', l: 'Heading' }, { k: 'body', l: 'Body' }, { k: 'script', l: 'Script' }].map(t => (
                <button key={t.k} onClick={() => setTarget(t.k)} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{ background: target === t.k ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: target === t.k ? 'white' : c.subtext }}>{t.l}</button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 px-3 pb-2">
              <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" /><Input c={c} className="pl-10" placeholder="Search fonts…" value={search} onChange={e => setSearch(e.target.value)} /></div>
              <Select c={c} className="sm:w-40" value={cat} onChange={e => setCat(e.target.value)}>{cats.map(ct => <option key={ct}>{ct}</option>)}</Select>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-3 pt-0">
              {filtered.map(f => {
                const targetKey = target === 'heading' ? 'headingFont' : target === 'body' ? 'bodyFont' : 'scriptFont';
                const active = form.design[targetKey as keyof typeof form.design] === f.family;
                return (
                  <motion.button key={f.name} whileHover={{ y: -2 }} onClick={() => update(`design.${targetKey}`, f.family)}
                    className="flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}12` : 'rgba(255,255,255,0.55)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate" style={{ fontFamily: f.family, fontSize: '1.35em', color: c.text, lineHeight: 1.1 }}>{previewText}</div>
                      <div className="text-[10px] mt-1 flex items-center gap-2" style={{ color: c.subtext }}>
                        <span className="font-bold">{f.name}</span><span className="opacity-50">·</span><span>{f.cat}</span>
                      </div>
                    </div>
                    {active && <Check className="w-4 h-4 shrink-0 ml-2" style={{ color: c.gold }} strokeWidth={3} />}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}

function SliderField({ label, value, min, max, step, unit, onChange, c }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; c: Palette }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: c.subtext }}>{label}</div>
        <div className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg" style={{ color: c.gold, background: `${c.gold}12` }}>{value}{unit}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ accentColor: c.gold }} />
    </div>
  );
}

/* ─── Step 6: Preview ────────────────────────────────────────────────────── */
function StepPreview({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  return (
    <Section title="Preview Your Card" eyebrow="Step 7 of 8" subtitle="Exactly how the designer will receive it." tip="Check all names and dates before submitting." c={c} icon={Eye}>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[{ k: 'desktop', i: Monitor, l: 'Full Size' }, { k: 'mobile', i: Smartphone, l: 'Compact' }].map(d => {
          const Icon = d.i; const active = form.preview.device === d.k;
          return (
            <button key={d.k} onClick={() => update('preview.device', d.k)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition-all"
              style={{ borderColor: active ? 'transparent' : c.border, background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'rgba(255,255,255,0.5)', color: active ? 'white' : c.text }}>
              <Icon className="w-3.5 h-3.5" /> {d.l}
            </button>
          );
        })}
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ml-auto transition hover:opacity-80"
          style={{ borderColor: c.border, color: c.text, background: 'rgba(255,255,255,0.5)' }}>
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>
      <div className={`mx-auto transition-all duration-300 ${form.preview.device === 'mobile' ? 'max-w-sm' : 'max-w-2xl'}`}>
        <CardPreview form={form} c={c} dark={dark} />
      </div>
    </Section>
  );
}

/* ─── Step 7: Submit ─────────────────────────────────────────────────────── */
function StepSubmit({ form, update, c, onSubmit, setStep }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; onSubmit: () => void; setStep: (n: number) => void }) {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const sections = [
    { label: 'Bride & Groom', step: 0, value: `${form.bride.name || '—'} & ${form.groom.name || '—'}`, icon: Heart, ok: !!(form.bride.name && form.groom.name) },
    { label: 'Card Order', step: 0, value: form.aboveWeds === 'bride' ? 'Bride above Weds' : 'Groom above Weds', icon: ArrowLeftRight, ok: true },
    { label: 'Deities', step: 1, value: `${form.deities.length} selected`, icon: Star, ok: form.deities.length > 0 },
    { label: 'Template', step: 2, value: template ? `#${template.id} · ${template.category}` : 'Not selected', icon: BookOpen, ok: !!template },
    { label: 'Programmes', step: 3, value: `${form.programmes.filter(p => p.date).length} with dates`, icon: Calendar, ok: form.programmes.some(p => p.date) },
    { label: 'Closing Line', step: 4, value: closing?.label || '—', icon: FileText, ok: true },
    { label: 'Design', step: 5, value: `${form.design.language} · ${form.design.layout}`, icon: Type, ok: true },
  ];
  return (
    <Section title="Review & Submit" eyebrow="Final Step" subtitle="Double-check everything. Once submitted the designer begins work immediately." c={c} icon={CheckCircle2}>
      <div className="space-y-2 mb-6">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.45)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.ok ? `${c.gold}15` : '#f9923210' }}>
                <Icon className="w-4 h-4" style={{ color: s.ok ? c.gold : '#f97316' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: c.subtext }}>{s.label}</div>
                <div className="text-sm font-semibold truncate" style={{ color: c.text }}>{s.value}</div>
              </div>
              <button onClick={() => setStep(s.step)} className="flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider transition hover:opacity-80" style={{ color: c.gold, background: `${c.gold}15` }}>
                <Edit3 className="w-3 h-3" /> Edit
              </button>
            </div>
          );
        })}
      </div>
      <label className="flex items-start gap-3 p-5 rounded-2xl border-2 cursor-pointer transition-all"
        style={{ borderColor: form.meta.accepted ? c.gold : c.border, background: form.meta.accepted ? `${c.gold}10` : 'rgba(255,255,255,0.35)' }}>
        <input type="checkbox" checked={form.meta.accepted} onChange={e => update('meta.accepted', e.target.checked)} className="mt-1 w-4 h-4 shrink-0" style={{ accentColor: c.gold }} />
        <div>
          <div className="text-sm font-bold leading-snug" style={{ color: c.text }}>I have checked all details and confirm they are correct</div>
          <div className="text-xs mt-1 leading-snug font-medium" style={{ color: c.subtext }}>The designer will use this content exactly as shown. Proofread all names and dates.</div>
        </div>
      </label>
    </Section>
  );
}

/* ─── Card Preview ───────────────────────────────────────────────────────── */
function CardPreview({ form, c, dark, compact, sizeId }: { form: FormState; c: Palette; dark: boolean; compact?: boolean; sizeId?: string }) {
  const layout = form.design.layout;
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = KIDS_LINES.find(t => t.id === form.kidsLine);
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);
  const hasNames = !!(form.bride.name || form.groom.name);

  // Respect aboveWeds
  const above = form.aboveWeds === 'bride' ? form.bride : form.groom;
  const below = form.aboveWeds === 'bride' ? form.groom : form.bride;
  const aboveRelation = form.aboveWeds === 'bride' ? 'D/o' : 'S/o';
  const belowRelation = form.aboveWeds === 'bride' ? 'S/o' : 'D/o';

  // Card size constraints for admin
  const sizeConf = CARD_SIZES.find(s => s.id === sizeId);
  const aspectStyle: React.CSSProperties = sizeConf
    ? { aspectRatio: `${sizeConf.widthIn} / ${sizeConf.heightIn}` }
    : {};

  // White card background for maximum legibility
  const cardBg = '#FFFFFF';

  if (!hasNames && compact) {
    return (
      <div className="rounded-2xl flex flex-col items-center justify-center py-10 px-6 text-center" style={{ background: cardBg, minHeight: 200 }}>
        <div className="text-4xl mb-3 opacity-40">💌</div>
        <div className="font-semibold" style={{ color: '#1A1A1A', fontFamily: "'Cormorant Garamond', serif", fontSize: '1.2rem' }}>Your card preview</div>
        <div className="text-xs mt-1.5 font-medium" style={{ color: '#1A1A1A', opacity: 0.6 }}>Enter bride & groom names to see it come to life</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl relative" style={{ background: cardBg, color: '#111111', ...aspectStyle }}>
      {/* Ornate borders */}
      {layout !== 'modern' && (
        <>
          <div className="absolute inset-2.5 rounded-xl pointer-events-none" style={{ border: '2px double #C0892E', opacity: 0.5 }} />
          <div className="absolute inset-4 rounded-lg pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.5 }} />
        </>
      )}
      {layout === 'modern' && <div className="absolute inset-3 rounded-xl pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.4 }} />}

      <div className={`relative ${compact ? 'p-5 pt-6' : 'p-7 sm:p-10 pt-8'} text-center`}
        style={{ fontFamily: form.design.bodyFont, fontSize: `${form.design.fontSize}px`, letterSpacing: `${form.design.letterSpacing}px`, lineHeight: form.design.lineHeight }}>

        {/* Deities */}
        {form.deities.length > 0 && (
          <div className="mb-3 px-2 py-2 rounded-lg" style={{ background: 'rgba(0, 0, 0, 0.03)', border: '1px dashed rgba(192, 137, 46, 0.55)' }}>
            <div className="flex items-center justify-around gap-1 flex-wrap">
              {form.deities.map(id => { const d = DEITIES.find(x => x.id === id); return <div key={id} className="text-xl sm:text-2xl" title={d?.name}>{d?.glyph}</div>; })}
            </div>
          </div>
        )}
        {form.deities[0] && (
          <div className="text-[9px] uppercase tracking-[0.35em] mb-3 font-bold" style={{ color: '#1A1A1A', fontFamily: form.design.headingFont }}>
            {DEITIES.find(d => d.id === form.deities[0])?.mantra}
          </div>
        )}

        <DecorativeDivider compact={compact} />

        {/* Host parents line — show exactly as typed */}
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

        {/* Names — no BRIDE / GROOM labels (#9) */}
        <div className="my-5">
          {/* Above Weds */}
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

          {/* Relation word */}
          <div className="my-4 relative">
            <div style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: compact ? '2.2em' : '3.2em', color: '#1A1A1A', lineHeight: 0.9 }}>
              {relation?.label || 'Weds'}
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-14 h-px" style={{ background: '#C0892E' }} />
          </div>

          {/* Below Weds */}
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

        {/* Programmes */}
        {form.programmes.some(p => p.date) && (
          <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(0, 0, 0, 0.12)' }}>
            <DecorativeDivider compact={compact} mini />
            <div className="text-[10px] font-bold mb-3 mt-2" style={{ color: '#1A1A1A', letterSpacing: '0.4em', fontFamily: form.design.headingFont }}>◈ PROGRAMMES ◈</div>
            <div className="grid gap-2">
              {form.programmes.filter(f => f.date).map(f => {
                const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
                return (
                  <div key={f.id} className="rounded-xl p-2.5 text-left" style={{ background: `linear-gradient(135deg, ${preset?.color || '#C0892E'}12, transparent)`, border: `1px solid ${preset?.color || '#C0892E'}28` }}>
                    <div className="flex items-start gap-2">
                      <div className="text-lg shrink-0">{preset?.icon || '✨'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1em', color: '#1A1A1A' }}>{f.name}</div>
                        <div className="text-[10px] mt-0.5 font-semibold">
                          {new Date(f.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          {f.hour ? <span className="opacity-65"> · {fmtTime(f.hour, f.minute, f.ampm)}</span> : null}
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
        )}

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
            <div className="text-[10px] italic font-medium" style={{ color: '#1A1A1A' }}>{kidsLine.label}</div>
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
    </div>
  );
}

function DecorativeDivider({ compact, mini }: { compact?: boolean; mini?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-3">
      <div className={`h-px ${mini ? 'w-8' : compact ? 'w-12' : 'w-20'}`} style={{ background: 'linear-gradient(90deg, transparent, #C0892E)' }} />
      <svg width="12" height="12" viewBox="0 0 14 14" fill="#C0892E"><path d="M7 1 L 9 5 L 13 7 L 9 9 L 7 13 L 5 9 L 1 7 L 5 5 Z" /></svg>
      <div className={`h-px ${mini ? 'w-8' : compact ? 'w-12' : 'w-20'}`} style={{ background: 'linear-gradient(90deg, #C0892E, transparent)' }} />
    </div>
  );
}

/* ─── Success ────────────────────────────────────────────────────────────── */
function Success({ submitted, c, form, dark, onReset }: { submitted: SubmittedOrder; c: Palette; form: FormState; dark: boolean; onReset: () => void }) {
  const corel = generateCorelText(form);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const shareWA = () => {
    const text = encodeURIComponent(`🌹 *New Wedding Matter Order*\n\n*Order ID:* ${submitted.orderId}\n*Couple:* ${form.bride.name} ❤️ ${form.groom.name}\n*Submitted:* ${submitted.at}\n\n_Wedding Matter Pro_`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };
  return (
    <div className="pt-12 max-w-2xl mx-auto">
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 20px 60px -10px ${c.primary}60` }}>
        <Check className="w-14 h-14 text-white" strokeWidth={3} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="text-center">
        <h1 className="font-medium mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '3rem' }}>
          Beautifully <em style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.25em', lineHeight: 0.8 }}>done!</em>
        </h1>
        {form.bride.name && form.groom.name && <div className="text-2xl mb-2" style={{ fontFamily: "'Tangerine', cursive", color: c.gold }}>{form.bride.name} & {form.groom.name}</div>}
        <p className="text-base font-medium" style={{ color: c.subtext }}>Your wedding matter is now with our designer 🌹</p>
      </motion.div>
      <Divider c={c} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
        className="rounded-3xl border p-7 shadow-2xl mt-6 text-center" style={{ borderColor: c.border, background: c.surface }}>
        <div className="text-xs uppercase tracking-[0.32em] mb-2 font-bold" style={{ color: c.subtext }}>Your Order ID</div>
        <div className="text-4xl font-bold tracking-[0.18em] font-mono" style={{ color: c.gold }}>{submitted.orderId}</div>
        <div className="text-sm mt-2 font-medium" style={{ color: c.subtext }}>Submitted at {submitted.at}</div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }} className="grid grid-cols-2 gap-3 mt-4">
        <button onClick={shareWA} className="flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl text-white font-bold text-sm transition hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #1DA851, #128C3E)' }}>
          <MessageCircle className="w-5 h-5" /> Share on WhatsApp
        </button>
        <button onClick={copy} className="flex items-center justify-center gap-2 px-4 py-4 rounded-2xl font-bold text-sm border-2 transition hover:opacity-80"
          style={{ borderColor: c.gold, color: c.gold, background: `${c.gold}12` }}>
          {copied ? <><Check className="w-4 h-4" strokeWidth={3} /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Export</>}
        </button>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.54 }}
        className="rounded-3xl border p-5 mt-4" style={{ borderColor: c.border, background: c.surface }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>CorelDRAW Export</div>
          <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy All'}
          </button>
        </div>
        <pre className="text-[10px] whitespace-pre-wrap font-mono opacity-65 max-h-52 overflow-y-auto p-3 rounded-xl" style={{ background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)' }}>{corel}</pre>
      </motion.div>
      <button onClick={onReset} className="mt-5 mx-auto flex items-center gap-2 px-6 py-3 rounded-full border text-sm font-semibold transition hover:opacity-80"
        style={{ borderColor: c.border, color: c.text }}>Submit Another Order</button>
    </div>
  );
}

/* ─── Image helpers ──────────────────────────────────────────────────────── */
function compressImage(file: File, maxDim = 1500, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

const uid = () => Math.random().toString(36).slice(2, 10);

/* ─── Mode Chooser ───────────────────────────────────────────────────────── */
function ModeChooser({ c, onPick }: { c: Palette; onPick: (m: 'type' | 'upload') => void }) {
  const cards = [
    { id: 'type' as const, icon: Type, title: 'Type My Matter', tag: 'Guided 8-step wizard', desc: 'Fill an easy step-by-step form. See your card preview update live as you type, then submit.', grad: `linear-gradient(135deg, ${c.primary}, ${c.gold})` },
    { id: 'upload' as const, icon: Camera, title: 'Upload Form & Design', tag: 'Already filled on paper?', desc: 'Snap photos of your filled physical form and your card design pages. Tell us which matter goes on which page — we handle the rest.', grad: `linear-gradient(135deg, ${c.gold}, ${c.accent})` },
  ];
  return (
    <div className="pt-8 sm:pt-12 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border mb-5 text-[11px] font-bold uppercase tracking-[0.25em]" style={{ borderColor: c.border, color: c.gold, background: c.surface }}>
          <Sparkles className="w-3.5 h-3.5" /> Wedding Matter Pro
        </div>
        <h1 className="font-medium mb-3" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2.8rem', lineHeight: 1.05, color: c.text }}>
          How would you like to <em style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.2em' }}>give us your matter?</em>
        </h1>
        <p className="text-base font-medium max-w-xl mx-auto" style={{ color: c.subtext }}>Choose to type your details in our guided wizard, or simply upload photos of a filled form and your card design.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        {cards.map(card => (
          <motion.button key={card.id} onClick={() => onPick(card.id)} whileHover={{ y: -6 }} whileTap={{ scale: 0.98 }}
            className="text-left rounded-3xl border p-7 shadow-xl transition-all relative overflow-hidden group" style={{ borderColor: c.border, background: c.surface }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: card.grad }}>
              <card.icon className="w-8 h-8 text-white" />
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: c.gold }}>{card.tag}</div>
            <h2 className="font-bold mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.8rem', color: c.text }}>{card.title}</h2>
            <p className="text-sm font-medium leading-relaxed" style={{ color: c.subtext }}>{card.desc}</p>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: c.gold }}>
              Continue <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ─── Image Uploader ─────────────────────────────────────────────────────── */
function ImageUploader({ c, label, hint, images, onAdd, onRemove }: {
  c: Palette; label: string; hint: string; images: UploadedImage[];
  onAdd: (imgs: UploadedImage[]) => void; onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    const added: UploadedImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await compressImage(file);
        added.push({ id: uid(), dataUrl, name: file.name });
      } catch { /* skip bad file */ }
    }
    if (added.length) onAdd(added);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-bold" style={{ color: c.text }}>{label}</label>
        <span className="text-[11px] font-medium" style={{ color: c.subtext }}>{images.length} added</span>
      </div>
      <p className="text-[12px] font-medium mb-3" style={{ color: c.subtext }}>{hint}</p>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="w-full rounded-2xl border-2 border-dashed py-7 px-4 flex flex-col items-center justify-center gap-2 transition hover:opacity-80"
        style={{ borderColor: c.gold, background: `${c.gold}0D`, opacity: busy ? 0.6 : 1 }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
          <Upload className="w-5 h-5 text-white" />
        </div>
        <div className="text-sm font-bold" style={{ color: c.text }}>{busy ? 'Processing…' : 'Tap to upload photos'}</div>
        <div className="text-[11px] font-medium" style={{ color: c.subtext }}>JPG / PNG · take a clear, well-lit photo</div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
          {images.map(img => (
            <div key={img.id} className="relative group rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
              <img src={img.dataUrl} alt={img.name} className="w-full h-24 object-cover" />
              <button type="button" onClick={() => onRemove(img.id)} className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-lg" style={{ background: c.accent }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Upload Flow ────────────────────────────────────────────────────────── */
function UploadFlow({ c, dark, addOrder, onBack }: { c: Palette; dark: boolean; addOrder: (o: SubmittedOrder) => boolean; onBack: () => void }) {
  const [brideName, setBrideName] = useState('');
  const [groomName, setGroomName] = useState('');
  const [contact, setContact] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedImage[]>([]);
  const [designPages, setDesignPages] = useState<DesignPage[]>([]);
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedOrder | null>(null);
  const [generatedForm, setGeneratedForm] = useState<FormState | null>(null);
  const extractMatter = useExtractMatter();

  const showToast = (msg: string, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // The generated preview is built from the photos + commands. If the customer
  // changes those inputs afterwards, the preview is stale — drop it so they
  // don't submit matter that no longer matches their uploads.
  const inputsKey = [
    ...formPhotos.map(i => i.id),
    ...designPages.map(p => `${p.id}:${p.command}`),
  ].join('|');
  useEffect(() => { setGeneratedForm(null); }, [inputsKey]);

  const canGenerate = (formPhotos.length > 0 || designPages.length > 0) && !extractMatter.isPending;

  const generatePreview = () => {
    if (formPhotos.length === 0 && designPages.length === 0) {
      showToast('Upload at least one form or design photo first.', 'error');
      return;
    }
    extractMatter.mutate(
      {
        data: {
          formPhotos: formPhotos.map(i => i.dataUrl),
          designPages: designPages.map(p => ({ image: p.image.dataUrl, command: p.command })),
        },
      },
      {
        onSuccess: (res) => {
          const form = mapExtractedToForm(res);
          if (brideName.trim()) form.bride = { ...form.bride, name: brideName.trim() };
          if (groomName.trim()) form.groom = { ...form.groom, name: groomName.trim() };
          setGeneratedForm(form);
          if (!brideName.trim() && form.bride.name) setBrideName(form.bride.name);
          if (!groomName.trim() && form.groom.name) setGroomName(form.groom.name);
          showToast('Preview generated! Review it below.');
        },
        onError: () => showToast('Could not read the photos. Please try again.', 'error'),
      },
    );
  };

  const addDesignPages = (imgs: UploadedImage[]) => setDesignPages(prev => [...prev, ...imgs.map(image => ({ id: uid(), image, command: '' }))]);
  const removeDesignPage = (id: string) => setDesignPages(prev => prev.filter(p => p.id !== id));
  const setCommand = (id: string, command: string) => setDesignPages(prev => prev.map(p => p.id === id ? { ...p, command } : p));

  const canSubmit = brideName.trim() && groomName.trim() && (formPhotos.length > 0 || designPages.length > 0);

  const submit = () => {
    if (!brideName.trim() || !groomName.trim()) { showToast('Please enter bride & groom names.', 'error'); return; }
    if (formPhotos.length === 0 && designPages.length === 0) { showToast('Please upload at least one photo of your form or design.', 'error'); return; }
    const upload: UploadOrderData = {
      brideName: brideName.trim(), groomName: groomName.trim(), contact: contact.trim(),
      formPhotos, designPages, notes: notes.trim(),
      ...(generatedForm ? { generatedForm } : {}),
    };
    const order: SubmittedOrder = {
      orderId: `WMP-${Math.floor(2400 + Math.random() * 800)}`,
      at: new Date().toLocaleString(),
      couple: `${brideName.trim()} & ${groomName.trim()}`,
      mode: 'upload',
      upload,
      status: 'New',
    };
    if (!addOrder(order)) {
      showToast('Storage is full — please remove a few photos and try again.', 'error');
      return;
    }
    setSubmitted(order);
  };

  if (submitted) {
    return (
      <div className="pt-12 max-w-2xl mx-auto text-center">
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 20px 60px -10px ${c.primary}60` }}>
          <Check className="w-14 h-14 text-white" strokeWidth={3} />
        </motion.div>
        <h1 className="font-medium mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '3rem' }}>
          Photos <em style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.25em', lineHeight: 0.8 }}>received!</em>
        </h1>
        <div className="text-2xl mb-2" style={{ fontFamily: "'Tangerine', cursive", color: c.gold }}>{submitted.couple}</div>
        <p className="text-base font-medium" style={{ color: c.subtext }}>Our designer has your form & design with your page instructions 🌹</p>
        <div className="rounded-3xl border p-7 shadow-2xl mt-8 text-center" style={{ borderColor: c.border, background: c.surface }}>
          <div className="text-xs uppercase tracking-[0.32em] mb-2 font-bold" style={{ color: c.subtext }}>Your Order ID</div>
          <div className="text-4xl font-bold tracking-[0.18em] font-mono" style={{ color: c.gold }}>{submitted.orderId}</div>
          <div className="text-sm mt-2 font-medium" style={{ color: c.subtext }}>Submitted at {submitted.at}</div>
        </div>
        <button onClick={onBack} className="mt-6 mx-auto flex items-center gap-2 px-6 py-3 rounded-full border text-sm font-semibold transition hover:opacity-80" style={{ borderColor: c.border, color: c.text }}>
          Submit Another Order
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 sm:pt-6 max-w-3xl mx-auto">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-bold rounded-full px-3 py-1.5 border transition-all hover:scale-105" style={{ borderColor: c.border, color: c.subtext, background: c.surface }}>
        <ChevronLeft className="w-3.5 h-3.5" /> Change method
      </button>

      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg" style={{ background: `linear-gradient(135deg, ${c.gold}, ${c.accent})` }}>
          <Camera className="w-8 h-8 text-white" />
        </div>
        <h1 className="font-medium mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2.4rem', color: c.text }}>Upload Your Form & Design</h1>
        <p className="text-sm font-medium max-w-lg mx-auto" style={{ color: c.subtext }}>Photograph your filled physical form and each page of your card design. Add a short note on each design page telling us exactly which matter goes there.</p>
      </div>

      {/* Couple + contact */}
      <div className="rounded-3xl border p-6 shadow-lg mb-5" style={{ borderColor: c.border, background: c.surface }}>
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] mb-4" style={{ color: c.gold }}>Couple Details</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-bold block mb-1.5" style={{ color: c.text }}>Bride's Name *</label>
            <input value={brideName} onChange={e => setBrideName(e.target.value)} placeholder="e.g. Priya"
              className="w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition" style={{ borderColor: c.border, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', color: c.text }} />
          </div>
          <div>
            <label className="text-sm font-bold block mb-1.5" style={{ color: c.text }}>Groom's Name *</label>
            <input value={groomName} onChange={e => setGroomName(e.target.value)} placeholder="e.g. Rohan"
              className="w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition" style={{ borderColor: c.border, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', color: c.text }} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-bold block mb-1.5" style={{ color: c.text }}>Contact Number <span className="font-medium opacity-60">(optional)</span></label>
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="WhatsApp / phone number"
              className="w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition" style={{ borderColor: c.border, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', color: c.text }} />
          </div>
        </div>
      </div>

      {/* Filled form photos */}
      <div className="rounded-3xl border p-6 shadow-lg mb-5" style={{ borderColor: c.border, background: c.surface }}>
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] mb-4 flex items-center gap-2" style={{ color: c.gold }}>
          <FileText className="w-3.5 h-3.5" /> Filled Physical Form
        </div>
        <ImageUploader c={c} label="Photos of your filled form"
          hint="Upload clear photos of every page of the form you filled by hand."
          images={formPhotos}
          onAdd={imgs => setFormPhotos(prev => [...prev, ...imgs])}
          onRemove={id => setFormPhotos(prev => prev.filter(i => i.id !== id))} />
      </div>

      {/* Design pages + commands */}
      <div className="rounded-3xl border p-6 shadow-lg mb-5" style={{ borderColor: c.border, background: c.surface }}>
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] mb-4 flex items-center gap-2" style={{ color: c.gold }}>
          <ImageIcon className="w-3.5 h-3.5" /> Card Design Pages
        </div>
        <ImageUploader c={c} label="Photos of your card design"
          hint="Upload each page / side of the card design. You can then tell us what goes on each one."
          images={[]}
          onAdd={addDesignPages}
          onRemove={() => {}} />
        {designPages.length > 0 && (
          <div className="mt-5 space-y-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: c.subtext }}>Tell us what goes on each page</div>
            {designPages.map((page, idx) => (
              <div key={page.id} className="rounded-2xl border p-3 flex gap-3" style={{ borderColor: c.border, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' }}>
                <div className="relative shrink-0">
                  <img src={page.image.dataUrl} alt={`Design page ${idx + 1}`} className="w-20 h-24 object-cover rounded-lg border" style={{ borderColor: c.border }} />
                  <button type="button" onClick={() => removeDesignPage(page.id)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-lg" style={{ background: c.accent }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold mb-1.5" style={{ color: c.gold }}>Page {idx + 1} — your command</div>
                  <textarea value={page.command} onChange={e => setCommand(page.id, e.target.value)} rows={3}
                    placeholder="e.g. Front page: Ganesh + couple names. Inside left: invitation text. Inside right: programmes (Haldi, Mehendi, Wedding)."
                    className="w-full rounded-xl border px-3 py-2 text-[13px] font-medium outline-none resize-none" style={{ borderColor: c.border, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', color: c.text }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* General notes */}
      <div className="rounded-3xl border p-6 shadow-lg mb-5" style={{ borderColor: c.border, background: c.surface }}>
        <label className="text-[11px] font-bold uppercase tracking-[0.25em] mb-3 block" style={{ color: c.gold }}>Any Other Instructions</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Fonts, colours, languages (Hindi / Marathi / Gujarati), anything else our designer should know…"
          className="w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none resize-none" style={{ borderColor: c.border, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', color: c.text }} />
      </div>

      {/* AI preview generation */}
      <div className="rounded-3xl border p-6 shadow-lg mb-5" style={{ borderColor: c.gold, background: c.surface }}>
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] mb-2 flex items-center gap-2" style={{ color: c.gold }}>
          <Zap className="w-3.5 h-3.5" /> Auto-Generate Preview
        </div>
        <p className="text-[13px] font-medium mb-4" style={{ color: c.subtext }}>
          Let us read your form & design photos and instantly build a card preview from your matter. You can review it before submitting.
        </p>
        <button type="button" onClick={generatePreview} disabled={!canGenerate}
          className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl font-bold transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed border"
          style={{ borderColor: c.gold, color: c.gold, background: dark ? 'rgba(255,255,255,0.03)' : `${c.gold}10` }}>
          {extractMatter.isPending
            ? <><Clock className="w-5 h-5 animate-spin" /> Reading your photos…</>
            : <><Sparkles className="w-5 h-5" /> {generatedForm ? 'Regenerate Preview' : 'Generate Preview from Photos'}</>}
        </button>

        {generatedForm && (
          <div className="mt-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3 flex items-center gap-2" style={{ color: c.gold }}>
              <Eye className="w-3.5 h-3.5" /> Generated Preview
            </div>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: c.border }}>
              <CardPreview form={generatedForm} c={c} dark={dark} compact />
            </div>
            <p className="text-[12px] font-medium mt-3 text-center" style={{ color: c.subtext }}>
              This preview will be saved with your order so our designer sees your matter laid out. Not quite right? Edit the photos/commands and regenerate.
            </p>
          </div>
        )}
      </div>

      <button onClick={submit} disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl text-white font-bold transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
        <Send className="w-5 h-5" /> Submit Form & Design
      </button>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold text-white"
          style={{ background: toast.type === 'error' ? c.accent : 'linear-gradient(135deg, #1DA851, #128C3E)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ─── Admin Dashboard ────────────────────────────────────────────────────── */
function AdminDashboard({ c, dark, orders, setOrders }: { c: Palette; dark: boolean; orders: SubmittedOrder[]; setOrders: (o: SubmittedOrder[]) => void }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SubmittedOrder | null>(null);
  const [cardSizeId, setCardSizeId] = useState('sq7x7');

  const filtered = orders.filter(o =>
    (filter === 'All' || o.status === filter) &&
    (o.couple.toLowerCase().includes(search.toLowerCase()) || o.orderId.toLowerCase().includes(search.toLowerCase()))
  );

  const updateStatus = (orderId: string, status: SubmittedOrder['status']) => {
    const updated = orders.map(o => o.orderId === orderId ? { ...o, status } : o);
    setOrders(updated);
    if (selected?.orderId === orderId) setSelected(prev => prev ? { ...prev, status } : null);
  };

  const deleteOrder = (orderId: string) => { setOrders(orders.filter(o => o.orderId !== orderId)); if (selected?.orderId === orderId) setSelected(null); };

  const stats = [
    { label: 'Total',       value: orders.length,                                icon: Package,      gradient: [c.gold, c.goldDeep] },
    { label: 'New',         value: orders.filter(o => o.status === 'New').length, icon: Bell,        gradient: [c.primary, '#9C2C77'] },
    { label: 'In Progress', value: orders.filter(o => o.status === 'In Progress').length, icon: Clock, gradient: ['#3B82F6', '#1D4ED8'] },
    { label: 'Completed',   value: orders.filter(o => o.status === 'Completed').length, icon: CheckCircle2, gradient: ['#16A34A', '#15803D'] },
  ];

  return (
    <div className="pt-4 sm:pt-6">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] mb-1" style={{ color: c.gold }}>Designer Console</div>
          <h1 className="font-medium leading-none" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(2.2rem, 5vw, 3.5rem)' }}>Orders Dashboard</h1>
        </div>
        <div className="text-sm font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: `${c.gold}12`, color: c.subtext }}>
          <Save className="w-3.5 h-3.5" style={{ color: c.gold }} /> {orders.length} order{orders.length !== 1 ? 's' : ''} stored
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} whileHover={{ y: -4 }} className="rounded-3xl border p-5 shadow-xl relative overflow-hidden" style={{ borderColor: c.border, background: c.surface }}>
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full opacity-10" style={{ background: s.gradient[0] }} />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: c.subtext }}>{s.label}</div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})` }}><Icon className="w-4 h-4 text-white" /></div>
                </div>
                <div className="font-medium" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2.8rem', color: c.text }}>{s.value}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Card Size Selector (#11) */}
      <div className="rounded-3xl border p-5 mb-6 shadow-xl" style={{ borderColor: c.border, background: c.surface }}>
        <div className="text-xs font-bold uppercase tracking-[0.25em] mb-3" style={{ color: c.gold }}>Card Size for Preview</div>
        <div className="flex flex-wrap gap-2">
          {CARD_SIZES.map(sz => (
            <button key={sz.id} onClick={() => setCardSizeId(sz.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border-2 text-sm font-bold transition-all"
              style={{ borderColor: cardSizeId === sz.id ? c.gold : c.border, background: cardSizeId === sz.id ? `${c.gold}18` : 'rgba(255,255,255,0.4)', color: cardSizeId === sz.id ? c.gold : c.text }}>
              <Maximize2 className="w-3.5 h-3.5" />
              {sz.label} <span className="opacity-50 text-xs">({sz.widthIn}×{sz.heightIn}")</span>
            </button>
          ))}
        </div>
        <div className="text-xs mt-2 font-medium" style={{ color: c.subtext }}>Card preview in the order modal will be sized to match the selected dimensions.</div>
      </div>

      <div className="rounded-3xl border p-5 sm:p-6 shadow-xl" style={{ borderColor: c.border, background: c.surface }}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
          <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" /><Input c={c} className="pl-10" placeholder="Search by name or order ID…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {['All', 'New', 'In Progress', 'Completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className="px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all"
                style={{ background: filter === f ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', border: `1px solid ${filter === f ? 'transparent' : c.border}`, color: filter === f ? 'white' : c.text }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <div className="font-medium mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.6rem', color: c.text }}>No orders yet</div>
            <div className="text-sm font-medium" style={{ color: c.subtext }}>Orders submitted by customers will appear here instantly</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((o, i) => (
              <motion.div key={o.orderId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                whileHover={{ x: 4 }} onClick={() => setSelected(o)}
                className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-lg"
                style={{ borderColor: c.border, background: 'rgba(255,255,255,0.45)' }}>
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${c.primary}20, ${c.gold}28)` }}>
                    {o.mode === 'upload' ? <Camera className="w-5 h-5" style={{ color: c.gold }} /> : <Heart className="w-5 h-5" style={{ color: c.gold }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium leading-none" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.2rem', color: c.text }}>{o.couple}</div>
                      <div className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: `${c.gold}15`, color: c.gold }}>{o.orderId}</div>
                      <div className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: o.mode === 'upload' ? `${c.accent}18` : `${c.primary}15`, color: o.mode === 'upload' ? c.accent : c.primary }}>
                        {o.mode === 'upload' ? <><Camera className="w-2.5 h-2.5" /> Photos</> : <><Type className="w-2.5 h-2.5" /> Typed</>}
                      </div>
                    </div>
                    <div className="text-xs mt-1 font-medium" style={{ color: c.subtext }}>{o.at}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0"><StatusBadge s={o.status} c={c} /><ChevronRight className="w-4 h-4 opacity-35 hidden sm:block" /></div>
              </motion.div>
            ))}
            {filtered.length === 0 && orders.length > 0 && (
              <div className="text-center py-14 text-sm font-medium" style={{ color: c.subtext }}>No orders match your filters</div>
            )}
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
  const map: Record<string, { bg: string; color: string }> = {
    'New':         { bg: `${c.gold}20`,          color: c.gold },
    'In Progress': { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
    'Completed':   { bg: 'rgba(22,163,74,0.15)',  color: '#16A34A' },
  };
  const st = map[s] || map['New'];
  return (
    <span className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0" style={{ background: st.bg, color: st.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} /> {s}
    </span>
  );
}

function OrderModal({ order, onClose, c, dark, cardSizeId, onStatusChange, onDelete }: { order: SubmittedOrder; onClose: () => void; c: Palette; dark: boolean; cardSizeId: string; onStatusChange: (s: SubmittedOrder['status']) => void; onDelete: () => void }) {
  const isUpload = order.mode === 'upload';
  const corel = order.form ? generateCorelText(order.form) : '';
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const sizeConf = CARD_SIZES.find(s => s.id === cardSizeId);
  const shareWA = () => { const text = encodeURIComponent(`🌹 *Order ${order.orderId}*\n*Couple:* ${order.couple}\n*Status:* ${order.status}\n*Submitted:* ${order.at}\n\n_Wedding Matter Pro_`); window.open(`https://wa.me/?text=${text}`, '_blank'); };

  const DeleteButtons = (
    <div className="grid grid-cols-2 gap-2 mt-3">
      <button onClick={shareWA} className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-white text-sm font-bold transition hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #1DA851, #128C3E)' }}>
        <MessageCircle className="w-4 h-4" /> WhatsApp
      </button>
      {confirmDelete ? (
        <button onClick={onDelete} className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-white text-sm font-bold" style={{ background: '#dc2626' }}>
          <Trash2 className="w-4 h-4" /> Confirm Delete
        </button>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold border"
          style={{ borderColor: '#dc262640', color: '#dc2626', background: '#dc262610' }}>
          <Trash2 className="w-4 h-4" /> Delete Order
        </button>
      )}
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl border"
        style={{ background: dark ? palette.dark.bg1 : palette.light.bg1, borderColor: c.border }}>
        <div className="sticky top-0 z-10 backdrop-blur-xl p-5 sm:p-6 border-b flex items-center justify-between gap-3"
          style={{ borderColor: c.border, background: dark ? 'rgba(13,4,7,0.90)' : 'rgba(251,245,230,0.90)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>{order.orderId}</div>
              <div className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: isUpload ? `${c.accent}18` : `${c.primary}15`, color: isUpload ? c.accent : c.primary }}>
                {isUpload ? <><Camera className="w-2.5 h-2.5" /> Photos</> : <><Type className="w-2.5 h-2.5" /> Typed</>}
              </div>
            </div>
            <h2 className="font-medium truncate" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.8rem' }}>{order.couple}</h2>
            <div className="text-xs mt-0.5 font-medium" style={{ color: c.subtext }}>{order.at}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select c={c} className="text-xs !py-2" value={order.status} onChange={e => onStatusChange(e.target.value as SubmittedOrder['status'])}>
              <option>New</option><option>In Progress</option><option>Completed</option>
            </Select>
            <button onClick={onClose} className="p-2.5 rounded-full border hover:scale-105 transition" style={{ borderColor: c.border }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        {isUpload && order.upload ? (
          <div className="p-5 sm:p-6 space-y-6">
            {(order.upload.contact || order.upload.notes) && (
              <div className="rounded-2xl border p-5" style={{ borderColor: c.border, background: c.surface }}>
                {order.upload.contact && (
                  <div className="flex items-center gap-2 text-sm mb-2"><span className="font-bold" style={{ color: c.gold }}>Contact:</span> <span className="font-medium" style={{ color: c.text }}>{order.upload.contact}</span></div>
                )}
                {order.upload.notes && (
                  <div><div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: c.gold }}>Other Instructions</div><div className="text-sm font-medium whitespace-pre-line" style={{ color: c.text }}>{order.upload.notes}</div></div>
                )}
              </div>
            )}

            {order.upload.designPages.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3 flex items-center gap-2" style={{ color: c.gold }}><ImageIcon className="w-3.5 h-3.5" /> Design Pages & Commands</div>
                <div className="space-y-3">
                  {order.upload.designPages.map((page, idx) => (
                    <div key={page.id} className="rounded-2xl border p-3 flex gap-4" style={{ borderColor: c.border, background: c.surface }}>
                      <button onClick={() => setLightbox(page.image.dataUrl)} className="relative shrink-0 group">
                        <img src={page.image.dataUrl} alt={`Design ${idx + 1}`} className="w-28 h-36 object-cover rounded-lg border" style={{ borderColor: c.border }} />
                        <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition"><ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" /></div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold mb-1.5" style={{ color: c.gold }}>Page {idx + 1}</div>
                        <div className="text-sm font-medium whitespace-pre-line" style={{ color: c.text }}>{page.command || <span className="italic opacity-50">No command provided</span>}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {order.upload.formPhotos.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3 flex items-center gap-2" style={{ color: c.gold }}><FileText className="w-3.5 h-3.5" /> Filled Form Photos</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.upload.formPhotos.map(img => (
                    <button key={img.id} onClick={() => setLightbox(img.dataUrl)} className="relative group rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                      <img src={img.dataUrl} alt={img.name} className="w-full h-40 object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition"><ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" /></div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {order.upload.generatedForm && (
              <div className="grid lg:grid-cols-2 gap-6">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3 flex items-center gap-2" style={{ color: c.gold }}><Sparkles className="w-3.5 h-3.5" /> AI-Generated Matter Preview</div>
                  <CardPreview form={order.upload.generatedForm} c={c} dark={dark} compact sizeId={cardSizeId} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: c.gold }}>CorelDRAW Export</div>
                  <pre className="text-[10px] whitespace-pre-wrap font-mono p-4 rounded-2xl border max-h-[360px] overflow-y-auto"
                    style={{ borderColor: c.border, background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.65)' }}>{generateCorelText(order.upload.generatedForm)}</pre>
                </div>
              </div>
            )}

            {DeleteButtons}
          </div>
        ) : (
          <div className="p-5 sm:p-6 grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>Card Preview</div>
                {sizeConf && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${c.gold}15`, color: c.gold }}>{sizeConf.label}</span>}
              </div>
              {order.form && <CardPreview form={order.form} c={c} dark={dark} compact sizeId={cardSizeId} />}
            </div>
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>CorelDRAW Export</div>
                <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy All'}
                </button>
              </div>
              <pre className="text-[10px] whitespace-pre-wrap font-mono p-4 rounded-2xl border max-h-[360px] overflow-y-auto"
                style={{ borderColor: c.border, background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.65)' }}>{corel}</pre>
              {DeleteButtons}
            </div>
          </div>
        )}
      </motion.div>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-6" onClick={e => { e.stopPropagation(); setLightbox(null); }}>
          <img src={lightbox} alt="Full size" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={e => { e.stopPropagation(); setLightbox(null); }} className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition"><X className="w-5 h-5" /></button>
        </div>
      )}
    </motion.div>
  );
}
