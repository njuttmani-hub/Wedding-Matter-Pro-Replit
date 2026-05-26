import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ChevronRight, ChevronLeft, Check, Plus, Trash2,
  Heart, Calendar, FileText, Type, Eye, Send, Copy, Search,
  Sun, Moon, LayoutDashboard, Clock, CheckCircle2, Edit3, X,
  Smartphone, Monitor, Printer, ArrowUp, ArrowDown, User, Package,
  Bell, Palette as PaletteIcon, Crown, Flame, Gem, Star, BookOpen,
  MessageCircle, Zap, Info, ArrowLeftRight, CloudOff, Save
} from 'lucide-react';
import type { Palette, FormState, PersonInfo, Programme, SubmittedOrder } from './types';
import {
  INVITATION_TEMPLATES, DEITIES, RELATION_WORDS, CLOSING_TAGS, KIDS_LINES,
  PROGRAMME_PRESETS, FONTS
} from './data/constants';

/* ─── Storage keys ───────────────────────────────────────────────────────── */
const DRAFT_KEY = 'wmp_draft_v2';
const ORDERS_KEY = 'wmp_orders_v2';

/* ─── Colour palette ─────────────────────────────────────────────────────── */
const palette: { light: Palette; dark: Palette } = {
  light: {
    bg1: '#FBF5E6', bg2: '#F4E4C0',
    surface: 'rgba(255, 252, 243, 0.80)',
    border: 'rgba(196, 130, 52, 0.24)',
    text: '#1E0A10', subtext: 'rgba(30, 10, 16, 0.58)',
    primary: '#8C1A2A', primaryDark: '#5A0F1C',
    gold: '#C0892E', goldLight: '#D8AB48', goldDeep: '#8B6018',
    accent: '#C83A28', ink: '#1A0608',
  },
  dark: {
    bg1: '#0D0407', bg2: '#180810',
    surface: 'rgba(22, 8, 14, 0.78)',
    border: 'rgba(192, 137, 46, 0.28)',
    text: '#F5E8CC', subtext: 'rgba(245, 232, 204, 0.60)',
    primary: '#C83A28', primaryDark: '#8C1A2A',
    gold: '#D8AB48', goldLight: '#ECC870', goldDeep: '#C0892E',
    accent: '#ECC870', ink: '#FBF5E6',
  }
};

/* ─── Constants ──────────────────────────────────────────────────────────── */
const LAYOUTS = [
  { id: 'royal', name: 'Royal', desc: 'Ornate borders, grand fonts', icon: Crown },
  { id: 'traditional', name: 'Traditional', desc: 'Classic Indian aesthetic', icon: Flame },
  { id: 'modern', name: 'Modern', desc: 'Clean, editorial spacing', icon: Gem },
];

const STEPS = [
  { id: 0, label: 'Family', short: 'Family', icon: User, tip: 'Enter names exactly as they should appear on the card. Add any prefix (Shri, Smt., etc.) in the small box before each name.' },
  { id: 1, label: 'Deities', short: 'Deities', icon: Star, tip: 'Tap a deity to add it to the top row. Numbers show the order they will appear.' },
  { id: 2, label: 'Invitation Text', short: 'Text', icon: BookOpen, tip: 'Pick the invitation paragraph — no typing needed! 22 ready options.' },
  { id: 3, label: 'Programmes', short: 'Events', icon: Calendar, tip: 'Add all wedding functions. The date field is required for each.' },
  { id: 4, label: 'Extras', short: 'Extras', icon: FileText, tip: 'Closing line, kids message, and with-best-compliments section.' },
  { id: 5, label: 'Typography', short: 'Type', icon: Type, tip: 'Choose fonts and layout style for your card design.' },
  { id: 6, label: 'Preview', short: 'View', icon: Eye, tip: 'See exactly how the card will look. Check all names and dates carefully.' },
  { id: 7, label: 'Submit', short: 'Send', icon: Send, tip: 'Tick the confirmation box and submit — the designer will receive it instantly.' },
];

const VALIDATION_HINTS: Record<number, string> = {
  0: "Please enter both the bride's name and the groom's name to continue.",
  1: 'Please select at least one deity for the top of your card.',
  2: 'Please pick an invitation template to continue.',
  3: 'Please add at least one programme with a date to continue.',
};

const emptyPerson = (namePrefix = ''): PersonInfo => ({
  name: '', namePrefix,
  fatherName: '', fatherPrefix: '',
  motherName: '', motherPrefix: '',
  grandparents: '', grandparentsPrefix: '',
});

const initialForm: FormState = {
  bride: emptyPerson(),
  groom: emptyPerson(),
  brideFirst: true,
  family: { surname: '', title: '', nativePlace: '', residenceAddress: '' },
  hostType: 'parents',
  childRelation: 'son',
  deities: ['ganesh'],
  selectedTemplate: 4,
  relationWord: 'weds',
  closingTag: 'k',
  kidsLine: '',
  programmes: [
    { id: 1, preset: 'wedding', name: 'Wedding Ceremony', date: '', time: '', venue: '', address: '', notes: '' }
  ],
  withCompliments: '',
  blessingsOnly: true,
  design: {
    language: 'English',
    headingFont: "'Cormorant Garamond', serif",
    bodyFont: "'EB Garamond', serif",
    scriptFont: "'Tangerine', cursive",
    fontSize: 15,
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
    name: 'Aditi Sharma', namePrefix: 'Kumari',
    fatherName: 'Rajesh Sharma', fatherPrefix: 'Shri',
    motherName: 'Sunita Sharma', motherPrefix: 'Smt.',
    grandparents: 'Ram Prasad Sharma', grandparentsPrefix: 'Late Shri',
  },
  groom: {
    name: 'Rohan Mehta', namePrefix: '',
    fatherName: 'Mahesh Mehta', fatherPrefix: 'Shri',
    motherName: 'Kavita Mehta', motherPrefix: 'Smt.',
    grandparents: 'Govind Mehta', grandparentsPrefix: 'Late Shri',
  },
  brideFirst: true,
  family: { surname: 'Sharma', title: 'Parivaar', nativePlace: 'Jaipur, Rajasthan', residenceAddress: '12-B, Rose Garden, Sector 5, Jaipur - 302001' },
  deities: ['ganesh', 'shiva', 'lakshmi', 'om', 'krishna'],
  programmes: [
    { id: 1, preset: 'mehendi', name: 'Mehendi Party', date: '2026-12-13', time: '16:00', venue: 'Sharma Residence', address: '12-B Rose Garden, Jaipur', notes: '' },
    { id: 2, preset: 'haldi', name: 'Haldi Ceremony', date: '2026-12-14', time: '10:00', venue: 'Sharma Residence', address: '12-B Rose Garden, Jaipur', notes: '' },
    { id: 3, preset: 'wedding', name: 'Wedding Ceremony', date: '2026-12-15', time: '19:00', venue: 'Taj Mahal Palace', address: 'Ajmer Road, Jaipur', notes: '' },
    { id: 4, preset: 'reception', name: 'Reception', date: '2026-12-16', time: '19:30', venue: 'Taj Mahal Palace', address: 'Ajmer Road, Jaipur', notes: '' },
  ],
  withCompliments: 'Sharma & Mehta Families',
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function pn(prefix: string, name: string) {
  const p = prefix.trim();
  const n = name.trim();
  if (!n) return '';
  return p ? `${p} ${n}` : n;
}

function fillTemplate(text: string, form: FormState): string {
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);
  const childName = `${form.bride.name || '___'} ${relation ? relation.label : 'Weds'} ${form.groom.name || '___'}`;
  return text
    .replace(/\{child\}/g, childName)
    .replace(/\{bride\}/g, form.bride.name || '___')
    .replace(/\{groom\}/g, form.groom.name || '___')
    .replace(/\{father\}/g, form.bride.fatherName || form.groom.fatherName || '___')
    .replace(/\{mother\}/g, form.bride.motherName || form.groom.motherName || '___')
    .replace(/\{grandparents\}/g, form.bride.grandparents || form.groom.grandparents || '___');
}

function generateCorelText(form: FormState): string {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = KIDS_LINES.find(t => t.id === form.kidsLine);
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);
  const deityNames = form.deities.map(id => DEITIES.find(d => d.id === id)?.name).join(' · ');
  const deityGlyphs = form.deities.map(id => DEITIES.find(d => d.id === id)?.glyph).join(' ');

  const personBlock = (label: string, p: PersonInfo) => {
    let s = `─── ${label} ───\n`;
    s += `${pn(p.namePrefix, p.name)}\n`;
    if (p.fatherName) s += `${pn(p.fatherPrefix, p.fatherName)}\n`;
    if (p.motherName) s += `${pn(p.motherPrefix, p.motherName)}\n`;
    if (p.grandparents) s += `${pn(p.grandparentsPrefix, p.grandparents)}\n`;
    return s + '\n';
  };

  const first = form.brideFirst ? form.bride : form.groom;
  const second = form.brideFirst ? form.groom : form.bride;
  const firstLabel = form.brideFirst ? 'BRIDE (FIRST ON CARD)' : 'GROOM (FIRST ON CARD)';
  const secondLabel = form.brideFirst ? 'GROOM (SECOND)' : 'BRIDE (SECOND)';

  let s = '';
  s += `╔══════════════════════════════════╗\n║   WEDDING CARD MATTER EXPORT     ║\n╚══════════════════════════════════╝\n\n`;
  s += `─── CARD ORDER ───\n${form.brideFirst ? 'Bride first, Groom second' : 'Groom first, Bride second'}\n\n`;
  s += `─── DEITIES (TOP ROW) ───\n${deityGlyphs}\n${deityNames}\nPrimary Mantra: ${DEITIES.find(d => d.id === form.deities[0])?.mantra || '—'}\n\n`;
  s += `─── DESIGN ───\nLanguage: ${form.design.language} | Layout: ${form.design.layout.toUpperCase()}\nHeading: ${form.design.headingFont}\nBody: ${form.design.bodyFont}\nScript: ${form.design.scriptFont}\nSize ${form.design.fontSize}px / Spacing ${form.design.letterSpacing}px / Leading ${form.design.lineHeight}\n\n`;
  s += `─── INVITATION TEMPLATE #${template?.id} (${template?.category}) ───\n${fillTemplate(template?.text || '', form)}\n\n`;
  s += personBlock(firstLabel, first);
  s += `─── RELATION ───\n${relation?.label || 'Weds'}\n\n`;
  s += personBlock(secondLabel, second);
  s += `─── PROGRAMMES ───\n`;
  form.programmes.forEach((f, i) => {
    s += `\n[${i + 1}] ${f.name}\n  Date: ${f.date}${f.time ? ` | Time: ${f.time}` : ''}\n`;
    if (f.venue) s += `  Venue: ${f.venue}\n`;
    if (f.address) s += `  Address: ${f.address}\n`;
  });
  if (form.family.residenceAddress) s += `\n─── RESIDENCE ───\n${form.family.residenceAddress}\n`;
  if (form.withCompliments) s += `\n─── WITH BEST COMPLIMENTS ───\n${form.withCompliments}\n`;
  if (kidsLine) s += `\n─── KIDS LINE ───\n${kidsLine.label}\n`;
  if (closing) s += `\n─── CLOSING TAG ───\n[${closing.id.toUpperCase()}] ${closing.label}\n`;
  return s;
}

function loadDraft(): FormState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FormState;
      // Merge with initialForm to handle new fields added in updates
      return { ...initialForm, ...parsed, meta: { accepted: false } };
    }
  } catch { /* ignore */ }
  return initialForm;
}

function loadOrders(): SubmittedOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (raw) return JSON.parse(raw) as SubmittedOrder[];
  } catch { /* ignore */ }
  return [];
}

function saveOrders(orders: SubmittedOrder[]) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)); } catch { /* ignore */ }
}

/* ─── Root App ───────────────────────────────────────────────────────────── */
export default function WeddingApp() {
  const [mode, setMode] = useState<'customer' | 'admin'>('customer');
  const [dark, setDark] = useState(false);
  const [orders, setOrders] = useState<SubmittedOrder[]>(() => loadOrders());
  const c = dark ? palette.dark : palette.light;

  const addOrder = useCallback((order: SubmittedOrder) => {
    setOrders(prev => {
      const next = [order, ...prev];
      saveOrders(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const id = 'wmp-fonts-v3';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Cormorant+Infant:wght@400;600&family=Playfair+Display:wght@400;700;900&family=Cinzel:wght@400;700;900&family=Cinzel+Decorative:wght@400;700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Marcellus&family=Tangerine:wght@400;700&family=Great+Vibes&family=Italianno&family=Pinyon+Script&family=Allura&family=Tiro+Devanagari+Hindi&family=Noto+Serif+Devanagari:wght@400;700&family=Rozha+One&family=Yatra+One&family=Sahitya:wght@400;700&family=Modak&family=Noto+Serif+Gujarati:wght@400;700&family=Rasa:wght@400;600&family=Hind+Vadodara:wght@400;600&display=swap';
    document.head.appendChild(link);
  }, []);

  return (
    <div className="min-h-screen relative transition-colors duration-700" style={{ background: c.bg1, color: c.text, fontFamily: "'EB Garamond', serif" }}>
      <Atmosphere c={c} />
      <Nav mode={mode} setMode={setMode} dark={dark} setDark={setDark} c={c} orderCount={orders.filter(o => o.status === 'New').length} />
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-32 pt-6">
        <AnimatePresence mode="wait">
          {mode === 'customer' ? (
            <motion.div key="c" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35 }}>
              <CustomerFlow c={c} dark={dark} addOrder={addOrder} />
            </motion.div>
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
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 15% 0%, ${c.gold}18 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, ${c.primary}1A 0%, transparent 55%), linear-gradient(180deg, ${c.bg1} 0%, ${c.bg2} 55%, ${c.bg1} 100%)`
      }} />
      <svg className="absolute -top-28 -right-28 w-[580px] h-[580px] opacity-[0.055]" viewBox="0 0 200 200">
        <defs><g id="petal"><path d="M100 30 Q 110 60 100 90 Q 90 60 100 30" fill={c.gold} /></g></defs>
        <circle cx="100" cy="100" r="95" fill="none" stroke={c.gold} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="78" fill="none" stroke={c.gold} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="60" fill="none" stroke={c.gold} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="38" fill="none" stroke={c.gold} strokeWidth="0.5" />
        {Array.from({ length: 24 }).map((_, i) => (
          <use key={i} href="#petal" transform={`rotate(${i * 15} 100 100)`} />
        ))}
      </svg>
    </div>
  );
}

/* ─── Navigation ─────────────────────────────────────────────────────────── */
function Nav({ mode, setMode, dark, setDark, c, orderCount }: {
  mode: string; setMode: (m: 'customer' | 'admin') => void;
  dark: boolean; setDark: (d: boolean) => void; c: Palette; orderCount: number;
}) {
  return (
    <nav className="relative z-20 border-b" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(24px)' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            <Heart className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold leading-none" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.15rem', color: c.text }}>Wedding Matter Pro</div>
            <div className="text-[9px] uppercase tracking-[0.3em] opacity-45">Premium Card Studio</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border p-0.5" style={{ borderColor: c.border }}>
            <button onClick={() => setMode('customer')}
              className="px-4 py-1.5 rounded-full text-[11px] font-bold transition-all"
              style={{ background: mode === 'customer' ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: mode === 'customer' ? 'white' : c.subtext }}>
              Customer
            </button>
            <button onClick={() => setMode('admin')}
              className="px-4 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 relative"
              style={{ background: mode === 'admin' ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: mode === 'admin' ? 'white' : c.subtext }}>
              <LayoutDashboard className="w-3 h-3" /> Admin
              {orderCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: c.accent }}>
                  {orderCount}
                </span>
              )}
            </button>
          </div>
          <button onClick={() => setDark(!dark)}
            className="w-9 h-9 rounded-full flex items-center justify-center border transition-all hover:scale-110"
            style={{ borderColor: c.border, background: c.surface }}>
            {dark ? <Sun className="w-4 h-4" style={{ color: c.gold }} /> : <Moon className="w-4 h-4" style={{ color: c.primary }} />}
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ─── Customer Flow ──────────────────────────────────────────────────────── */
function CustomerFlow({ c, dark, addOrder }: { c: Palette; dark: boolean; addOrder: (o: SubmittedOrder) => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => loadDraft());
  const [submitted, setSubmitted] = useState<SubmittedOrder | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  // Online/offline detection
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Auto-save draft to localStorage on every form change
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
      const keys = path.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const fillSample = () => { setForm(sampleForm); showToast('Sample card loaded — feel free to edit!'); };
  const clearDraft = () => { setForm(initialForm); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

  const canNext = useMemo(() => {
    if (step === 0) return !!(form.bride.name.trim() && form.groom.name.trim());
    if (step === 1) return form.deities.length > 0;
    if (step === 2) return form.selectedTemplate !== null;
    if (step === 3) return form.programmes.length > 0 && form.programmes.some(p => p.date);
    return true;
  }, [step, form]);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  const next = () => {
    if (!canNext) { showToast(VALIDATION_HINTS[step] || 'Please complete this step first.', 'error'); return; }
    setStep(s => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const prev = () => { setStep(s => Math.max(0, s - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submit = () => {
    if (!form.meta.accepted) { showToast('Please tick the checkbox to confirm your details.', 'error'); return; }
    const order: SubmittedOrder = {
      orderId: `WMP-${Math.floor(2400 + Math.random() * 800)}`,
      at: new Date().toLocaleString(),
      couple: `${form.bride.name}${form.groom.name ? ` & ${form.groom.name}` : ''}`,
      form: JSON.parse(JSON.stringify(form)),
      status: 'New',
    };
    addOrder(order);
    setSubmitted(order);
    // Clear draft after successful submit
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const coupleNames = form.bride.name && form.groom.name ? `${form.bride.name} & ${form.groom.name}` : null;

  if (submitted) return (
    <Success submitted={submitted} c={c} form={form} dark={dark}
      onReset={() => { setSubmitted(null); setForm(initialForm); setStep(0); }} />
  );

  return (
    <div className="pt-4 sm:pt-6">
      <Hero c={c} onFillSample={fillSample} onClear={clearDraft} hasDraft={JSON.stringify(form) !== JSON.stringify(initialForm)} />
      <Stepper step={step} setStep={setStep} c={c} dark={dark} saving={saving} offline={offline} />

      <div className="grid lg:grid-cols-12 gap-6 mt-6">
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28 }}>
              {step === 0 && <StepFamily form={form} update={update} setForm={setForm} c={c} />}
              {step === 1 && <StepDeities form={form} update={update} setForm={setForm} c={c} />}
              {step === 2 && <StepInvitation form={form} update={update} c={c} dark={dark} />}
              {step === 3 && <StepProgrammes form={form} setForm={setForm} c={c} dark={dark} />}
              {step === 4 && <StepExtras form={form} update={update} c={c} dark={dark} />}
              {step === 5 && <StepDesign form={form} update={update} c={c} dark={dark} />}
              {step === 6 && <StepPreview form={form} update={update} c={c} dark={dark} />}
              {step === 7 && <StepSubmit form={form} update={update} c={c} onSubmit={submit} setStep={setStep} dark={dark} />}
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
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>Live Preview</span>
                  {coupleNames && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${c.primary}15`, color: c.primary }}>
                      {coupleNames}
                    </span>
                  )}
                </div>
                <button onClick={() => setPreviewExpanded(true)} title="Expand preview"
                  className="p-2 rounded-full hover:scale-110 transition flex items-center gap-1 text-[10px] font-bold"
                  style={{ color: c.gold, background: `${c.gold}12` }}>
                  <Eye className="w-3.5 h-3.5" /> Expand
                </button>
              </div>
              <div className="p-3">
                <CardPreview form={form} c={c} dark={dark} compact />
              </div>
              <div className="px-4 pb-3">
                <button onClick={() => setPreviewExpanded(true)}
                  className="w-full py-2.5 rounded-2xl text-[11px] font-bold text-white tracking-wide transition hover:opacity-90 active:scale-95 lg:hidden"
                  style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
                  👁️ View Full Card
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen preview */}
      <AnimatePresence>
        {previewExpanded && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPreviewExpanded(false)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.92, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
              onClick={e => e.stopPropagation()} className="max-w-lg w-full my-8">
              {coupleNames && (
                <div className="text-center text-white/80 mb-4" style={{ fontFamily: "'Tangerine', cursive", fontSize: '2rem' }}>{coupleNames}</div>
              )}
              <CardPreview form={form} c={c} dark={dark} />
              <button onClick={() => setPreviewExpanded(false)} className="mt-5 w-full py-3.5 rounded-full text-white font-bold text-sm tracking-wide"
                style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
                ✓ Close Preview
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 48, scale: 0.88 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 48, scale: 0.88 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-full shadow-2xl text-sm font-semibold text-white flex items-center gap-2 max-w-xs text-center"
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
    <div className="text-center mb-10 sm:mb-12">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-[0.25em] mb-5"
        style={{ borderColor: c.border, color: c.gold, background: `${c.gold}12` }}>
        <Sparkles className="w-3 h-3" /> Premium Card Studio
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="text-4xl sm:text-6xl font-medium leading-[1.05] tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Pick your perfect
        <br />
        <span style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.45em', fontWeight: 700, lineHeight: 0.85 }}>wedding matter</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
        className="mt-4 text-sm sm:text-base max-w-sm mx-auto leading-relaxed" style={{ color: c.subtext }}>
        22 ready invitation texts · 12 deities · No writing needed
      </motion.p>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}
        className="flex items-center justify-center gap-2 sm:gap-4 mt-6 flex-wrap">
        {[
          { n: '1', l: 'Fill names' },
          { n: '2', l: 'Pick deities' },
          { n: '3', l: 'Choose text' },
          { n: '4', l: 'Add events' },
          { n: '5', l: 'Submit!' },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: c.gold }}>{s.n}</div>
              <span className="text-xs font-semibold" style={{ color: c.subtext }}>{s.l}</span>
            </div>
            {i < 4 && <ChevronRight className="w-3 h-3 opacity-30" />}
          </React.Fragment>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.36 }} className="mt-5 flex items-center justify-center gap-2 flex-wrap">
        <button onClick={onFillSample}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border text-xs font-bold transition-all hover:scale-105 active:scale-95"
          style={{ borderColor: c.gold, color: c.gold, background: `${c.gold}10` }}>
          <Zap className="w-3.5 h-3.5" /> See a sample card first
        </button>
        {hasDraft && (
          <button onClick={onClear}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border text-xs font-semibold transition-all hover:scale-105"
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
          <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>Step {step + 1} of {STEPS.length} · {STEPS[step].label}</div>
          <div className="text-xs mt-0.5 leading-snug" style={{ color: c.subtext }}>{STEPS[step].tip}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {offline && (
            <div className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: '#f9923220', color: '#f97316' }}>
              <CloudOff className="w-3 h-3" /> Offline
            </div>
          )}
          <motion.div animate={{ opacity: saving ? 1 : 0.65 }} className="text-[10px] font-semibold flex items-center gap-1.5" style={{ color: saving ? c.gold : c.subtext }}>
            {saving
              ? (<><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.gold }} />Saving…</>)
              : (<><Save className="w-3 h-3" style={{ color: '#22c55e' }} />Saved</>)}
          </motion.div>
        </div>
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden mb-5" style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}>
        <motion.div initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 65, damping: 18 }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${c.primary}, ${c.gold})` }} />
      </div>
      <div className="flex justify-between gap-0.5 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
        {STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => i <= step && setStep(i)} disabled={i > step} title={s.label}
              className="group flex flex-col items-center gap-1.5 min-w-[52px] py-1 px-1 transition disabled:cursor-not-allowed disabled:opacity-35">
              <div className="relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200"
                style={{
                  background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : done ? `${c.primary}22` : 'transparent',
                  border: `1.5px solid ${active ? 'transparent' : done ? c.primary : c.border}`,
                  color: active ? 'white' : done ? c.primary : c.subtext,
                  boxShadow: active ? `0 6px 18px -6px ${c.primary}90` : 'none',
                  transform: active ? 'scale(1.1)' : 'scale(1)'
                }}>
                {done ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Icon className="w-3.5 h-3.5" />}
                {active && (
                  <motion.div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${c.gold}60` }}
                    animate={{ scale: [1, 1.28, 1], opacity: [0.7, 0, 0.7] }} transition={{ duration: 2.2, repeat: Infinity }} />
                )}
              </div>
              <div className="text-[9px] font-semibold whitespace-nowrap leading-none" style={{ color: active ? c.gold : done ? c.primary : c.subtext }}>{s.short}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Nav Buttons ────────────────────────────────────────────────────────── */
function NavButtons({ step, prev, next, onSubmit, c, canNext }: { step: number; prev: () => void; next: () => void; onSubmit: () => void; c: Palette; canNext: boolean }) {
  const hint = !canNext && VALIDATION_HINTS[step] ? VALIDATION_HINTS[step] : null;
  return (
    <div className="mt-6 space-y-3">
      {hint && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 px-4 py-3 rounded-2xl text-xs font-semibold leading-snug"
          style={{ background: `${c.gold}12`, border: `1px solid ${c.gold}30`, color: c.gold }}>
          <Info className="w-4 h-4 shrink-0 mt-0.5" /> {hint}
        </motion.div>
      )}
      <div className="flex items-center justify-between gap-3">
        <button onClick={prev} disabled={step === 0}
          className="flex items-center gap-1.5 px-5 py-3 rounded-full border text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95"
          style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(10px)', color: c.text }}>
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <motion.button onClick={next} whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }}
            className="flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-bold text-white shadow-2xl tracking-wide"
            style={{
              background: canNext ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.subtext}38`,
              boxShadow: canNext ? `0 12px 36px -10px ${c.primary}70` : 'none',
            }}>
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
function Section({ title, subtitle, children, c, icon: Icon, eyebrow, tip }: {
  title: string; subtitle?: string; children: React.ReactNode;
  c: Palette; dark?: boolean; icon?: React.ElementType; eyebrow?: string; tip?: string;
}) {
  return (
    <div className="rounded-3xl border shadow-xl overflow-hidden" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
      <div className="px-6 sm:px-8 pt-6 pb-5 border-b relative" style={{ borderColor: c.border }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.gold}80, transparent)` }} />
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${c.primary}18, ${c.gold}22)`, border: `1px solid ${c.border}` }}>
              <Icon className="w-5 h-5" style={{ color: c.gold }} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="text-[10px] font-bold uppercase tracking-[0.28em] mb-1" style={{ color: c.gold }}>{eyebrow}</div>}
            <h2 className="text-2xl sm:text-3xl font-medium leading-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{title}</h2>
            {subtitle && <p className="text-xs sm:text-sm mt-1 leading-snug" style={{ color: c.subtext }}>{subtitle}</p>}
            {tip && (
              <div className="flex items-start gap-1.5 mt-2 text-[10px] font-semibold" style={{ color: c.gold }}>
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5" /> {tip}
              </div>
            )}
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
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5" style={{ color: c.subtext }}>
        {label} {required && <span style={{ color: '#C83A28' }}>*</span>}
        {hint && <span className="text-[9px] font-normal normal-case tracking-normal opacity-70">— {hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({ c, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { c: Palette }) {
  return (
    <input className={`w-full px-4 py-3 rounded-2xl text-sm transition-all outline-none ${className}`}
      style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text }}
      onFocus={e => { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = 'rgba(255,255,255,0.55)'; }}
      {...props} />
  );
}

function Textarea({ c, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { c: Palette }) {
  return (
    <textarea className="w-full px-4 py-3 rounded-2xl text-sm transition-all outline-none resize-none"
      style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text }}
      onFocus={e => { e.currentTarget.style.borderColor = c.gold; }}
      onBlur={e => { e.currentTarget.style.borderColor = c.border; }}
      {...props} />
  );
}

function Select({ c, children, className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { c: Palette }) {
  return (
    <select className={`w-full px-4 py-3 rounded-2xl text-sm transition-all outline-none appearance-none cursor-pointer ${className}`}
      style={{
        background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.border}`, color: c.text,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(c.gold)}' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', paddingRight: '2.5rem'
      }}
      {...props}>{children}</select>
  );
}

/* Prefix + Name row: small prefix input + full name input side by side */
function PrefixNameField({ label, prefixValue, prefixPath, nameValue, namePath, namePlaceholder, prefixPlaceholder = 'Prefix', required, update, c }: {
  label: string; prefixValue: string; prefixPath: string; nameValue: string; namePath: string;
  namePlaceholder?: string; prefixPlaceholder?: string; required?: boolean;
  update: (path: string, value: unknown) => void; c: Palette;
}) {
  return (
    <Field label={label} required={required} c={c}>
      <div className="flex gap-2">
        <input value={prefixValue} onChange={e => update(prefixPath, e.target.value)} placeholder={prefixPlaceholder}
          title="Write any prefix here (e.g. Shri, Smt., Kumari, Late Shri)"
          className="w-28 shrink-0 px-3 py-3 rounded-2xl text-sm transition-all outline-none"
          style={{ background: 'rgba(255,255,255,0.55)', border: `1.5px solid ${c.gold}50`, color: c.text }}
          onFocus={e => { e.currentTarget.style.borderColor = c.gold; e.currentTarget.style.background = 'rgba(255,255,255,0.88)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = `${c.gold}50`; e.currentTarget.style.background = 'rgba(255,255,255,0.55)'; }}
        />
        <Input c={c} className="flex-1" value={nameValue} onChange={e => update(namePath, e.target.value)} placeholder={namePlaceholder} />
      </div>
      <div className="text-[9px] mt-1 pl-1" style={{ color: c.subtext }}>Left box = prefix (Shri / Smt. / Kumari / Late…) — right box = full name</div>
    </Field>
  );
}

/* ─── Step 0: Family ─────────────────────────────────────────────────────── */
function StepFamily({ form, update, setForm, c }: { form: FormState; update: (path: string, value: unknown) => void; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette }) {
  const filled = form.bride.name && form.groom.name;

  return (
    <Section title="The Two Families" eyebrow="Step 1 of 8"
      subtitle="Enter names exactly as they should appear on the card. Use the prefix box for Shri, Smt., Kumari, Late, etc."
      c={c} icon={Heart}>

      {filled && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-5 p-4 rounded-2xl text-center border"
            style={{ borderColor: `${c.gold}40`, background: `linear-gradient(135deg, ${c.gold}10, ${c.primary}08)` }}>
            <div style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.9rem' }}>
              🌹 {form.bride.name} & {form.groom.name}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: c.subtext }}>
              Your card is looking beautiful!
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Bride / Groom order toggle */}
      <div className="mb-6 p-4 rounded-2xl border" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.35)' }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: c.gold }}>Card Display Order</div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => update('brideFirst', true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-xs font-bold transition-all"
            style={{ borderColor: form.brideFirst ? c.gold : c.border, background: form.brideFirst ? `${c.gold}15` : 'transparent', color: form.brideFirst ? c.gold : c.text }}>
            👰 Bride first, 🤵 Groom second
          </button>
          <button onClick={() => update('brideFirst', false)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-xs font-bold transition-all"
            style={{ borderColor: !form.brideFirst ? c.gold : c.border, background: !form.brideFirst ? `${c.gold}15` : 'transparent', color: !form.brideFirst ? c.gold : c.text }}>
            🤵 Groom first, 👰 Bride second
          </button>
          <div className="text-[10px]" style={{ color: c.subtext }}>
            <ArrowLeftRight className="w-3 h-3 inline mr-1" />Changes the order on the card preview
          </div>
        </div>
      </div>

      {/* Host type */}
      <div className="mb-6">
        <Field label="Who is inviting?" hint="Hosts of the wedding" c={c}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
            {[
              { id: 'parents', label: 'Parents', emoji: '👨‍👩‍👧' },
              { id: 'grandparents', label: 'Grandparents', emoji: '👴👵' },
              { id: 'siblings', label: 'Siblings', emoji: '👫' },
              { id: 'self', label: 'Couple Themselves', emoji: '💑' },
            ].map(h => (
              <button key={h.id} onClick={() => update('hostType', h.id)}
                className="py-3 px-2 rounded-2xl border-2 text-xs font-bold transition-all text-center"
                style={{
                  borderColor: form.hostType === h.id ? c.gold : c.border,
                  background: form.hostType === h.id ? `${c.gold}15` : 'rgba(255,255,255,0.4)',
                  color: form.hostType === h.id ? c.gold : c.text
                }}>
                <div className="text-lg mb-1">{h.emoji}</div>{h.label}
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
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-4" style={{ color: c.gold }}>Family Details (Optional)</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Family Surname" c={c}><Input c={c} value={form.family.surname} onChange={e => update('family.surname', e.target.value)} placeholder="e.g. Sharma" /></Field>
          <Field label="Family Title" hint="e.g. Parivaar" c={c}><Input c={c} value={form.family.title} onChange={e => update('family.title', e.target.value)} placeholder="Parivaar" /></Field>
          <Field label="Native Place" c={c}><Input c={c} value={form.family.nativePlace} onChange={e => update('family.nativePlace', e.target.value)} placeholder="Jaipur, Rajasthan" /></Field>
          <Field label="Residence Address" c={c}><Input c={c} value={form.family.residenceAddress} onChange={e => update('family.residenceAddress', e.target.value)} placeholder="House No, Street, City" /></Field>
        </div>
      </div>
    </Section>
  );
}

function PersonCard({ side, person, update, prefix, c }: { side: string; person: PersonInfo; update: (path: string, value: unknown) => void; prefix: string; c: Palette }) {
  const isBride = side === 'Bride';
  return (
    <div className="rounded-2xl p-5 border relative overflow-hidden"
      style={{ borderColor: c.border, background: `linear-gradient(180deg, ${isBride ? c.primary : c.gold}08, transparent)` }}>
      <div className="absolute top-3 right-3 text-2xl opacity-20 select-none">{isBride ? '👰' : '🤵'}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-4" style={{ color: isBride ? c.primary : c.goldDeep }}>
        {isBride ? '👰' : '🤵'} {side}
      </div>
      <div className="space-y-3">
        <PrefixNameField
          label={`${side}'s Full Name`} required
          prefixValue={person.namePrefix} prefixPath={`${prefix}.namePrefix`}
          nameValue={person.name} namePath={`${prefix}.name`}
          namePlaceholder={isBride ? 'Aditi Sharma' : 'Rohan Mehta'}
          prefixPlaceholder="Kumari"
          update={update} c={c}
        />
        <PrefixNameField
          label="Father's Name"
          prefixValue={person.fatherPrefix} prefixPath={`${prefix}.fatherPrefix`}
          nameValue={person.fatherName} namePath={`${prefix}.fatherName`}
          namePlaceholder={isBride ? 'Rajesh Sharma' : 'Mahesh Mehta'}
          prefixPlaceholder="Shri"
          update={update} c={c}
        />
        <PrefixNameField
          label="Mother's Name"
          prefixValue={person.motherPrefix} prefixPath={`${prefix}.motherPrefix`}
          nameValue={person.motherName} namePath={`${prefix}.motherName`}
          namePlaceholder={isBride ? 'Sunita Sharma' : 'Kavita Mehta'}
          prefixPlaceholder="Smt."
          update={update} c={c}
        />
        <PrefixNameField
          label="Grandparents" hint="optional"
          prefixValue={person.grandparentsPrefix} prefixPath={`${prefix}.grandparentsPrefix`}
          nameValue={person.grandparents} namePath={`${prefix}.grandparents`}
          namePlaceholder="Full Name"
          prefixPlaceholder="Late Shri"
          update={update} c={c}
        />
      </div>
    </div>
  );
}

/* ─── Step 1: Deities ────────────────────────────────────────────────────── */
function StepDeities({ form, setForm, c }: { form: FormState; update: (path: string, value: unknown) => void; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette }) {
  const toggle = (id: string) => {
    setForm(prev => ({
      ...prev,
      deities: prev.deities.includes(id) ? prev.deities.filter(d => d !== id) : [...prev.deities, id]
    }));
  };
  return (
    <Section title="Deities & Blessings" eyebrow="Step 2 of 8"
      subtitle="Tap a deity to add it to the top row of your card. Tap again to remove."
      tip={`${form.deities.length} selected — most cards have 4–8 deities.`}
      c={c} icon={Star}>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {DEITIES.map(d => {
          const active = form.deities.includes(d.id);
          const order = form.deities.indexOf(d.id) + 1;
          return (
            <motion.button key={d.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.94 }} onClick={() => toggle(d.id)}
              className="relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all p-3"
              style={{
                borderColor: active ? c.gold : c.border,
                background: active ? `linear-gradient(135deg, ${c.gold}22, ${c.primary}16)` : 'rgba(255,255,255,0.45)',
                boxShadow: active ? `0 8px 24px -8px ${c.gold}60` : 'none'
              }}>
              <div className="text-3xl">{d.glyph}</div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight" style={{ color: active ? c.gold : c.subtext }}>{d.name}</div>
              {active && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: c.gold, boxShadow: `0 3px 10px ${c.gold}80` }}>
                  {order}
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
      <div className="mt-5 p-3 rounded-2xl text-xs font-semibold flex items-center gap-2" style={{ background: `${c.gold}10`, color: c.subtext }}>
        <Info className="w-4 h-4 shrink-0" style={{ color: c.gold }} />
        Numbers show the order they'll appear on the card. Tap a selected deity to remove it.
      </div>
    </Section>
  );
}

/* ─── Step 2: Invitation Text ────────────────────────────────────────────── */
function StepInvitation({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const cats = ['All', ...Array.from(new Set(INVITATION_TEMPLATES.map(t => t.category)))];
  const filtered = INVITATION_TEMPLATES.filter(t =>
    (cat === 'All' || t.category === cat) &&
    (t.preview.toLowerCase().includes(search.toLowerCase()) || t.text.toLowerCase().includes(search.toLowerCase()))
  );
  const selected = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);

  return (
    <>
      <Section title="Invitation Text" eyebrow="Step 3 of 8"
        subtitle="22 ready paragraphs — just pick one. No need to type anything!"
        tip="Click any card to select it. You can change it later."
        c={c} icon={BookOpen}>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
            <Input c={c} className="pl-10" placeholder="Search by keyword…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select c={c} className="sm:w-44" value={cat} onChange={e => setCat(e.target.value)}>
            {cats.map(ct => <option key={ct}>{ct}</option>)}
          </Select>
        </div>
        <div className="grid gap-3 max-h-[480px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {filtered.map(t => {
            const active = form.selectedTemplate === t.id;
            return (
              <motion.button key={t.id} whileHover={{ x: 3 }} onClick={() => update('selectedTemplate', t.id)}
                className="text-left p-4 rounded-2xl border-2 transition-all"
                style={{
                  borderColor: active ? c.gold : c.border,
                  background: active ? `linear-gradient(135deg, ${c.gold}14, ${c.primary}08)` : 'rgba(255,255,255,0.45)',
                  boxShadow: active ? `0 8px 24px -8px ${c.gold}40` : 'none'
                }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`, color: active ? 'white' : c.gold }}>
                    {t.id}
                  </div>
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

      {selected && (
        <div className="mt-5">
          <Section title="Relation Word" eyebrow="Between Names" subtitle="How the couple is joined on the card" c={c} icon={Heart}>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {RELATION_WORDS.map(r => {
                const active = form.relationWord === r.id;
                return (
                  <motion.button key={r.id} whileHover={{ y: -2 }} onClick={() => update('relationWord', r.id)}
                    className="py-3 px-2 rounded-2xl border-2 text-center transition-all"
                    style={{
                      borderColor: active ? c.gold : c.border,
                      background: active ? `${c.gold}15` : 'rgba(255,255,255,0.4)',
                      color: active ? c.gold : c.text,
                      fontFamily: "'Tangerine', cursive", fontSize: '1.25rem', fontWeight: 700
                    }}>
                    {r.label}
                  </motion.button>
                );
              })}
            </div>
          </Section>
        </div>
      )}
    </>
  );
}

/* ─── Step 3: Programmes ─────────────────────────────────────────────────── */
function StepProgrammes({ form, setForm, c, dark }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette; dark: boolean }) {
  const addProgramme = (preset: string) => {
    const p = PROGRAMME_PRESETS.find(x => x.id === preset);
    setForm(prev => ({
      ...prev,
      programmes: [...prev.programmes, { id: Date.now(), preset, name: p?.name || 'Our Function', date: '', time: '', venue: '', address: '', notes: '' }]
    }));
  };
  const removeFn = (id: number) => setForm(prev => ({ ...prev, programmes: prev.programmes.filter(f => f.id !== id) }));
  const updateFn = (id: number, key: keyof Programme, val: string) => setForm(prev => ({
    ...prev, programmes: prev.programmes.map(f => f.id === id ? { ...f, [key]: val } : f)
  }));
  const move = (id: number, dir: number) => {
    const idx = form.programmes.findIndex(f => f.id === id);
    const tgt = idx + dir;
    if (tgt < 0 || tgt >= form.programmes.length) return;
    const next = [...form.programmes];
    [next[idx], next[tgt]] = [next[tgt], next[idx]];
    setForm(prev => ({ ...prev, programmes: next }));
  };

  return (
    <Section title="Functions & Events" eyebrow="Step 4 of 8"
      subtitle="Add all your wedding functions in order. Date is required for each."
      tip="Tap a quick-add icon below to instantly add that function."
      c={c} icon={Calendar}>
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: c.subtext }}>Quick Add a Function</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {PROGRAMME_PRESETS.map(p => (
            <motion.button key={p.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => addProgramme(p.id)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all hover:shadow-md"
              style={{ borderColor: c.border, background: 'rgba(255,255,255,0.55)' }}>
              <span className="text-xl">{p.icon}</span>
              <span className="text-[9px] font-semibold text-center leading-tight" style={{ color: c.text }}>{p.name}</span>
            </motion.button>
          ))}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => addProgramme('custom')}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl text-white"
            style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            <Plus className="w-5 h-5" />
            <span className="text-[9px] font-bold">Custom</span>
          </motion.button>
        </div>
      </div>

      {form.programmes.length === 0 && (
        <div className="text-center py-10 rounded-2xl border-2 border-dashed text-sm" style={{ borderColor: c.border, color: c.subtext }}>
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Tap a function above to add it here
        </div>
      )}

      <div className="space-y-4">
        <AnimatePresence>
          {form.programmes.map((f, i) => {
            const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
            const missingDate = !f.date;
            return (
              <motion.div key={f.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: missingDate ? `${c.accent}50` : c.border, background: 'rgba(255,255,255,0.45)' }}>
                <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: c.border, background: `${preset?.color || c.gold}10` }}>
                  <div className="flex flex-col">
                    <button onClick={() => move(f.id, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-20" style={{ color: c.gold }}><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => move(f.id, 1)} disabled={i === form.programmes.length - 1} className="p-0.5 disabled:opacity-20" style={{ color: c.gold }}><ArrowDown className="w-3 h-3" /></button>
                  </div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${preset?.color || c.gold}22` }}>{preset?.icon || '✨'}</div>
                  <input value={f.name} onChange={e => updateFn(f.id, 'name', e.target.value)}
                    className="flex-1 bg-transparent font-semibold outline-none text-base min-w-0" style={{ color: c.text }} placeholder="Function name" />
                  {missingDate && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${c.accent}18`, color: c.accent }}>Add date ↓</span>}
                  <button onClick={() => removeFn(f.id)} className="p-2 rounded-lg transition shrink-0" style={{ color: '#dc2626' }}><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="p-4 grid sm:grid-cols-2 gap-3">
                  <Field label="Date" required c={c}><Input c={c} type="date" value={f.date} onChange={e => updateFn(f.id, 'date', e.target.value)} /></Field>
                  <Field label="Time" c={c}><Input c={c} type="time" value={f.time} onChange={e => updateFn(f.id, 'time', e.target.value)} /></Field>
                  <div className="sm:col-span-2"><Field label="Venue Name" c={c}><Input c={c} value={f.venue} onChange={e => updateFn(f.id, 'venue', e.target.value)} placeholder="e.g. Taj Palace Banquet Hall" /></Field></div>
                  <div className="sm:col-span-2"><Field label="Full Address" c={c}><Textarea c={c} rows={2} value={f.address} onChange={e => updateFn(f.id, 'address', e.target.value)} placeholder="Street, City, PIN" /></Field></div>
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
function StepExtras({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  return (
    <>
      <Section title="Closing Line" eyebrow="Step 5A of 8"
        subtitle="The message at the bottom about blessings and gifts."
        c={c} icon={Star}>
        <div className="grid sm:grid-cols-2 gap-2">
          {CLOSING_TAGS.map(t => {
            const active = form.closingTag === t.id;
            return (
              <motion.button key={t.id} whileHover={{ x: 2 }} onClick={() => update('closingTag', t.id)}
                className="flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all"
                style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}12` : 'rgba(255,255,255,0.45)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                  style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`, color: active ? 'white' : c.gold }}>
                  {t.id.toUpperCase()}
                </div>
                <span className="text-xs sm:text-sm flex-1 leading-snug" style={{ color: c.text }}>{t.label}</span>
                {active && <Check className="w-4 h-4 shrink-0" style={{ color: c.gold }} strokeWidth={3} />}
              </motion.button>
            );
          })}
        </div>
      </Section>

      <div className="mt-5">
        <Section title="Kids Welcome Message" eyebrow="Step 5B · Optional"
          subtitle="A cute message from the little ones. Skip if not needed."
          c={c} icon={Heart}>
          <div className="grid gap-2">
            <motion.button whileHover={{ x: 2 }} onClick={() => update('kidsLine', '')}
              className="flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all"
              style={{ borderColor: form.kidsLine === '' ? c.gold : c.border, background: form.kidsLine === '' ? `${c.gold}10` : 'rgba(255,255,255,0.45)' }}>
              <X className="w-4 h-4 shrink-0 opacity-40" />
              <span className="text-sm italic" style={{ color: c.subtext }}>No kids message — skip this</span>
            </motion.button>
            {KIDS_LINES.map(t => {
              const active = form.kidsLine === t.id;
              return (
                <motion.button key={t.id} whileHover={{ x: 2 }} onClick={() => update('kidsLine', t.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}10` : 'rgba(255,255,255,0.45)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                    style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`, color: active ? 'white' : c.gold }}>{t.id}</div>
                  <span className="text-xs sm:text-sm flex-1 leading-snug" style={{ color: c.text }}>{t.label}</span>
                  {active && <Check className="w-4 h-4 shrink-0" style={{ color: c.gold }} strokeWidth={3} />}
                </motion.button>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="mt-5">
        <Section title="With Best Compliments From" eyebrow="Step 5C · Optional"
          subtitle="Names of well-wishers, sponsors, or relatives to list at bottom."
          c={c} icon={FileText}>
          <Textarea c={c} rows={3} value={form.withCompliments} onChange={e => update('withCompliments', e.target.value)}
            placeholder="e.g. Sharma & Gupta Families, All relatives and friends…" />
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
  const filtered = FONTS.filter(f =>
    (cat === 'All' || f.cat === cat) &&
    (form.design.language === 'English' ? f.langs.includes('English') : f.langs.includes(form.design.language) || f.langs.includes('English')) &&
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const previewText = form.design.language === 'Hindi' ? 'विवाह आमंत्रण'
    : form.design.language === 'Marathi' ? 'विवाह सोहळा'
    : form.design.language === 'Gujarati' ? 'લગ્ન આમંત્રણ'
    : 'Wedding Invitation';

  return (
    <>
      <Section title="Layout & Language" eyebrow="Step 6A of 8"
        subtitle="Choose the card language and overall layout style."
        c={c} icon={PaletteIcon}>
        <Field label="Card Language" c={c}>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {['English', 'Hindi', 'Marathi', 'Gujarati'].map(l => (
              <button key={l} onClick={() => update('design.language', l)}
                className="py-3 rounded-2xl border-2 text-xs font-bold transition-all"
                style={{
                  borderColor: form.design.language === l ? c.gold : c.border,
                  background: form.design.language === l ? `${c.gold}15` : 'rgba(255,255,255,0.4)',
                  color: form.design.language === l ? c.gold : c.text
                }}>{l}</button>
            ))}
          </div>
        </Field>
        <div className="mt-5">
          <Field label="Card Layout Style" c={c}>
            <div className="grid sm:grid-cols-3 gap-3 mt-1">
              {LAYOUTS.map(l => {
                const Icon = l.icon;
                const active = form.design.layout === l.id;
                return (
                  <motion.button key={l.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => update('design.layout', l.id)}
                    className="p-4 rounded-2xl border-2 text-left transition-all"
                    style={{
                      borderColor: active ? c.gold : c.border,
                      background: active ? `linear-gradient(135deg, ${c.gold}12, ${c.primary}08)` : 'rgba(255,255,255,0.4)',
                      boxShadow: active ? `0 10px 30px -10px ${c.gold}50` : 'none'
                    }}>
                    <Icon className="w-5 h-5 mb-2" style={{ color: active ? c.gold : c.subtext }} />
                    <div className="font-bold text-sm" style={{ color: c.text }}>{l.name}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: c.subtext }}>{l.desc}</div>
                  </motion.button>
                );
              })}
            </div>
          </Field>
        </div>
      </Section>

      <div className="mt-5">
        <Section title="Typography" eyebrow="Step 6B · Optional"
          subtitle="Fine-tune fonts and text sizing (defaults look great as-is)."
          c={c} icon={Type}>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <SliderField label="Font Size" value={form.design.fontSize} min={12} max={22} step={1} unit="px" onChange={v => update('design.fontSize', v)} c={c} />
            <SliderField label="Letter Spacing" value={form.design.letterSpacing} min={0} max={4} step={0.1} unit="px" onChange={v => update('design.letterSpacing', v)} c={c} />
            <SliderField label="Line Height" value={form.design.lineHeight} min={1.2} max={2.2} step={0.05} unit="×" onChange={v => update('design.lineHeight', v)} c={c} />
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: c.border }}>
            <div className="flex gap-1 p-2 m-2 rounded-xl" style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
              {[{ k: 'heading', l: 'Heading Font' }, { k: 'body', l: 'Body Font' }, { k: 'script', l: 'Script Font' }].map(t => (
                <button key={t.k} onClick={() => setTarget(t.k)} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{ background: target === t.k ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: target === t.k ? 'white' : c.subtext }}>
                  {t.l}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 px-3 pb-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                <Input c={c} className="pl-10" placeholder="Search fonts…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select c={c} className="sm:w-40" value={cat} onChange={e => setCat(e.target.value)}>
                {cats.map(ct => <option key={ct}>{ct}</option>)}
              </Select>
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
        <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: c.subtext }}>{label}</div>
        <div className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg" style={{ color: c.gold, background: `${c.gold}12` }}>{value}{unit}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ accentColor: c.gold }} />
    </div>
  );
}

/* ─── Step 6: Preview ────────────────────────────────────────────────────── */
function StepPreview({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  return (
    <Section title="Preview Your Card" eyebrow="Step 7 of 8"
      subtitle="This is exactly how the designer will see your card."
      tip="Check all names and dates carefully before submitting."
      c={c} icon={Eye}>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[{ k: 'desktop', i: Monitor, l: 'Full Size' }, { k: 'mobile', i: Smartphone, l: 'Compact' }].map(d => {
          const Icon = d.i; const active = form.preview.device === d.k;
          return (
            <button key={d.k} onClick={() => update('preview.device', d.k)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold transition-all"
              style={{ borderColor: active ? 'transparent' : c.border, background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'rgba(255,255,255,0.5)', color: active ? 'white' : c.text }}>
              <Icon className="w-3.5 h-3.5" /> {d.l}
            </button>
          );
        })}
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold ml-auto transition hover:opacity-80"
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
function StepSubmit({ form, update, c, onSubmit, setStep, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; onSubmit: () => void; setStep: (n: number) => void; dark: boolean }) {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const sections = [
    { label: 'Bride & Groom', step: 0, value: `${form.bride.name || '—'} & ${form.groom.name || '—'}`, icon: Heart, ok: !!(form.bride.name && form.groom.name) },
    { label: 'Card Order', step: 0, value: form.brideFirst ? 'Bride first' : 'Groom first', icon: ArrowLeftRight, ok: true },
    { label: 'Deities', step: 1, value: `${form.deities.length} selected`, icon: Star, ok: form.deities.length > 0 },
    { label: 'Template', step: 2, value: template ? `#${template.id} · ${template.category}` : 'Not selected', icon: BookOpen, ok: !!template },
    { label: 'Programmes', step: 3, value: `${form.programmes.filter(p => p.date).length} with dates`, icon: Calendar, ok: form.programmes.some(p => p.date) },
    { label: 'Closing Line', step: 4, value: closing?.label || '—', icon: FileText, ok: true },
    { label: 'Design', step: 5, value: `${form.design.language} · ${form.design.layout}`, icon: Type, ok: true },
  ];

  return (
    <Section title="Review & Submit" eyebrow="Final Step"
      subtitle="Double-check everything below. Once submitted, the designer begins work immediately."
      tip="Make sure all names are spelled exactly as you want them on the card."
      c={c} icon={CheckCircle2}>
      <div className="space-y-2 mb-6">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.45)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.ok ? `${c.gold}15` : '#f9923210' }}>
                <Icon className="w-4 h-4" style={{ color: s.ok ? c.gold : '#f97316' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: c.subtext }}>{s.label}</div>
                <div className="text-sm font-semibold truncate" style={{ color: c.text }}>{s.value}</div>
              </div>
              <button onClick={() => setStep(s.step)}
                className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider transition hover:opacity-80"
                style={{ color: c.gold, background: `${c.gold}15` }}>
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
          <div className="text-sm font-semibold leading-snug" style={{ color: c.text }}>I have checked all details and confirm they are correct</div>
          <div className="text-xs mt-1 leading-snug" style={{ color: c.subtext }}>The designer will use this content exactly as shown. Proofread all names and dates carefully.</div>
        </div>
      </label>
    </Section>
  );
}

/* ─── Card Preview ───────────────────────────────────────────────────────── */
function CardPreview({ form, c, dark, compact }: { form: FormState; c: Palette; dark: boolean; compact?: boolean }) {
  const layout = form.design.layout;
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = KIDS_LINES.find(t => t.id === form.kidsLine);
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);
  const hasNames = !!(form.bride.name || form.groom.name);

  // first/second based on brideFirst toggle
  const first = form.brideFirst ? form.bride : form.groom;
  const second = form.brideFirst ? form.groom : form.bride;
  const firstLabel = form.brideFirst ? 'BRIDE' : 'GROOM';
  const secondLabel = form.brideFirst ? 'GROOM' : 'BRIDE';

  const cardBg = layout === 'modern'
    ? 'linear-gradient(180deg, #FFFFFF 0%, #FAF6EC 100%)'
    : layout === 'traditional'
    ? 'linear-gradient(180deg, #FBF3DC 0%, #F0D9A0 100%)'
    : 'linear-gradient(180deg, #FBF7E4 0%, #EFD89C 50%, #FBF7E4 100%)';

  if (!hasNames && compact) {
    return (
      <div className="rounded-2xl flex flex-col items-center justify-center py-10 px-6 text-center" style={{ background: cardBg, minHeight: 200 }}>
        <div className="text-4xl mb-3 opacity-40">💌</div>
        <div className="text-sm font-semibold" style={{ color: '#7B1E2E', fontFamily: "'Cormorant Garamond', serif", fontSize: '1.1rem' }}>Your card preview</div>
        <div className="text-xs mt-1.5" style={{ color: '#7B1E2E', opacity: 0.6 }}>Enter bride & groom names to see it come to life</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl relative" style={{ background: cardBg, color: '#2A0E14' }}>
      {layout !== 'modern' && (
        <>
          <div className="absolute inset-2.5 rounded-xl pointer-events-none" style={{ border: '2px double #8B6020', opacity: 0.5 }} />
          <div className="absolute inset-4 rounded-lg pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.4 }} />
        </>
      )}
      {layout === 'modern' && (
        <div className="absolute inset-3 rounded-xl pointer-events-none" style={{ border: '1px solid #C0892E', opacity: 0.3 }} />
      )}

      <div className={`relative ${compact ? 'p-5 pt-6' : 'p-7 sm:p-10 pt-8'} text-center`}
        style={{ fontFamily: form.design.bodyFont, fontSize: `${form.design.fontSize}px`, letterSpacing: `${form.design.letterSpacing}px`, lineHeight: form.design.lineHeight }}>

        {/* Deities */}
        {form.deities.length > 0 && (
          <div className="mb-3 px-2 py-2 rounded-lg" style={{ background: 'rgba(123, 30, 46, 0.05)', border: '1px dashed rgba(192, 137, 46, 0.45)' }}>
            <div className="flex items-center justify-around gap-1 flex-wrap">
              {form.deities.map(id => {
                const d = DEITIES.find(x => x.id === id);
                return <div key={id} className="text-xl sm:text-2xl" title={d?.name}>{d?.glyph}</div>;
              })}
            </div>
          </div>
        )}
        {form.deities[0] && (
          <div className="text-[9px] uppercase tracking-[0.35em] mb-3 font-semibold" style={{ color: '#7B1E2E', fontFamily: form.design.headingFont }}>
            {DEITIES.find(d => d.id === form.deities[0])?.mantra}
          </div>
        )}

        <DecorativeDivider compact={compact} />

        {/* Host line — show exactly as user typed, no auto Mr/Mrs */}
        {form.hostType === 'parents' && (first.fatherName || first.motherName || second.fatherName || second.motherName) && (
          <div className="text-[11px] mb-2 font-medium" style={{ color: '#5A0F1C' }}>
            {pn(first.motherPrefix, first.motherName) || pn(second.motherPrefix, second.motherName) || ''}
            {((first.motherName || second.motherName) && (first.fatherName || second.fatherName)) ? ' & ' : ''}
            {pn(first.fatherPrefix, first.fatherName) || pn(second.fatherPrefix, second.fatherName) || ''}
          </div>
        )}

        {/* Invitation template */}
        {template && (
          <p className="mb-5 italic opacity-80 max-w-md mx-auto whitespace-pre-line" style={{ fontSize: '0.88em', fontFamily: form.design.bodyFont, lineHeight: 1.6 }}>
            {fillTemplate(template.text, form).replace(/\{child\}/g, '').replace(/\n\n\n/g, '\n\n')}
          </p>
        )}

        {/* Names block — order controlled by brideFirst */}
        <div className="my-5">
          <div className="text-[9px] font-bold mb-1.5" style={{ color: '#7B1E2E', letterSpacing: '0.45em' }}>{firstLabel}</div>
          {first.namePrefix && (
            <div className="text-xs font-medium mb-0.5" style={{ color: '#5A0F1C' }}>{first.namePrefix}</div>
          )}
          <div className="font-medium leading-none mb-1" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.6em' : '2.4em', color: '#1A0608' }}>
            {first.name || <span className="opacity-30 italic">{firstLabel === 'BRIDE' ? 'Bride Name' : 'Groom Name'}</span>}
          </div>
          {(first.fatherName || first.motherName) && (
            <div className="text-[10px] opacity-65 mt-1 font-medium">
              {pn(first.fatherPrefix, first.fatherName)}{first.fatherName && first.motherName ? ' & ' : ''}{pn(first.motherPrefix, first.motherName)}
            </div>
          )}
          {first.grandparents && (
            <div className="text-[10px] opacity-55 mt-0.5">{pn(first.grandparentsPrefix, first.grandparents)}</div>
          )}

          {/* Relation word */}
          <div className="my-3 relative">
            <div style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: compact ? '2.2em' : '3em', color: '#C0892E', lineHeight: 0.9 }}>
              {relation?.label || 'Weds'}
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-12 h-px" style={{ background: '#C0892E' }} />
          </div>

          <div className="text-[9px] font-bold mb-1.5 mt-1" style={{ color: '#7B1E2E', letterSpacing: '0.45em' }}>{secondLabel}</div>
          {second.namePrefix && (
            <div className="text-xs font-medium mb-0.5" style={{ color: '#5A0F1C' }}>{second.namePrefix}</div>
          )}
          <div className="font-medium leading-none mb-1" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.6em' : '2.4em', color: '#1A0608' }}>
            {second.name || <span className="opacity-30 italic">{secondLabel === 'BRIDE' ? 'Bride Name' : 'Groom Name'}</span>}
          </div>
          {(second.fatherName || second.motherName) && (
            <div className="text-[10px] opacity-65 mt-1 font-medium">
              {pn(second.fatherPrefix, second.fatherName)}{second.fatherName && second.motherName ? ' & ' : ''}{pn(second.motherPrefix, second.motherName)}
            </div>
          )}
          {second.grandparents && (
            <div className="text-[10px] opacity-55 mt-0.5">{pn(second.grandparentsPrefix, second.grandparents)}</div>
          )}
        </div>

        {/* Programmes */}
        {form.programmes.some(p => p.date) && (
          <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(123, 30, 46, 0.2)' }}>
            <DecorativeDivider compact={compact} mini />
            <div className="text-[10px] font-bold mb-3 mt-2" style={{ color: '#7B1E2E', letterSpacing: '0.4em', fontFamily: form.design.headingFont }}>◈ PROGRAMMES ◈</div>
            <div className="grid gap-2">
              {form.programmes.filter(f => f.date).map(f => {
                const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
                return (
                  <div key={f.id} className="rounded-xl p-2.5 text-left" style={{ background: `linear-gradient(135deg, ${preset?.color || '#C0892E'}12, transparent)`, border: `1px solid ${preset?.color || '#C0892E'}25` }}>
                    <div className="flex items-start gap-2">
                      <div className="text-lg shrink-0">{preset?.icon || '✨'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1em', color: '#7B1E2E' }}>{f.name}</div>
                        <div className="text-[10px] mt-1 font-medium">
                          {new Date(f.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          {f.time && <span className="opacity-55"> · {f.time}</span>}
                        </div>
                        {f.venue && <div className="text-[10px] font-semibold">{f.venue}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {form.family.residenceAddress && (
          <div className="mt-5 pt-4 text-[10px]" style={{ borderTop: '1px solid rgba(123, 30, 46, 0.2)' }}>
            <div className="font-bold mb-0.5" style={{ color: '#7B1E2E' }}>Residence:</div>
            <div className="opacity-65">{form.family.residenceAddress}</div>
          </div>
        )}
        {form.withCompliments && (
          <div className="mt-3 text-[10px]">
            <div className="font-bold mb-0.5" style={{ color: '#7B1E2E' }}>With Best Compliments From:</div>
            <div className="opacity-65">{form.withCompliments}</div>
          </div>
        )}
        {kidsLine && (
          <div className="mt-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(192, 137, 46, 0.10)' }}>
            <div className="text-[10px] italic" style={{ color: '#5A0F1C' }}>{kidsLine.label}</div>
          </div>
        )}
        {closing && (
          <div className="mt-4 text-[10px] font-bold tracking-[0.28em]" style={{ color: '#7B1E2E' }}>
            ✦ {closing.label.toUpperCase()} ✦
          </div>
        )}
        <div className="mt-4 flex justify-center">
          <svg width="40" height="12" viewBox="0 0 40 12" fill="#C0892E" opacity="0.5">
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

/* ─── Success Screen ─────────────────────────────────────────────────────── */
function Success({ submitted, c, form, dark, onReset }: { submitted: SubmittedOrder; c: Palette; form: FormState; dark: boolean; onReset: () => void }) {
  const corel = generateCorelText(form);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `🌹 *New Wedding Matter Order*\n\n` +
      `*Order ID:* ${submitted.orderId}\n` +
      (form.bride.name && form.groom.name ? `*Couple:* ${form.bride.name} ❤️ ${form.groom.name}\n` : '') +
      `*Submitted:* ${submitted.at}\n\n` +
      `Please check the designer console for full card details.\n\n_Wedding Matter Pro_`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="pt-12 max-w-2xl mx-auto">
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 20px 60px -10px ${c.primary}60` }}>
        <Check className="w-14 h-14 text-white" strokeWidth={3} />
        <motion.div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${c.gold}` }}
          animate={{ scale: [1, 1.45, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.2, repeat: Infinity }} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="text-center">
        <h1 className="font-medium mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '3rem' }}>
          Beautifully <em style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.25em', lineHeight: 0.8 }}>done!</em>
        </h1>
        {form.bride.name && form.groom.name && (
          <div className="text-2xl mb-2" style={{ fontFamily: "'Tangerine', cursive", color: c.gold }}>
            {form.bride.name} & {form.groom.name}
          </div>
        )}
        <p className="text-sm" style={{ color: c.subtext }}>Your wedding matter is now with our designer 🌹</p>
      </motion.div>

      <Divider c={c} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
        className="rounded-3xl border p-7 shadow-2xl mt-6 text-center"
        style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
        <div className="text-[10px] uppercase tracking-[0.32em] mb-2 font-bold" style={{ color: c.subtext }}>Your Order ID</div>
        <div className="text-4xl font-bold tracking-[0.18em] font-mono" style={{ color: c.gold }}>{submitted.orderId}</div>
        <div className="text-xs mt-2" style={{ color: c.subtext }}>Submitted at {submitted.at}</div>
        <div className="text-xs mt-1 font-semibold" style={{ color: c.subtext }}>Save this ID — mention it when following up</div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.46 }} className="grid grid-cols-2 gap-3 mt-4">
        <button onClick={shareWhatsApp}
          className="flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl text-white font-bold text-sm shadow-xl transition hover:opacity-90 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #1DA851, #128C3E)', boxShadow: '0 12px 32px -8px #1DA85160' }}>
          <MessageCircle className="w-5 h-5" /> Share on WhatsApp
        </button>
        <button onClick={copy}
          className="flex items-center justify-center gap-2 px-4 py-4 rounded-2xl font-bold text-sm border-2 transition hover:opacity-80 active:scale-95"
          style={{ borderColor: c.gold, color: c.gold, background: `${c.gold}12` }}>
          {copied ? <><Check className="w-4 h-4" strokeWidth={3} /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Export</>}
        </button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.54 }}
        className="rounded-3xl border p-5 mt-4" style={{ borderColor: c.border, background: c.surface }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>CorelDRAW Export</div>
          <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy All'}
          </button>
        </div>
        <pre className="text-[10px] whitespace-pre-wrap font-mono opacity-65 max-h-52 overflow-y-auto p-3 rounded-xl"
          style={{ background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)' }}>{corel}</pre>
      </motion.div>

      <button onClick={onReset} className="mt-5 mx-auto flex items-center gap-2 px-6 py-3 rounded-full border text-sm font-semibold transition hover:opacity-80"
        style={{ borderColor: c.border, color: c.text }}>
        Submit Another Order
      </button>
    </div>
  );
}

/* ─── Admin Dashboard ────────────────────────────────────────────────────── */
function AdminDashboard({ c, dark, orders, setOrders }: { c: Palette; dark: boolean; orders: SubmittedOrder[]; setOrders: (o: SubmittedOrder[]) => void }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SubmittedOrder | null>(null);

  const filtered = orders.filter(o =>
    (filter === 'All' || o.status === filter) &&
    (o.couple.toLowerCase().includes(search.toLowerCase()) || o.orderId.toLowerCase().includes(search.toLowerCase()))
  );

  const updateStatus = (orderId: string, status: SubmittedOrder['status']) => {
    const updated = orders.map(o => o.orderId === orderId ? { ...o, status } : o);
    setOrders(updated);
    if (selected?.orderId === orderId) setSelected(prev => prev ? { ...prev, status } : null);
  };

  const deleteOrder = (orderId: string) => {
    setOrders(orders.filter(o => o.orderId !== orderId));
    if (selected?.orderId === orderId) setSelected(null);
  };

  const stats = [
    { label: 'Total', value: orders.length, icon: Package, gradient: [c.gold, c.goldDeep] },
    { label: 'New', value: orders.filter(o => o.status === 'New').length, icon: Bell, gradient: [c.primary, '#9C2C77'] },
    { label: 'In Progress', value: orders.filter(o => o.status === 'In Progress').length, icon: Clock, gradient: ['#3B82F6', '#1D4ED8'] },
    { label: 'Completed', value: orders.filter(o => o.status === 'Completed').length, icon: CheckCircle2, gradient: ['#16A34A', '#15803D'] },
  ];

  return (
    <div className="pt-4 sm:pt-6">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1" style={{ color: c.gold }}>Designer Console</div>
          <h1 className="text-4xl sm:text-5xl font-medium leading-none" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Orders Dashboard
          </h1>
        </div>
        <div className="text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: `${c.gold}12`, color: c.subtext }}>
          <Save className="w-3.5 h-3.5" style={{ color: c.gold }} /> Auto-saved · {orders.length} order{orders.length !== 1 ? 's' : ''} stored
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} whileHover={{ y: -4 }} className="rounded-3xl border p-5 shadow-xl relative overflow-hidden"
              style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
              <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full opacity-10" style={{ background: s.gradient[0] }} />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: c.subtext }}>{s.label}</div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})` }}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="text-4xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif", color: c.text }}>{s.value}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="rounded-3xl border p-5 sm:p-6 shadow-xl mb-6" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
            <Input c={c} className="pl-10" placeholder="Search couple name or order ID…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {['All', 'New', 'In Progress', 'Completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className="px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                style={{
                  background: filter === f ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                  border: `1px solid ${filter === f ? 'transparent' : c.border}`,
                  color: filter === f ? 'white' : c.text
                }}>{f}</button>
            ))}
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📭</div>
            <div className="text-xl font-medium mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", color: c.text }}>No orders yet</div>
            <div className="text-sm" style={{ color: c.subtext }}>Orders submitted by customers will appear here instantly</div>
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
                    <Heart className="w-5 h-5" style={{ color: c.gold }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-lg leading-none" style={{ fontFamily: "'Cormorant Garamond', serif", color: c.text }}>{o.couple}</div>
                      <div className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: `${c.gold}15`, color: c.gold }}>{o.orderId}</div>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: c.subtext }}>{o.at}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge s={o.status} c={c} />
                  <ChevronRight className="w-4 h-4 opacity-35 hidden sm:block" />
                </div>
              </motion.div>
            ))}
            {filtered.length === 0 && orders.length > 0 && (
              <div className="text-center py-14 text-sm" style={{ color: c.subtext }}>No orders match your filters</div>
            )}
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
  const map: Record<string, { bg: string; color: string }> = {
    'New': { bg: `${c.gold}20`, color: c.gold },
    'In Progress': { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
    'Completed': { bg: 'rgba(22,163,74,0.15)', color: '#16A34A' },
  };
  const st = map[s] || map['New'];
  return (
    <span className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
      style={{ background: st.bg, color: st.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} /> {s}
    </span>
  );
}

function OrderModal({ order, onClose, c, dark, onStatusChange, onDelete }: {
  order: SubmittedOrder; onClose: () => void; c: Palette; dark: boolean;
  onStatusChange: (s: SubmittedOrder['status']) => void; onDelete: () => void;
}) {
  const corel = generateCorelText(order.form);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(`🌹 *Order ${order.orderId}*\n*Couple:* ${order.couple}\n*Status:* ${order.status}\n*Submitted:* ${order.at}\n\n_Wedding Matter Pro_`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl border"
        style={{ background: dark ? palette.dark.bg1 : palette.light.bg1, borderColor: c.border }}>
        <div className="sticky top-0 z-10 backdrop-blur-xl p-5 sm:p-6 border-b flex items-center justify-between gap-3"
          style={{ borderColor: c.border, background: dark ? 'rgba(13,4,7,0.90)' : 'rgba(251,245,230,0.90)' }}>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: c.gold }}>{order.orderId}</div>
            <h2 className="text-2xl sm:text-3xl font-medium truncate" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{order.couple}</h2>
            <div className="text-xs mt-0.5" style={{ color: c.subtext }}>{order.at}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Status changer */}
            <Select c={c} className="text-[11px] !py-2" value={order.status} onChange={e => onStatusChange(e.target.value as SubmittedOrder['status'])}>
              <option>New</option>
              <option>In Progress</option>
              <option>Completed</option>
            </Select>
            <button onClick={onClose} className="p-2.5 rounded-full border hover:scale-105 transition" style={{ borderColor: c.border }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-5 sm:p-6 grid lg:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: c.gold }}>Card Preview</div>
            <CardPreview form={order.form} c={c} dark={dark} compact />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>CorelDRAW Export</div>
              <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy All'}
              </button>
            </div>
            <pre className="text-[10px] whitespace-pre-wrap font-mono p-4 rounded-2xl border max-h-[360px] overflow-y-auto"
              style={{ borderColor: c.border, background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.65)' }}>
              {corel}
            </pre>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={shareWhatsApp}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-white text-xs font-bold transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #1DA851, #128C3E)' }}>
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
              {confirmDelete ? (
                <button onClick={onDelete}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-white text-xs font-bold"
                  style={{ background: '#dc2626' }}>
                  <Trash2 className="w-4 h-4" /> Confirm Delete
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold border"
                  style={{ borderColor: '#dc262640', color: '#dc2626', background: '#dc262610' }}>
                  <Trash2 className="w-4 h-4" /> Delete Order
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
