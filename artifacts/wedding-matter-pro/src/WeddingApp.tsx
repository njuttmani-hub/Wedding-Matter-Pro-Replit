import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ChevronRight, ChevronLeft, Check, Plus, Trash2,
  Heart, Calendar, FileText, Type, Eye, Send, Copy, Search,
  Sun, Moon, LayoutDashboard, Clock, CheckCircle2, Edit3, X,
  Smartphone, Monitor, Printer, ArrowUp, ArrowDown, User, Package,
  Bell, Palette as PaletteIcon, Crown, Flame, Gem, Star, BookOpen, Music
} from 'lucide-react';
import type { Palette, FormState, PersonInfo, Programme, SubmittedOrder } from './types';
import {
  INVITATION_TEMPLATES, DEITIES, RELATION_WORDS, CLOSING_TAGS, KIDS_LINES,
  PROGRAMME_PRESETS, FONTS, SAMPLE_ORDERS
} from './data/constants';

const palette: { light: Palette; dark: Palette } = {
  light: {
    bg1: '#FAF3E3', bg2: '#F5E6C8',
    surface: 'rgba(255, 251, 241, 0.72)',
    border: 'rgba(193, 124, 49, 0.22)',
    text: '#2A0E14', subtext: 'rgba(42, 14, 20, 0.62)',
    primary: '#7B1E2E', primaryDark: '#5A0F1C',
    gold: '#B8893D', goldLight: '#D4A857', goldDeep: '#8B6420',
    accent: '#C44536', ink: '#1A0608',
  },
  dark: {
    bg1: '#0F0508', bg2: '#1A0A0E',
    surface: 'rgba(26, 10, 14, 0.72)',
    border: 'rgba(184, 137, 61, 0.25)',
    text: '#F5E6C8', subtext: 'rgba(245, 230, 200, 0.62)',
    primary: '#C44536', primaryDark: '#7B1E2E',
    gold: '#D4A857', goldLight: '#E8C474', goldDeep: '#B8893D',
    accent: '#E8C474', ink: '#FAF3E3',
  }
};

const LAYOUTS = [
  { id: 'royal', name: 'Royal', desc: 'Ornate borders, monumental fonts', icon: Crown },
  { id: 'traditional', name: 'Traditional', desc: 'Classic Indian aesthetic', icon: Flame },
  { id: 'modern', name: 'Modern', desc: 'Minimal, editorial spacing', icon: Gem },
];

const STEPS = [
  { id: 0, label: 'Family', short: 'Family', icon: User },
  { id: 1, label: 'Deities', short: 'Deities', icon: Star },
  { id: 2, label: 'Invitation Text', short: 'Text', icon: BookOpen },
  { id: 3, label: 'Programmes', short: 'Events', icon: Calendar },
  { id: 4, label: 'Extras', short: 'Extras', icon: FileText },
  { id: 5, label: 'Typography', short: 'Type', icon: Type },
  { id: 6, label: 'Preview', short: 'View', icon: Eye },
  { id: 7, label: 'Submit', short: 'Send', icon: Send },
];

const initialForm: FormState = {
  bride: { name: '', salutation: 'Ms.', fatherName: '', motherName: '', grandparents: '' },
  groom: { name: '', salutation: 'Mr.', fatherName: '', motherName: '', grandparents: '' },
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

  let s = '';
  s += `╔══════════════════════════════════╗\n║   WEDDING CARD MATTER EXPORT     ║\n╚══════════════════════════════════╝\n\n`;
  s += `─── DEITIES (TOP ROW) ───\n${deityGlyphs}\n${deityNames}\nPrimary Mantra: ${DEITIES.find(d => d.id === form.deities[0])?.mantra || '—'}\n\n`;
  s += `─── DESIGN ───\nLanguage: ${form.design.language} | Layout: ${form.design.layout.toUpperCase()}\nHeading: ${form.design.headingFont}\nBody: ${form.design.bodyFont}\nScript: ${form.design.scriptFont}\nSize ${form.design.fontSize}px / Spacing ${form.design.letterSpacing}px / Leading ${form.design.lineHeight}\n\n`;
  s += `─── INVITATION TEMPLATE #${template?.id} (${template?.category}) ───\n${fillTemplate(template?.text || '', form)}\n\n`;
  s += `─── BRIDE ───\n${form.bride.salutation} ${form.bride.name}\nD/o ${form.bride.fatherName} & ${form.bride.motherName}\n${form.bride.grandparents ? `G/o ${form.bride.grandparents}\n` : ''}\n`;
  s += `─── RELATION ───\n${relation?.label || 'Weds'}\n\n`;
  s += `─── GROOM ───\n${form.groom.salutation} ${form.groom.name}\nS/o ${form.groom.fatherName} & ${form.groom.motherName}\n${form.groom.grandparents ? `G/o ${form.groom.grandparents}\n` : ''}\n`;
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

export default function WeddingApp() {
  const [mode, setMode] = useState<'customer' | 'admin'>('customer');
  const [dark, setDark] = useState(false);
  const c = dark ? palette.dark : palette.light;

  useEffect(() => {
    const id = 'wmp-fonts-v3';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Cormorant+Infant:wght@400;600&family=Playfair+Display:wght@400;700;900&family=Cinzel:wght@400;700;900&family=Cinzel+Decorative:wght@400;700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Marcellus&family=Tangerine:wght@400;700&family=Great+Vibes&family=Italianno&family=Pinyon+Script&family=Allura&family=Tiro+Devanagari+Hindi&family=Noto+Serif+Devanagari:wght@400;700&family=Rozha+One&family=Yatra+One&family=Sahitya:wght@400;700&family=Modak&family=Noto+Serif+Gujarati:wght@400;700&family=Rasa:wght@400;600&family=Hind+Vadodara:wght@400;600&display=swap';
    document.head.appendChild(link);
  }, []);

  return (
    <div className="min-h-screen relative transition-colors duration-700" style={{ background: c.bg1, color: c.text, fontFamily: "'EB Garamond', serif" }}>
      <Atmosphere c={c} dark={dark} />
      <Nav mode={mode} setMode={setMode} dark={dark} setDark={setDark} c={c} />
      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-32 pt-6">
        <AnimatePresence mode="wait">
          {mode === 'customer' ? (
            <motion.div key="c" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.4 }}>
              <CustomerFlow c={c} dark={dark} />
            </motion.div>
          ) : (
            <motion.div key="a" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.4 }}>
              <AdminDashboard c={c} dark={dark} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Atmosphere({ c, dark }: { c: Palette; dark: boolean }) {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute inset-0" style={{
        background: `radial-gradient(ellipse at 20% 0%, ${c.gold}15 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, ${c.primary}18 0%, transparent 50%), linear-gradient(180deg, ${c.bg1} 0%, ${c.bg2} 50%, ${c.bg1} 100%)`
      }} />
      <svg className="absolute -top-32 -right-32 w-[600px] h-[600px] opacity-[0.06]" viewBox="0 0 200 200">
        <defs>
          <g id="petal"><path d="M100 30 Q 110 60 100 90 Q 90 60 100 30" fill={c.gold} /></g>
        </defs>
        <circle cx="100" cy="100" r="95" fill="none" stroke={c.gold} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="80" fill="none" stroke={c.gold} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="65" fill="none" stroke={c.gold} strokeWidth="0.3" />
        <circle cx="100" cy="100" r="40" fill="none" stroke={c.gold} strokeWidth="0.5" />
        {Array.from({ length: 24 }).map((_, i) => (
          <use key={i} href="#petal" transform={`rotate(${i * 15} 100 100)`} />
        ))}
      </svg>
    </div>
  );
}

function Nav({ mode, setMode, dark, setDark, c }: {
  mode: string; setMode: (m: 'customer' | 'admin') => void;
  dark: boolean; setDark: (d: boolean) => void; c: Palette;
}) {
  return (
    <nav className="relative z-20 border-b" style={{ borderColor: c.border, background: `${c.surface}`, backdropFilter: 'blur(24px)' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            <Heart className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-sm leading-none" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.1rem' }}>Wedding Matter Pro</div>
            <div className="text-[9px] uppercase tracking-[0.3em] opacity-50">Premium Card Studio</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border p-0.5" style={{ borderColor: c.border }}>
            <button onClick={() => setMode('customer')}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
              style={{ background: mode === 'customer' ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: mode === 'customer' ? 'white' : c.subtext }}>
              Customer
            </button>
            <button onClick={() => setMode('admin')}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold transition-all flex items-center gap-1"
              style={{ background: mode === 'admin' ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent', color: mode === 'admin' ? 'white' : c.subtext }}>
              <LayoutDashboard className="w-3 h-3" /> Admin
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

function CustomerFlow({ c, dark }: { c: Palette; dark: boolean }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitted, setSubmitted] = useState<SubmittedOrder | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

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

  useEffect(() => {
    setSaving(true);
    const id = setTimeout(() => setSaving(false), 700);
    return () => clearTimeout(id);
  }, [form]);

  const canNext = useMemo(() => {
    if (step === 0) return !!(form.bride.name && form.groom.name);
    if (step === 1) return form.deities.length > 0;
    if (step === 2) return form.selectedTemplate !== null;
    if (step === 3) return form.programmes.length > 0 && form.programmes.every(p => p.name && p.date);
    return true;
  }, [step, form]);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2400);
  };
  const next = () => {
    if (!canNext) { showToast('Please complete required fields', 'error'); return; }
    setStep(s => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const prev = () => { setStep(s => Math.max(0, s - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const submit = () => {
    if (!form.meta.accepted) { showToast('Please accept terms to continue', 'error'); return; }
    setSubmitted({ orderId: `WMP-${Math.floor(2400 + Math.random() * 200)}`, at: new Date().toLocaleString() });
    showToast('Order submitted');
  };

  if (submitted) return (
    <Success submitted={submitted} c={c} form={form} dark={dark}
      onReset={() => { setSubmitted(null); setForm(initialForm); setStep(0); }} />
  );

  return (
    <div className="pt-4 sm:pt-6">
      <Hero c={c} />
      <Stepper step={step} setStep={setStep} c={c} dark={dark} saving={saving} />

      <div className="grid lg:grid-cols-12 gap-6 mt-6">
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.3 }}>
              {step === 0 && <StepFamily form={form} update={update} c={c} />}
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
            <div className="rounded-3xl border p-3 shadow-2xl" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.gold }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>Live Preview</span>
                </div>
                <button onClick={() => setPreviewExpanded(true)} className="p-1.5 rounded-full hover:scale-110 transition" style={{ color: c.gold }}>
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
              <CardPreview form={form} c={c} dark={dark} compact />
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {previewExpanded && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreviewExpanded(false)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }} onClick={e => e.stopPropagation()} className="max-w-lg w-full my-8">
              <CardPreview form={form} c={c} dark={dark} />
              <button onClick={() => setPreviewExpanded(false)} className="mt-4 w-full py-3 rounded-full text-white font-semibold" style={{ background: c.primary }}>Close Preview</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.9 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-full shadow-2xl text-sm font-semibold text-white flex items-center gap-2"
            style={{ background: toast.type === 'error' ? c.primary : `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            {toast.type === 'error' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Hero({ c }: { c: Palette }) {
  return (
    <div className="text-center mb-10 sm:mb-12">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-[0.25em] mb-5"
        style={{ borderColor: c.border, color: c.gold, background: `${c.gold}10` }}>
        <Sparkles className="w-3 h-3" /> Premium Card Studio
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl sm:text-6xl font-medium leading-[1.05] tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        Pick your perfect
        <br />
        <span style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.4em', fontWeight: 700, lineHeight: 0.8 }}>wedding matter</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-4 text-sm sm:text-base max-w-md mx-auto" style={{ color: c.subtext }}>
        22 ready invitation texts. 12 deities. Just tick and go — no writing needed.
      </motion.p>
      <Divider c={c} />
    </div>
  );
}

function Divider({ c, w = 'w-32' }: { c: Palette; w?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 mt-5">
      <div className={`h-px ${w}`} style={{ background: `linear-gradient(90deg, transparent, ${c.gold})` }} />
      <svg width="20" height="20" viewBox="0 0 20 20" fill={c.gold}>
        <path d="M10 2 L 12 8 L 18 10 L 12 12 L 10 18 L 8 12 L 2 10 L 8 8 Z" />
      </svg>
      <div className={`h-px ${w}`} style={{ background: `linear-gradient(90deg, ${c.gold}, transparent)` }} />
    </div>
  );
}

function Stepper({ step, setStep, c, dark, saving }: { step: number; setStep: (n: number) => void; c: Palette; dark: boolean; saving: boolean }) {
  const pct = (step / (STEPS.length - 1)) * 100;
  return (
    <div className="rounded-3xl border p-5 shadow-xl" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>Step {step + 1} · {STEPS[step].label}</div>
          <div className="text-xs mt-0.5" style={{ color: c.subtext }}>{STEPS.length - step - 1} step{STEPS.length - step - 1 !== 1 ? 's' : ''} remaining</div>
        </div>
        <motion.div animate={{ opacity: saving ? 1 : 0.7 }} className="text-[10px] font-semibold flex items-center gap-1.5" style={{ color: saving ? c.gold : c.subtext }}>
          {saving ? (<><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.gold }} />Saving</>) : (<><Check className="w-3 h-3" style={{ color: '#16a34a' }} />Saved</>)}
        </motion.div>
      </div>
      <div className="relative h-1 rounded-full overflow-hidden mb-5" style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
        <motion.div initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 70, damping: 18 }}
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${c.primary}, ${c.gold})` }} />
      </div>
      <div className="flex justify-between gap-1 overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
        {STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => i <= step && setStep(i)} disabled={i > step}
              className="group flex flex-col items-center gap-1.5 min-w-[56px] py-1 px-1.5 transition disabled:cursor-not-allowed disabled:opacity-40">
              <div className="relative w-9 h-9 rounded-full flex items-center justify-center transition-all"
                style={{
                  background: (active || done) ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                  border: `1.5px solid ${(active || done) ? 'transparent' : c.border}`,
                  color: (active || done) ? 'white' : c.subtext,
                  boxShadow: active ? `0 8px 20px -8px ${c.primary}90` : 'none',
                  transform: active ? 'scale(1.08)' : 'scale(1)'
                }}>
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                {active && (
                  <motion.div className="absolute inset-0 rounded-full" style={{ border: `1.5px solid ${c.gold}` }} animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2, repeat: Infinity }} />
                )}
              </div>
              <div className="text-[9px] font-semibold whitespace-nowrap tracking-wide" style={{ color: active ? c.gold : c.subtext }}>{s.short}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButtons({ step, prev, next, onSubmit, c, canNext }: { step: number; prev: () => void; next: () => void; onSubmit: () => void; c: Palette; canNext: boolean }) {
  return (
    <div className="flex items-center justify-between mt-6 gap-3">
      <button onClick={prev} disabled={step === 0}
        className="flex items-center gap-1.5 px-5 py-3 rounded-full border text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95"
        style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(10px)' }}>
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      {step < STEPS.length - 1 ? (
        <motion.button onClick={next} whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }}
          className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-bold text-white shadow-2xl tracking-wide"
          style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 12px 32px -10px ${c.primary}80` }}>
          Continue <ChevronRight className="w-4 h-4" />
        </motion.button>
      ) : (
        <motion.button onClick={onSubmit} whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }}
          className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-bold text-white shadow-2xl tracking-wide"
          style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
          Submit Matter <Send className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );
}

function Section({ title, subtitle, children, c, icon: Icon, eyebrow }: {
  title: string; subtitle?: string; children: React.ReactNode;
  c: Palette; dark?: boolean; icon?: React.ElementType; eyebrow?: string;
}) {
  return (
    <div className="rounded-3xl border shadow-2xl overflow-hidden" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
      <div className="px-6 sm:px-8 pt-6 sm:pt-7 pb-5 border-b relative" style={{ borderColor: c.border }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.gold}, transparent)` }} />
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${c.primary}15, ${c.gold}20)`, border: `1px solid ${c.border}` }}>
              <Icon className="w-5 h-5" style={{ color: c.gold }} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: c.gold }}>{eyebrow}</div>}
            <h2 className="text-2xl sm:text-3xl font-medium leading-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{title}</h2>
            {subtitle && <p className="text-xs sm:text-sm mt-1" style={{ color: c.subtext }}>{subtitle}</p>}
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
        {label} {required && <span style={{ color: c.primary }}>*</span>}
        {hint && <span className="text-[9px] font-normal normal-case tracking-normal opacity-70">— {hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({ c, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { c: Palette }) {
  return (
    <input className={`w-full px-4 py-3 rounded-2xl text-sm transition-all outline-none focus:ring-2 ${className}`}
      style={{
        background: 'rgba(255,255,255,0.5)', border: `1px solid ${c.border}`, color: c.text,
      }}
      onFocus={e => (e.target as HTMLInputElement).style.borderColor = c.gold}
      onBlur={e => (e.target as HTMLInputElement).style.borderColor = c.border}
      {...props} />
  );
}

function Textarea({ c, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { c: Palette }) {
  return (
    <textarea className="w-full px-4 py-3 rounded-2xl text-sm transition-all outline-none focus:ring-2 resize-none"
      style={{
        background: 'rgba(255,255,255,0.5)', border: `1px solid ${c.border}`, color: c.text,
      }}
      onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = c.gold}
      onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = c.border}
      {...props} />
  );
}

function Select({ c, children, className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { c: Palette }) {
  return (
    <select className={`w-full px-4 py-3 rounded-2xl text-sm transition-all outline-none focus:ring-2 appearance-none cursor-pointer ${className}`}
      style={{
        background: 'rgba(255,255,255,0.5)', border: `1px solid ${c.border}`, color: c.text,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(c.gold)}' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', paddingRight: '2.5rem'
      }}
      {...props}>{children}</select>
  );
}

function StepFamily({ form, update, c }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette }) {
  return (
    <Section title="The Two Families" eyebrow="Step One" subtitle="Names exactly as they should appear on the card" c={c} icon={Heart}>
      <div className="mb-6">
        <Field label="Inviting As (Hosts)" c={c}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'parents', label: 'Parents' },
              { id: 'grandparents', label: 'Grandparents' },
              { id: 'siblings', label: 'Siblings' },
              { id: 'self', label: 'Couple Themselves' },
            ].map(h => (
              <button key={h.id} onClick={() => update('hostType', h.id)}
                className="py-2.5 px-3 rounded-2xl border-2 text-xs font-bold transition-all"
                style={{
                  borderColor: form.hostType === h.id ? c.gold : c.border,
                  background: form.hostType === h.id ? `${c.gold}15` : 'rgba(255,255,255,0.3)',
                  color: form.hostType === h.id ? c.gold : c.text
                }}>{h.label}</button>
            ))}
          </div>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        <PersonCard side="Bride" person={form.bride} update={update} prefix="bride" c={c} />
        <PersonCard side="Groom" person={form.groom} update={update} prefix="groom" c={c} />
      </div>
      <div className="mt-7 pt-6 border-t" style={{ borderColor: c.border }}>
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-4" style={{ color: c.gold }}>Family Details</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Family Surname" c={c}><Input c={c} value={form.family.surname} onChange={e => update('family.surname', e.target.value)} placeholder="Sharma" /></Field>
          <Field label="Family Title" hint="e.g. Parivaar" c={c}><Input c={c} value={form.family.title} onChange={e => update('family.title', e.target.value)} placeholder="Parivaar" /></Field>
          <Field label="Native Place" c={c}><Input c={c} value={form.family.nativePlace} onChange={e => update('family.nativePlace', e.target.value)} placeholder="Jaipur, Rajasthan" /></Field>
          <Field label="Residence Address" c={c}><Input c={c} value={form.family.residenceAddress} onChange={e => update('family.residenceAddress', e.target.value)} placeholder="House No, Street, City" /></Field>
        </div>
      </div>
    </Section>
  );
}

function PersonCard({ side, person, update, prefix, c }: { side: string; person: PersonInfo; update: (path: string, value: unknown) => void; prefix: string; c: Palette }) {
  const isB = side === 'Bride';
  return (
    <div className="rounded-2xl p-5 border relative overflow-hidden"
      style={{ borderColor: c.border, background: `linear-gradient(180deg, ${isB ? c.primary : c.gold}08, transparent)` }}>
      <div className="absolute top-3 right-3 text-2xl opacity-30">{isB ? '👰' : '🤵'}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-4" style={{ color: isB ? c.primary : c.goldDeep }}>{side}</div>
      <div className="space-y-3">
        <Field label="Salutation" c={c}>
          <Select c={c} value={person.salutation} onChange={e => update(`${prefix}.salutation`, e.target.value)}>
            {isB ? <><option>Ms.</option><option>Miss</option><option>Kumari</option></> : <><option>Mr.</option><option>Shri</option><option>Kumar</option></>}
          </Select>
        </Field>
        <Field label="Full Name" required c={c}>
          <Input c={c} value={person.name} onChange={e => update(`${prefix}.name`, e.target.value)} placeholder={isB ? 'Aditi Sharma' : 'Rohan Mehta'} />
        </Field>
        <Field label="Father's Name (S/o, D/o)" c={c}>
          <Input c={c} value={person.fatherName} onChange={e => update(`${prefix}.fatherName`, e.target.value)} placeholder="Shri ..." />
        </Field>
        <Field label="Mother's Name" c={c}>
          <Input c={c} value={person.motherName} onChange={e => update(`${prefix}.motherName`, e.target.value)} placeholder="Smt ..." />
        </Field>
        <Field label="Grandparents (optional)" c={c}>
          <Input c={c} value={person.grandparents} onChange={e => update(`${prefix}.grandparents`, e.target.value)} placeholder="Late Shri & Smt ..." />
        </Field>
      </div>
    </div>
  );
}

function StepDeities({ form, setForm, c }: { form: FormState; update: (path: string, value: unknown) => void; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette }) {
  const toggle = (id: string) => {
    setForm(prev => ({
      ...prev,
      deities: prev.deities.includes(id) ? prev.deities.filter(d => d !== id) : [...prev.deities, id]
    }));
  };
  return (
    <Section title="Deities & Blessings" eyebrow="Step Two" subtitle="Tap all the deities you want at the top of your card" c={c} icon={Star}>
      <div className="mb-4 p-4 rounded-2xl border" style={{ borderColor: c.border, background: `${c.gold}08` }}>
        <div className="text-xs flex items-start gap-2" style={{ color: c.subtext }}>
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.gold }} />
          <span>Most cards have 6–9 deities in a row at the top. Tap to add or remove. <strong>{form.deities.length} selected.</strong></span>
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {DEITIES.map(d => {
          const active = form.deities.includes(d.id);
          const order = form.deities.indexOf(d.id) + 1;
          return (
            <motion.button key={d.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }} onClick={() => toggle(d.id)}
              className="relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center transition-all"
              style={{
                borderColor: active ? c.gold : c.border,
                background: active ? `linear-gradient(135deg, ${c.gold}20, ${c.primary}15)` : 'rgba(255,255,255,0.4)',
                boxShadow: active ? `0 8px 24px -8px ${c.gold}60` : 'none'
              }}>
              <div className="text-3xl mb-1">{d.glyph}</div>
              <div className="text-[9px] font-bold uppercase tracking-wider px-1 text-center leading-tight" style={{ color: active ? c.gold : c.subtext }}>{d.name}</div>
              {active && (
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: c.gold, boxShadow: `0 4px 12px ${c.gold}80` }}>
                  {order}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </Section>
  );
}

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
      <Section title="Pick Your Invitation Text" eyebrow="Step Three" subtitle="22 ready-made invitation matters — just pick the one you love" c={c} icon={BookOpen}>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <Input c={c} className="pl-10" placeholder="Search invitation text..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select c={c} className="sm:w-44" value={cat} onChange={e => setCat(e.target.value)}>
            {cats.map(ct => <option key={ct}>{ct}</option>)}
          </Select>
        </div>

        <div className="grid gap-3 max-h-[500px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {filtered.map(t => {
            const active = form.selectedTemplate === t.id;
            return (
              <motion.button key={t.id} whileHover={{ x: 3 }} onClick={() => update('selectedTemplate', t.id)}
                className="text-left p-4 rounded-2xl border-2 transition-all"
                style={{
                  borderColor: active ? c.gold : c.border,
                  background: active ? `linear-gradient(135deg, ${c.gold}12, ${c.primary}08)` : 'rgba(255,255,255,0.4)',
                  boxShadow: active ? `0 8px 24px -8px ${c.gold}40` : 'none'
                }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`, color: active ? 'white' : c.gold }}>
                    {t.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: `${c.gold}15`, color: c.gold }}>{t.category}</span>
                      {active && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: c.gold }} strokeWidth={3} />}
                    </div>
                    <p className="text-sm italic opacity-80 line-clamp-2" style={{ color: c.text }}>{t.preview}</p>
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
                    className="py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-all text-center"
                    style={{
                      borderColor: active ? c.gold : c.border,
                      background: active ? `${c.gold}15` : 'rgba(255,255,255,0.4)',
                      color: active ? c.gold : c.text,
                      fontFamily: "'Tangerine', cursive",
                      fontSize: '1.2rem'
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

function StepProgrammes({ form, setForm, c, dark }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; c: Palette; dark: boolean }) {
  const addProgramme = (preset: string) => {
    const p = PROGRAMME_PRESETS.find(x => x.id === preset);
    setForm(prev => ({
      ...prev,
      programmes: [...prev.programmes, {
        id: Date.now(), preset, name: p?.name || 'Other Programme',
        date: '', time: '', venue: '', address: '', notes: ''
      }]
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
    <Section title="Programmes & Functions" eyebrow="Step Four" subtitle="Like the back of the physical form — add all your events" c={c} icon={Calendar}>
      <div className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: c.subtext }}>Quick Add (Tap an Icon)</div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {PROGRAMME_PRESETS.map(p => (
            <motion.button key={p.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => addProgramme(p.id)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all hover:shadow-md"
              style={{ borderColor: c.border, background: 'rgba(255,255,255,0.5)' }}>
              <span className="text-xl">{p.icon}</span>
              <span className="text-[10px] font-semibold text-center leading-tight" style={{ color: c.text }}>{p.name}</span>
            </motion.button>
          ))}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => addProgramme('other')}
            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl text-white"
            style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            <Plus className="w-5 h-5" />
            <span className="text-[10px] font-bold">Custom</span>
          </motion.button>
        </div>
      </div>

      <div className="space-y-4">
        <AnimatePresence>
          {form.programmes.map((f, i) => {
            const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
            return (
              <motion.div key={f.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                className="rounded-2xl border overflow-hidden" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.4)' }}>
                <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: c.border, background: `${preset?.color || c.gold}10` }}>
                  <div className="flex flex-col">
                    <button onClick={() => move(f.id, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-20" style={{ color: c.gold }}><ArrowUp className="w-3 h-3" /></button>
                    <button onClick={() => move(f.id, 1)} disabled={i === form.programmes.length - 1} className="p-0.5 disabled:opacity-20" style={{ color: c.gold }}><ArrowDown className="w-3 h-3" /></button>
                  </div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${preset?.color || c.gold}25` }}>
                    {preset?.icon || '✨'}
                  </div>
                  <input value={f.name} onChange={e => updateFn(f.id, 'name', e.target.value)}
                    className="flex-1 bg-transparent font-semibold outline-none border-b border-transparent focus:border-current text-base min-w-0"
                    style={{ color: c.text }} />
                  <button onClick={() => removeFn(f.id)} className="p-2 rounded-lg hover:bg-red-500/10 transition" style={{ color: '#dc2626' }}><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="p-4 grid sm:grid-cols-2 gap-3">
                  <Field label="Date" required c={c}><Input c={c} type="date" value={f.date} onChange={e => updateFn(f.id, 'date', e.target.value)} /></Field>
                  <Field label="Time" c={c}><Input c={c} type="time" value={f.time} onChange={e => updateFn(f.id, 'time', e.target.value)} /></Field>
                  <div className="sm:col-span-2"><Field label="Venue Name" c={c}><Input c={c} value={f.venue} onChange={e => updateFn(f.id, 'venue', e.target.value)} placeholder="Taj Palace" /></Field></div>
                  <div className="sm:col-span-2"><Field label="Full Address" c={c}><Textarea c={c} rows={2} value={f.address} onChange={e => updateFn(f.id, 'address', e.target.value)} /></Field></div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Section>
  );
}

function StepExtras({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  return (
    <>
      <Section title="Closing Line" eyebrow="Step Five A" subtitle="The line at the bottom — about presents and blessings" c={c} icon={Star}>
        <div className="grid sm:grid-cols-2 gap-2">
          {CLOSING_TAGS.map(t => {
            const active = form.closingTag === t.id;
            return (
              <motion.button key={t.id} whileHover={{ x: 2 }} onClick={() => update('closingTag', t.id)}
                className="flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all"
                style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}10` : 'rgba(255,255,255,0.4)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{
                  background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`,
                  color: active ? 'white' : c.gold
                }}>
                  {t.id.toUpperCase()}
                </div>
                <span className="text-xs sm:text-sm flex-1" style={{ color: c.text }}>{t.label}</span>
                {active && <Check className="w-4 h-4 shrink-0" style={{ color: c.gold }} strokeWidth={3} />}
              </motion.button>
            );
          })}
        </div>
      </Section>

      <div className="mt-5">
        <Section title="Kids Welcome Line (Optional)" eyebrow="Step Five B" subtitle="Cute message from the little ones — pick one or skip" c={c} icon={Heart}>
          <div className="grid gap-2">
            <motion.button whileHover={{ x: 2 }} onClick={() => update('kidsLine', '')}
              className="flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all"
              style={{ borderColor: form.kidsLine === '' ? c.gold : c.border, background: form.kidsLine === '' ? `${c.gold}10` : 'rgba(255,255,255,0.4)' }}>
              <X className="w-4 h-4 shrink-0 opacity-50" />
              <span className="text-sm italic" style={{ color: c.subtext }}>Skip — no kids line</span>
            </motion.button>
            {KIDS_LINES.map(t => {
              const active = form.kidsLine === t.id;
              return (
                <motion.button key={t.id} whileHover={{ x: 2 }} onClick={() => update('kidsLine', t.id)}
                  className="flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all"
                  style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}10` : 'rgba(255,255,255,0.4)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{
                    background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : `${c.gold}15`,
                    color: active ? 'white' : c.gold
                  }}>{t.id}</div>
                  <span className="text-xs sm:text-sm flex-1 leading-snug" style={{ color: c.text }}>{t.label}</span>
                </motion.button>
              );
            })}
          </div>
        </Section>
      </div>

      <div className="mt-5">
        <Section title="With Best Compliments From" eyebrow="Step Five C" subtitle="Names of well-wishers and sponsors (optional)" c={c} icon={FileText}>
          <Textarea c={c} rows={3} value={form.withCompliments} onChange={e => update('withCompliments', e.target.value)}
            placeholder="e.g. Sharma & Gupta Families, Friends and Relatives..." />
        </Section>
      </div>
    </>
  );
}

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
      <Section title="Layout & Language" eyebrow="Step Six A" subtitle="The aesthetic foundation" c={c} icon={PaletteIcon}>
        <Field label="Language" c={c}>
          <div className="grid grid-cols-4 gap-2">
            {['English', 'Hindi', 'Marathi', 'Gujarati'].map(l => (
              <button key={l} onClick={() => update('design.language', l)}
                className="py-3 rounded-2xl border-2 text-xs font-bold transition-all"
                style={{
                  borderColor: form.design.language === l ? c.gold : c.border,
                  background: form.design.language === l ? `${c.gold}15` : 'rgba(255,255,255,0.3)',
                  color: form.design.language === l ? c.gold : c.text
                }}>{l}</button>
            ))}
          </div>
        </Field>
        <div className="mt-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] mb-2" style={{ color: c.subtext }}>Card Layout</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {LAYOUTS.map(l => {
              const Icon = l.icon;
              const active = form.design.layout === l.id;
              return (
                <motion.button key={l.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => update('design.layout', l.id)}
                  className="p-4 rounded-2xl border-2 text-left transition-all"
                  style={{
                    borderColor: active ? c.gold : c.border,
                    background: active ? `linear-gradient(135deg, ${c.gold}10, ${c.primary}08)` : 'rgba(255,255,255,0.3)',
                    boxShadow: active ? `0 10px 30px -10px ${c.gold}50` : 'none'
                  }}>
                  <Icon className="w-5 h-5 mb-2" style={{ color: active ? c.gold : c.subtext }} />
                  <div className="font-bold text-sm" style={{ color: c.text }}>{l.name}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: c.subtext }}>{l.desc}</div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </Section>

      <div className="mt-5">
        <Section title="Typography" eyebrow="Step Six B" subtitle="Pick fonts for heading, body, and script" c={c} icon={Type}>
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <SliderField label="Font Size" value={form.design.fontSize} min={12} max={22} step={1} unit="px" onChange={v => update('design.fontSize', v)} c={c} />
            <SliderField label="Letter Spacing" value={form.design.letterSpacing} min={0} max={4} step={0.1} unit="px" onChange={v => update('design.letterSpacing', v)} c={c} />
            <SliderField label="Line Height" value={form.design.lineHeight} min={1.2} max={2.2} step={0.05} unit="" onChange={v => update('design.lineHeight', v)} c={c} />
          </div>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.4)' }}>
            <div className="flex gap-1 p-1 m-3 rounded-full" style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
              {[{ k: 'heading', l: 'Heading' }, { k: 'body', l: 'Body' }, { k: 'script', l: 'Script' }].map(t => (
                <button key={t.k} onClick={() => setTarget(t.k)} className="flex-1 py-2 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: target === t.k ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                    color: target === t.k ? 'white' : c.subtext
                  }}>{t.l}</button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 px-3 pb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                <Input c={c} className="pl-10" placeholder="Search fonts..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select c={c} className="sm:w-44" value={cat} onChange={e => setCat(e.target.value)}>
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
                    style={{ borderColor: active ? c.gold : c.border, background: active ? `${c.gold}10` : 'rgba(255,255,255,0.5)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate" style={{ fontFamily: f.family, fontSize: '1.4em', color: c.text, lineHeight: 1.1 }}>{previewText}</div>
                      <div className="text-[10px] mt-1 flex items-center gap-2" style={{ color: c.subtext }}>
                        <span className="font-bold">{f.name}</span>
                        <span className="opacity-50">•</span>
                        <span>{f.cat}</span>
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
        <div className="text-xs font-mono font-bold" style={{ color: c.gold }}>{value}{unit}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(90deg, ${c.primary} 0%, ${c.gold} ${((value - min) / (max - min)) * 100}%, ${c.border} ${((value - min) / (max - min)) * 100}%)`,
          accentColor: c.gold
        }} />
    </div>
  );
}

function StepPreview({ form, update, c, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; dark: boolean }) {
  return (
    <Section title="Live Card Preview" eyebrow="Step Seven" subtitle="Exactly how the designer will see it" c={c} icon={Eye}>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[{ k: 'desktop', i: Monitor, l: 'Desktop' }, { k: 'mobile', i: Smartphone, l: 'Mobile' }].map(d => {
          const Icon = d.i; const active = form.preview.device === d.k;
          return (
            <button key={d.k} onClick={() => update('preview.device', d.k)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold transition-all"
              style={{
                borderColor: active ? 'transparent' : c.border,
                background: active ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                color: active ? 'white' : c.text
              }}>
              <Icon className="w-3.5 h-3.5" /> {d.l}
            </button>
          );
        })}
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold ml-auto" style={{ borderColor: c.border }}>
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>
      <div className={`mx-auto ${form.preview.device === 'mobile' ? 'max-w-sm' : 'max-w-2xl'}`}>
        <CardPreview form={form} c={c} dark={dark} />
      </div>
    </Section>
  );
}

function StepSubmit({ form, update, c, onSubmit, setStep, dark }: { form: FormState; update: (path: string, value: unknown) => void; c: Palette; onSubmit: () => void; setStep: (n: number) => void; dark: boolean }) {
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const sections = [
    { label: 'Family', step: 0, value: `${form.bride.name || '—'} & ${form.groom.name || '—'}`, icon: Heart },
    { label: 'Deities', step: 1, value: `${form.deities.length} selected`, icon: Star },
    { label: 'Template', step: 2, value: `#${template?.id} · ${template?.category}`, icon: BookOpen },
    { label: 'Programmes', step: 3, value: `${form.programmes.length} event${form.programmes.length !== 1 ? 's' : ''}`, icon: Calendar },
    { label: 'Closing', step: 4, value: closing?.label || '—', icon: FileText },
    { label: 'Design', step: 5, value: `${form.design.language} · ${form.design.layout}`, icon: Type },
  ];
  return (
    <Section title="Final Verification" eyebrow="Last Step" subtitle="Review carefully — this goes straight to the designer" c={c} icon={CheckCircle2}>
      <div className="space-y-2 mb-5">
        {sections.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-4 p-4 rounded-2xl border" style={{ borderColor: c.border, background: 'rgba(255,255,255,0.4)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${c.gold}15` }}>
                <Icon className="w-4 h-4" style={{ color: c.gold }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: c.subtext }}>{s.label}</div>
                <div className="text-sm font-semibold truncate" style={{ color: c.text }}>{s.value}</div>
              </div>
              <button onClick={() => setStep(s.step)} className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wider" style={{ color: c.gold, background: `${c.gold}15` }}>
                <Edit3 className="w-3 h-3" /> Edit
              </button>
            </div>
          );
        })}
      </div>
      <label className="flex items-start gap-3 p-5 rounded-2xl border-2 cursor-pointer transition" style={{ borderColor: form.meta.accepted ? c.gold : c.border, background: form.meta.accepted ? `${c.gold}10` : 'rgba(255,255,255,0.3)' }}>
        <input type="checkbox" checked={form.meta.accepted} onChange={e => update('meta.accepted', e.target.checked)} className="mt-1 w-4 h-4" style={{ accentColor: c.gold }} />
        <span className="text-sm leading-relaxed" style={{ color: c.text }}>
          I have verified all details carefully and confirm they are correct. The designer will use this content exactly as provided.
        </span>
      </label>
    </Section>
  );
}

function CardPreview({ form, c, dark, compact }: { form: FormState; c: Palette; dark: boolean; compact?: boolean }) {
  const layout = form.design.layout;
  const template = INVITATION_TEMPLATES.find(t => t.id === form.selectedTemplate);
  const closing = CLOSING_TAGS.find(t => t.id === form.closingTag);
  const kidsLine = KIDS_LINES.find(t => t.id === form.kidsLine);
  const relation = RELATION_WORDS.find(r => r.id === form.relationWord);

  const cardBg = layout === 'modern'
    ? 'linear-gradient(180deg, #FFFFFF 0%, #FAF6EC 100%)'
    : layout === 'traditional'
    ? 'linear-gradient(180deg, #FBF3DC 0%, #F0D9A0 100%)'
    : 'linear-gradient(180deg, #FBF6E2 0%, #EFD89A 50%, #FBF6E2 100%)';

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl relative" style={{ background: cardBg, color: '#2A0E14' }}>
      {layout !== 'modern' && (
        <>
          <div className="absolute inset-2.5 rounded-xl pointer-events-none" style={{ border: '2px double #8B6420', opacity: 0.5 }} />
          <div className="absolute inset-4 rounded-lg pointer-events-none" style={{ border: '1px solid #B8893D', opacity: 0.4 }} />
        </>
      )}
      {layout === 'modern' && (
        <div className="absolute inset-3 rounded-xl pointer-events-none" style={{ border: '1px solid #B8893D', opacity: 0.3 }} />
      )}

      <div className={`relative ${compact ? 'p-5 pt-6' : 'p-7 sm:p-10 pt-8'} text-center`}
        style={{ fontFamily: form.design.bodyFont, fontSize: `${form.design.fontSize}px`, letterSpacing: `${form.design.letterSpacing}px`, lineHeight: form.design.lineHeight }}>

        {form.deities.length > 0 && (
          <div className="mb-3 px-2 py-2 rounded-lg" style={{ background: 'rgba(123, 30, 46, 0.05)', border: '1px dashed rgba(184, 137, 61, 0.4)' }}>
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

        {(form.bride.motherName || form.bride.fatherName || form.groom.motherName || form.groom.fatherName) && (
          <div className="text-[11px] mb-2 font-medium" style={{ color: '#5A0F1C' }}>
            {form.hostType === 'parents' && (
              <div>Mrs. {form.bride.motherName || form.groom.motherName || '—'} &nbsp;&amp;&nbsp; Mr. {form.bride.fatherName || form.groom.fatherName || '—'}</div>
            )}
          </div>
        )}

        {template && (
          <p className="mb-5 italic opacity-85 max-w-md mx-auto whitespace-pre-line" style={{ fontSize: '0.88em', fontFamily: form.design.bodyFont, lineHeight: 1.6 }}>
            {fillTemplate(template.text, form).replace(/\{child\}/g, '').replace(/\n\n\n/g, '\n\n')}
          </p>
        )}

        <div className="my-5">
          <div className="text-[9px] font-bold mb-1.5" style={{ color: '#7B1E2E', letterSpacing: '0.45em' }}>BRIDE</div>
          <div className="font-medium leading-none mb-1" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.6em' : '2.4em', color: '#1A0608' }}>
            {form.bride.name || 'Bride Name'}
          </div>
          <div className="text-[10px] opacity-70 mt-1 font-medium">
            D/o {form.bride.fatherName || '—'} {form.bride.motherName && `& ${form.bride.motherName}`}
          </div>

          <div className="my-3 relative">
            <div style={{ fontFamily: form.design.scriptFont || "'Tangerine', cursive", fontSize: compact ? '2.2em' : '3em', color: '#B8893D', lineHeight: 0.9 }}>
              {relation?.label || 'Weds'}
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-12 h-px" style={{ background: '#B8893D' }} />
          </div>

          <div className="text-[9px] font-bold mb-1.5" style={{ color: '#7B1E2E', letterSpacing: '0.45em' }}>GROOM</div>
          <div className="font-medium leading-none mb-1" style={{ fontFamily: form.design.headingFont, fontSize: compact ? '1.6em' : '2.4em', color: '#1A0608' }}>
            {form.groom.name || 'Groom Name'}
          </div>
          <div className="text-[10px] opacity-70 mt-1 font-medium">
            S/o {form.groom.fatherName || '—'} {form.groom.motherName && `& ${form.groom.motherName}`}
          </div>
        </div>

        {form.programmes.length > 0 && form.programmes.some(p => p.date) && (
          <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(123, 30, 46, 0.2)' }}>
            <DecorativeDivider compact={compact} mini />
            <div className="text-[10px] font-bold mb-3 mt-2" style={{ color: '#7B1E2E', letterSpacing: '0.4em', fontFamily: form.design.headingFont }}>
              ◈ PROGRAMMES ◈
            </div>
            <div className="grid gap-2">
              {form.programmes.filter(f => f.date).map(f => {
                const preset = PROGRAMME_PRESETS.find(p => p.id === f.preset);
                return (
                  <div key={f.id} className="rounded-xl p-2.5 text-left" style={{ background: `linear-gradient(135deg, ${preset?.color || '#B8893D'}12, transparent)`, border: `1px solid ${preset?.color || '#B8893D'}25` }}>
                    <div className="flex items-start gap-2">
                      <div className="text-lg shrink-0">{preset?.icon || '✨'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold leading-tight" style={{ fontFamily: form.design.headingFont, fontSize: '1em', color: '#7B1E2E' }}>{f.name}</div>
                        <div className="text-[10px] mt-1 font-medium">
                          {f.date && new Date(f.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          {f.time && <span className="opacity-60"> · {f.time}</span>}
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
            <div className="opacity-70">{form.family.residenceAddress}</div>
          </div>
        )}

        {form.withCompliments && (
          <div className="mt-3 text-[10px]">
            <div className="font-bold mb-0.5" style={{ color: '#7B1E2E' }}>With Best Compliments From:</div>
            <div className="opacity-70">{form.withCompliments}</div>
          </div>
        )}

        {kidsLine && (
          <div className="mt-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(184, 137, 61, 0.1)' }}>
            <div className="text-[10px] italic" style={{ color: '#5A0F1C' }}>{kidsLine.label}</div>
          </div>
        )}

        {closing && (
          <div className="mt-4 text-[10px] font-bold tracking-[0.25em]" style={{ color: '#7B1E2E' }}>
            ✦ {closing.label.toUpperCase()} ✦
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <svg width="40" height="12" viewBox="0 0 40 12" fill="#B8893D" opacity="0.5">
            <circle cx="6" cy="6" r="2" />
            <circle cx="20" cy="6" r="3" />
            <circle cx="34" cy="6" r="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function DecorativeDivider({ compact, mini }: { compact?: boolean; mini?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-3">
      <div className={`h-px ${mini ? 'w-8' : compact ? 'w-12' : 'w-20'}`} style={{ background: 'linear-gradient(90deg, transparent, #B8893D)' }} />
      <svg width="12" height="12" viewBox="0 0 14 14" fill="#B8893D">
        <path d="M7 1 L 9 5 L 13 7 L 9 9 L 7 13 L 5 9 L 1 7 L 5 5 Z" />
      </svg>
      <div className={`h-px ${mini ? 'w-8' : compact ? 'w-12' : 'w-20'}`} style={{ background: 'linear-gradient(90deg, #B8893D, transparent)' }} />
    </div>
  );
}

function Success({ submitted, c, form, dark, onReset }: { submitted: SubmittedOrder; c: Palette; form: FormState; dark: boolean; onReset: () => void }) {
  const corel = generateCorelText(form);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="pt-12 max-w-2xl mx-auto">
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-28 h-28 rounded-full mx-auto mb-6 flex items-center justify-center relative"
        style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})`, boxShadow: `0 20px 60px -10px ${c.primary}60` }}>
        <Check className="w-14 h-14 text-white" strokeWidth={3} />
        <motion.div className="absolute inset-0 rounded-full" style={{ border: `2px solid ${c.gold}` }} animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2, repeat: Infinity }} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-center">
        <h1 className="text-5xl font-medium mb-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Beautifully <em style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.2em' }}>done</em>
        </h1>
        <p style={{ color: c.subtext }}>Your wedding matter is now with our designer.</p>
      </motion.div>
      <Divider c={c} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-3xl border p-7 shadow-2xl mt-6 text-center" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
        <div className="text-[10px] uppercase tracking-[0.3em] mb-2 font-bold" style={{ color: c.subtext }}>Order ID</div>
        <div className="text-4xl font-bold tracking-[0.15em] font-mono" style={{ color: c.gold }}>{submitted.orderId}</div>
        <div className="text-xs mt-2" style={{ color: c.subtext }}>Submitted at {submitted.at}</div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-3xl border p-5 mt-4" style={{ borderColor: c.border, background: c.surface }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>CorelDRAW Export</div>
          <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="text-[10px] whitespace-pre-wrap font-mono opacity-70 max-h-56 overflow-y-auto p-3 rounded-xl" style={{ background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)' }}>{corel}</pre>
      </motion.div>
      <button onClick={onReset} className="mt-4 mx-auto block px-5 py-2.5 rounded-full border text-sm font-semibold" style={{ borderColor: c.border }}>Submit Another</button>
    </div>
  );
}

function AdminDashboard({ c, dark }: { c: Palette; dark: boolean }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<typeof SAMPLE_ORDERS[0] | null>(null);

  const filtered = SAMPLE_ORDERS.filter(o =>
    (filter === 'All' || o.status === filter) &&
    (o.couple.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase()))
  );

  const stats = [
    { label: 'Total', value: SAMPLE_ORDERS.length, icon: Package, gradient: [c.gold, c.goldDeep] },
    { label: 'New', value: SAMPLE_ORDERS.filter(o => o.status === 'New').length, icon: Bell, gradient: [c.primary, '#9C2C77'] },
    { label: 'In Progress', value: SAMPLE_ORDERS.filter(o => o.status === 'In Progress').length, icon: Clock, gradient: ['#3B82F6', '#1D4ED8'] },
    { label: 'Completed', value: SAMPLE_ORDERS.filter(o => o.status === 'Completed').length, icon: CheckCircle2, gradient: ['#16A34A', '#15803D'] },
  ];

  return (
    <div className="pt-4 sm:pt-6">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1" style={{ color: c.gold }}>Designer Console</div>
          <h1 className="text-4xl sm:text-5xl font-medium leading-none" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Welcome back, <em style={{ fontFamily: "'Tangerine', cursive", color: c.gold, fontSize: '1.3em' }}>Suresh</em>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 rounded-full border relative" style={{ borderColor: c.border }}>
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: c.primary }} />
          </button>
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>S</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <motion.div key={s.label} whileHover={{ y: -4 }} className="rounded-3xl border p-5 shadow-xl relative overflow-hidden" style={{ borderColor: c.border, background: c.surface, backdropFilter: 'blur(20px)' }}>
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
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
            <Input c={c} className="pl-10" placeholder="Search couple or order ID..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {['All', 'New', 'Pending', 'In Progress', 'Completed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} className="px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                style={{
                  background: filter === f ? `linear-gradient(135deg, ${c.primary}, ${c.gold})` : 'transparent',
                  border: `1px solid ${filter === f ? 'transparent' : c.border}`,
                  color: filter === f ? 'white' : c.text
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filtered.map((o, i) => (
            <motion.div key={o.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              whileHover={{ x: 4 }} onClick={() => setSelected(o)}
              className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-lg"
              style={{ borderColor: c.border, background: 'rgba(255,255,255,0.4)' }}>
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${c.primary}20, ${c.gold}25)` }}>
                  <Heart className="w-5 h-5" style={{ color: c.gold }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-lg leading-none" style={{ fontFamily: "'Cormorant Garamond', serif", color: c.text }}>{o.couple}</div>
                    <div className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: `${c.gold}15`, color: c.gold }}>{o.id}</div>
                  </div>
                  <div className="text-[11px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: c.subtext }}>
                    <span>Template #{o.template}</span><span className="opacity-50">•</span>
                    <span>{o.layout}</span><span className="opacity-50">•</span>
                    <span>{o.font}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge s={o.status} c={c} />
                <ChevronRight className="w-4 h-4 opacity-40 hidden sm:block" />
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && <div className="text-center py-12 text-sm" style={{ color: c.subtext }}>No orders match your filters</div>}
        </div>
      </div>

      <AnimatePresence>
        {selected && <OrderModal order={selected} onClose={() => setSelected(null)} c={c} dark={dark} />}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ s, c }: { s: string; c: Palette }) {
  const map: Record<string, { bg: string; color: string; dot: string }> = {
    'New': { bg: `${c.gold}20`, color: c.gold, dot: c.gold },
    'Pending': { bg: `${c.primary}15`, color: c.primary, dot: c.primary },
    'In Progress': { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6', dot: '#3B82F6' },
    'Completed': { bg: 'rgba(22,163,74,0.15)', color: '#16A34A', dot: '#16A34A' },
  };
  const st = map[s] || map['New'];
  return (
    <span className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ background: st.bg, color: st.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} /> {s}
    </span>
  );
}

function OrderModal({ order, onClose, c, dark }: { order: typeof SAMPLE_ORDERS[0]; onClose: () => void; c: Palette; dark: boolean }) {
  const [couple1, couple2] = order.couple.split(' & ');
  const sample: FormState = {
    ...initialForm,
    bride: { name: couple1, salutation: 'Ms.', fatherName: 'Shri Rajesh', motherName: 'Smt Anjali', grandparents: '' },
    groom: { name: couple2 || '', salutation: 'Mr.', fatherName: 'Shri Mahesh', motherName: 'Smt Sunita', grandparents: '' },
    selectedTemplate: order.template,
    deities: ['ganesh', 'shiva', 'sai', 'om', 'krishna', 'lakshmi'],
    programmes: [
      { id: 1, preset: 'wedding', name: 'Wedding Ceremony', date: order.date, time: '19:00', venue: 'Taj Palace', address: 'New Delhi', notes: '' }
    ],
    design: { ...initialForm.design, layout: order.layout.toLowerCase(), headingFont: FONTS.find(f => f.name === order.font)?.family || initialForm.design.headingFont }
  };
  const corel = generateCorelText(sample);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(corel); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl border"
        style={{ background: dark ? palette.dark.bg1 : palette.light.bg1, borderColor: c.border }}>
        <div className="sticky top-0 z-10 backdrop-blur-xl p-5 sm:p-6 border-b flex items-center justify-between" style={{ borderColor: c.border, background: dark ? 'rgba(15,5,8,0.85)' : 'rgba(250,243,227,0.85)' }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: c.gold }}>{order.id}</div>
            <h2 className="text-3xl font-medium" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{order.couple}</h2>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-full border hover:scale-105 transition" style={{ borderColor: c.border }}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 sm:p-6 grid lg:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: c.gold }}>Card Preview</div>
            <CardPreview form={sample} c={c} dark={dark} compact />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: c.gold }}>CorelDRAW Export</div>
              <button onClick={copy} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy All'}
              </button>
            </div>
            <pre className="text-[10px] whitespace-pre-wrap font-mono p-4 rounded-2xl border max-h-[500px] overflow-y-auto" style={{ borderColor: c.border, background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.6)' }}>
              {corel}
            </pre>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border text-xs font-bold" style={{ borderColor: c.border }}>
                <Eye className="w-4 h-4" /> View Full
              </button>
              <button className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.gold})` }}>
                <CheckCircle2 className="w-4 h-4" /> Mark Complete
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
