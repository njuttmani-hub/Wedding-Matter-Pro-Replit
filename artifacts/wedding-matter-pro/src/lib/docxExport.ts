/* ─── Word (.docx) export of the card's matter ─────────────────────────────
   Lazy-loaded from WeddingApp (dynamic import), so the `docx` library stays
   out of the main bundle. This module only lays text out: every word arrives
   already worded by `cardMatter()` in WeddingApp, through the same helpers
   the card and the CorelDRAW text use (cardStrings / scriptText …), so the
   document can never word something differently from the card. */
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Packer, PageNumber,
  Paragraph, TextRun, convertMillimetersToTwip, type IParagraphOptions, type IRunOptions,
} from 'docx';
import type { UsedFont } from './fontsUsed';

/** One function as the combined programmes page lists it. */
export interface MatterProgramme {
  name: string;
  date: string;
  time: string;
  venue: string;
  address: string;
}

/** One function's own sheet, as the separate-sheet card prints it. */
export interface MatterSheet {
  name: string;
  /** The invitation sentence around the couple's names. */
  inviteBefore: string;
  inviteAfter: string;
  /** The translation's sentence has no {couple} slot, so the names follow it. */
  coupleLast: boolean;
  /** The couple in card order; either may be ''. */
  couple: [string, string];
  /** The joining word between the names on the sheet ("and", "आणि"). */
  and: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  noteLabel: string;
  note: string;
}

export interface MatterPerson {
  name: string;
  /** "D/o Shri … & Smt …" in the card's language, or ''. */
  childOf: string;
  grandparents: string;
}

/** Everything the document prints, already worded in the card's language.
 *  Built by cardMatter() in WeddingApp.tsx. */
export interface CardMatter {
  /** BCP-47 tag for the card's language ('en-IN', 'mr-IN' …). */
  locale: string;
  /** Latin-script card: italics and capitals as on the card. Indic scripts have neither. */
  latin: boolean;
  /** Installed family names, as Word looks them up. */
  fonts: { heading: string; body: string; script: string };
  deityNames: string;
  mantra: string;
  hostLine: string;
  template: string;
  above: MatterPerson;
  relation: string;
  below: MatterPerson;
  residence: { label: string; text: string } | null;
  compliments: { label: string; text: string } | null;
  kidsLine: string;
  closing: string;
  programmesHeading: string;
  /** 'separate' → `sheets`, one page each; 'combined' → `programmes` on one page. */
  mode: 'combined' | 'separate';
  programmes: MatterProgramme[];
  sheets: MatterSheet[];
  /** The card-details page, in English for the studio. */
  details: [label: string, value: string][];
  fontsUsed: UsedFont[];
  /** Footer line, e.g. "WMP-12 · Priya & Rahul". */
  footer: string;
}

const INK = '1A1A1A', SOFT = '555555', GOLD = 'B07A22';

export async function buildMatterDocx(m: CardMatter): Promise<Blob> {
  // A run in one of the card's fonts. Word picks a font slot per character:
  // Latin letters use ascii/hAnsi, Indic letters are "complex script" and use
  // the cs slot (and szCs/bCs/iCs for their size and style), so all slots get
  // the same family or Devanagari would silently fall back to Mangal/Nirmala.
  // The language goes on `bidi` too — despite the name it is Word's language
  // for complex-script text, which drives its shaping and proofing.
  const card = (text: string, font: string, half: number, opts: Partial<IRunOptions> = {}) => new TextRun({
    text,
    font: { ascii: font, hAnsi: font, cs: font, eastAsia: font },
    size: half,
    sizeComplexScript: half,
    color: INK,
    language: m.latin ? { value: m.locale } : { value: m.locale, bidirectional: m.locale },
    ...opts,
  });
  // Studio-facing text (the details page, the deity note): plain English.
  const plain = (text: string, opts: Partial<IRunOptions> = {}) =>
    new TextRun({ text, font: 'Calibri', size: 21, color: INK, language: { value: 'en-IN' }, ...opts });

  // Line breaks inside a value (template paragraphs, addresses) become soft
  // breaks within one paragraph, as on the card.
  const lines = (text: string, run: (t: string, o?: Partial<IRunOptions>) => TextRun) =>
    text.split('\n').map((t, i) => run(t, i ? { break: 1 } : {}));

  // Pages are collected as paragraph options and built at the end, so the first
  // paragraph of each page can take pageBreakBefore (a Paragraph is immutable).
  const centred = (children: (TextRun | ExternalHyperlink)[], before = 0, after = 120, extra: IParagraphOptions = {}): IParagraphOptions =>
    ({ alignment: AlignmentType.CENTER, spacing: { before, after }, children, ...extra });

  const { heading: H, body: B, script: S } = m.fonts;
  const italic = m.latin ? { italics: true } : {};

  /* ── Page 1 · Invitation ── */
  const page1: IParagraphOptions[] = [];
  if (m.deityNames) page1.push(centred([plain(`[Deity artwork: ${m.deityNames}]`, { color: SOFT, size: 18, italics: true })], 0, 60));
  // The mantra is Sanskrit in Devanagari whatever the card's language.
  if (m.mantra) page1.push(centred([card(m.mantra, H, 24, { bold: true, language: { value: 'sa-IN', bidirectional: 'sa-IN' } })], 0, 200));
  if (m.hostLine) page1.push(centred([card(m.hostLine, B, 23, { bold: true })], 0, 160));
  if (m.template) page1.push(centred(lines(m.template, (t, o) => card(t, B, 23, { ...italic, ...o })), 0, 320, { spacing: { before: 0, after: 320, line: 330 } }));

  const person = (p: MatterPerson) => {
    page1.push(centred([card(p.name || '—', H, 56)], 0, 40));
    if (p.childOf) page1.push(centred([card(p.childOf, B, 21, { bold: true, color: SOFT })], 0, 20));
    if (p.grandparents) page1.push(centred([card(p.grandparents, B, 20, { color: SOFT })], 0, 20));
  };
  person(m.above);
  page1.push(centred([card(m.relation, S, 52)], 240, 0));
  page1.push(centred([], 0, 240, { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 1 } }, indent: { left: convertMillimetersToTwip(72), right: convertMillimetersToTwip(72) } }));
  person(m.below);

  const labelled = (x: { label: string; text: string }, before: number) => {
    page1.push(centred([card(x.label, B, 21, { bold: true })], before, 20));
    page1.push(centred(lines(x.text, (t, o) => card(t, B, 21, { color: SOFT, ...o })), 0, 80));
  };
  if (m.residence) labelled(m.residence, 360);
  if (m.compliments) labelled(m.compliments, 200);
  if (m.kidsLine) page1.push(centred([card(m.kidsLine, B, 21, { ...italic })], 240, 80, { shading: { fill: 'F6EBD6', type: 'clear', color: 'auto' } }));
  if (m.closing) page1.push(centred([card(`✦ ${m.latin ? m.closing.toUpperCase() : m.closing} ✦`, B, 21, { bold: true, ...(m.latin ? { characterSpacing: 40 } : {}) })], 240, 0));

  /* ── Programmes ── */
  const progPages: IParagraphOptions[][] = [];
  if (m.mode === 'separate') {
    for (const s of m.sheets) {
      const p: IParagraphOptions[] = [];
      p.push(centred([card(s.name, H, 52)], 600, 120, { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 6 } } }));
      if (s.inviteBefore) p.push(centred([card(s.inviteBefore, B, 24, italic)], 240, 120));
      const couple = () => {
        const [a, b] = s.couple;
        if (a) p.push(centred([card(a, H, 44)], 120, 0));
        if (a && b) p.push(centred([card(s.and, S, 40, { color: GOLD })], 0, 0));
        if (b) p.push(centred([card(b, H, 44)], 0, 120));
      };
      if (!s.coupleLast) couple();
      if (s.inviteAfter) p.push(centred([card(s.inviteAfter, B, 24, italic)], 120, 240));
      if (s.coupleLast) couple();
      if (s.date) p.push(centred([card(m.latin ? s.date.toUpperCase() : s.date, B, 24, { bold: true, ...(m.latin ? { characterSpacing: 20 } : {}) })], 360, 40));
      if (s.time) p.push(centred([card(s.time, B, 23, { color: SOFT })], 0, 120));
      if (s.venue) p.push(centred([card(s.venue, H, 30, { bold: true })], 240, 40));
      if (s.address) p.push(centred(lines(s.address, (t, o) => card(t, B, 21, { color: SOFT, ...o })), 0, 120));
      if (s.note) {
        p.push(centred([card(s.noteLabel, B, 17, { bold: true, color: GOLD, ...(m.latin ? { allCaps: true, characterSpacing: 40 } : {}) })], 360, 20));
        p.push(centred(lines(s.note, (t, o) => card(t, B, 22, o)), 0, 0));
      }
      progPages.push(p);
    }
  } else if (m.programmes.length) {
    const p: IParagraphOptions[] = [];
    p.push(centred([card(`◈ ${m.latin ? m.programmesHeading.toUpperCase() : m.programmesHeading} ◈`, H, 24, { bold: true, ...(m.latin ? { characterSpacing: 60 } : {}) })], 0, 360));
    for (const f of m.programmes) {
      p.push(centred([card(f.name, H, 30, { bold: true })], 240, 40));
      p.push(centred([card(f.date, B, 22, { bold: true }), ...(f.time ? [card(`  ·  ${f.time}`, B, 22, { color: SOFT })] : [])], 0, 20));
      if (f.venue) p.push(centred([card(f.venue, B, 22, { bold: true })], 0, 20));
      if (f.address) p.push(centred(lines(f.address, (t, o) => card(t, B, 21, { color: SOFT, ...o })), 0, 120));
    }
    progPages.push(p);
  }

  /* ── Card details (English, for the studio) ── */
  const details: IParagraphOptions[] = [
    ({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 4 } },
      children: [plain('Card details', { bold: true, size: 32 })] }),
    ...m.details.map(([k, v]) => ({ spacing: { after: 60 }, children: [plain(`${k}: `, { bold: true }), plain(v)] })),
    ({ spacing: { before: 280, after: 80 }, children: [plain('Fonts used', { bold: true, size: 26 })] }),
    ...m.fontsUsed.map((f): IParagraphOptions => ({
      spacing: { after: 60 }, bullet: { level: 0 },
      children: [
        plain(f.name, { bold: true }),
        plain(` — ${f.roles.join(', ')} — `),
        new ExternalHyperlink({ link: f.url, children: [plain('free download', { color: '0563C1', underline: {} })] }),
      ],
    })),
    ({ spacing: { before: 120 }, children: [plain(
      'Word and CorelDRAW only show these fonts if they are installed on this computer; until then they substitute another font. All are free from Google Fonts.',
      { italics: true, color: SOFT, size: 19 })] }),
  ];

  // Each card page starts a new Word page; the details page always does.
  const pages = [page1, ...progPages, details];
  // An empty page (no dated functions) is skipped rather than left blank.
  const children = pages.filter(p => p.length).flatMap((p, i) =>
    p.map((o, j) => new Paragraph(i > 0 && j === 0 ? { ...o, pageBreakBefore: true } : o)));

  const doc = new Document({
    creator: 'Wedding Matter Pro',
    title: m.footer ? `Card matter — ${m.footer}` : 'Card matter',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      properties: {
        // A4 portrait: this is a matter document for reading and copying the
        // wording, not the artwork; the card's real size is on the details page.
        page: {
          size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
          margin: { top: convertMillimetersToTwip(22), bottom: convertMillimetersToTwip(22), left: convertMillimetersToTwip(22), right: convertMillimetersToTwip(22) },
        },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          plain(`${m.footer ? `${m.footer} · ` : ''}Page `, { size: 16, color: SOFT }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: SOFT }),
        ] })] }),
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

