/* ─── SVG export for CorelDRAW ────────────────────────────────────────────────
   Turns each rendered card page (`.wmp-card-page`) into a standalone SVG file
   at the card's real physical size, for designers who open it in CorelDRAW 14
   (X4, 2008). Two variants:

   - 'editable': every line of text is a real <text> element, using the font's
     plain family name, so the designer can retype it. Needs the fonts
     installed in Windows (see fontsUsed()).
   - 'outlined': the same, but every line of text is converted to vector paths,
     shaped by HarfBuzz (lib/svgOutline.ts, lazy-loaded) so Indian scripts get
     their conjuncts and matras right. Looks exact with nothing installed.

   Everything is measured from the live DOM, where the browser has already laid
   the card out. On screen each sheet sits inside a view-scale transform
   (.wmp-sheet-scaler); all positions are divided back into the sheet's own
   unscaled coordinate space (96 px per inch). The matter's own fit scale
   (fitSheetContent) is part of the design, so it is kept.

   CorelDRAW X4 reads only a conservative slice of SVG 1.1, so the output
   sticks to it: presentation attributes only (no <style>, class or style=),
   hex colours with separate fill-/stroke-opacity (no rgba()), matrix()/
   translate() transforms only, no <use>, mask, filter, clipPath or
   foreignObject, no nested <svg> (inline icons become <g transform=matrix>),
   and gradients pre-composited to opaque stops over the card's paper. */

export type SvgVariant = 'editable' | 'outlined';
export interface SvgExportResult { files: File[]; warnings: string[] }

const PX_PER_IN = 96;

/* ── Scene model: everything on a page, in page-local px ──────────────────── */

export interface TextItem {
  kind: 'text';
  text: string;
  /** The CSS font-family list, unquoted, in order ("Cormorant Garamond", "serif"). */
  families: string[];
  /** The single family the editable export names (the one the browser drew this line with). */
  editFamily?: string;
  size: number;           // px, after every design scale
  weight: number;
  italic: boolean;
  letterSpacing: number;  // px, after scale
  color: string;          // #rrggbb
  opacity: number;        // 0..1, colour alpha × inherited opacity
  /** Measured line box (left/right edges) and the baseline. */
  left: number; right: number; baseline: number;
  anchor: 'start' | 'middle' | 'end';
  lang: string;
}

/** An emoji in the text, drawn as Twemoji artwork (CorelDRAW X4 has no colour fonts). */
interface EmojiItem { kind: 'emoji'; glyph: string; size: number; cx: number; baseline: number; opacity: number; fallback: TextItem }

type Item =
  | TextItem
  | EmojiItem
  | { kind: 'raw'; svg: string };

/** The shape elements copied from inline SVG, with their geometry attributes. */
const GEOMETRY: Record<string, string[]> = {
  path: ['d'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points'],
};

// Characters the browser draws as colour emoji: emoji-presentation ones, or
// any followed by the emoji variation selector. (✦ ◈ ॐ stay ordinary text.)
const EMOJI = /\p{Emoji_Presentation}|️/u;

/* ── Small helpers ────────────────────────────────────────────────────────── */

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Rgba { r: number; g: number; b: number; a: number }

/** Parses the colours getComputedStyle returns: rgb(), rgba(), color(srgb …), #hex, transparent. */
function parseColor(css: string | null | undefined): Rgba | null {
  if (!css) return null;
  const s = css.trim();
  if (s === 'transparent' || s === 'none' || s === '') return null;
  let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/i);
  if (m) {
    let a = m[4] === undefined ? 1 : Number(m[4]);
    if (m[5]) a /= 100;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }
  m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i);
  if (m) return { r: Number(m[1]) * 255, g: Number(m[2]) * 255, b: Number(m[3]) * 255, a: m[4] === undefined ? 1 : Number(m[4]) };
  m = s.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(ch => ch + ch).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  return null;
}

const hex = (c: Rgba) => '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const over = (c: Rgba, alpha: number, bg: Rgba): Rgba => ({
  r: c.r * alpha + bg.r * (1 - alpha), g: c.g * alpha + bg.g * (1 - alpha), b: c.b * alpha + bg.b * (1 - alpha), a: 1,
});

/** Splits on commas that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const px = (v: string | null | undefined) => parseFloat(v || '0') || 0;

/** Plain family names from a CSS font-family list. */
export function familyList(css: string): string[] {
  return splitTop(css).map(f => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

/** The uniform scale a CSS transform applies (rotation-free in this app). */
function transformScale(t: string): number {
  if (!t || t === 'none') return 1;
  try { const m = new DOMMatrix(t); return Math.sqrt(m.a * m.a + m.b * m.b) || 1; } catch { return 1; }
}

/* ── Measuring one page ───────────────────────────────────────────────────── */

class PageScene {
  items: Item[] = [];
  warnings = new Set<string>();
  /** Card fonts that lacked the letters of the language they were used for. */
  missingScript = new Set<string>();
  private ids = 0;
  readonly origin: DOMRect;
  readonly viewScale: number;
  readonly paper: Rgba;
  private scaleCache = new Map<Element, number>();
  private segCache = new Map<string, { word: Intl.Segmenter; grapheme: Intl.Segmenter }>();
  private ctx = document.createElement('canvas').getContext('2d')!;

  constructor(readonly page: HTMLElement, readonly pageIndex: number) {
    this.origin = page.getBoundingClientRect();
    this.viewScale = this.origin.width / (page.offsetWidth || 1) || 1;
    this.paper = parseColor(getComputedStyle(page).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 };
    if (this.paper.a < 1) this.paper = over(this.paper, this.paper.a, { r: 255, g: 255, b: 255, a: 1 });
  }

  id(prefix: string) { return `wmp${this.pageIndex + 1}-${prefix}${++this.ids}`; }

  /** Viewport point → page-local px. */
  lx(x: number) { return (x - this.origin.left) / this.viewScale; }
  ly(y: number) { return (y - this.origin.top) / this.viewScale; }

  /** Product of the design transforms between `el` and the page (the matter's fit scale). */
  scaleOf(el: Element): number {
    if (el === this.page || !el.parentElement) return 1;
    const hit = this.scaleCache.get(el);
    if (hit !== undefined) return hit;
    const s = transformScale(getComputedStyle(el).transform) * this.scaleOf(el.parentElement);
    this.scaleCache.set(el, s);
    return s;
  }

  segmenters(lang: string) {
    let s = this.segCache.get(lang);
    if (!s) {
      s = { word: new Intl.Segmenter(lang || undefined, { granularity: 'word' }), grapheme: new Intl.Segmenter(lang || undefined, { granularity: 'grapheme' }) };
      this.segCache.set(lang, s);
    }
    return s;
  }

  walk(el: Element, opacity: number) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const op = opacity * (el === this.page ? 1 : Number(cs.opacity || 1));
    if (op <= 0.001) return;
    if (el instanceof SVGSVGElement) { this.svg(el, op); return; }
    if (el instanceof HTMLImageElement || el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) {
      this.warnings.add('A picture on the card could not be included in the SVG.');
      return;
    }
    if (cs.visibility !== 'hidden' && el instanceof HTMLElement) this.box(el, cs, op);
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) this.walk(child as Element, op);
      else if (child.nodeType === Node.TEXT_NODE && cs.visibility !== 'hidden') this.text(child as Text, el, cs, op);
    }
  }

  /* Backgrounds, borders and inset rings of an HTML box. */
  private box(el: HTMLElement, cs: CSSStyleDeclaration, op: number) {
    const r = el.getBoundingClientRect();
    if (r.width < 0.01 || r.height < 0.01) return;
    const x = this.lx(r.left), y = this.ly(r.top), w = r.width / this.viewScale, h = r.height / this.viewScale;
    const s = this.scaleOf(el);
    const radius = Math.min(px(cs.borderTopLeftRadius) * s, w / 2, h / 2);
    const isPage = el === this.page;

    // The paper itself: a plain full-bleed rectangle. Its rounded corners are
    // screen styling (and white on white once printed), so they're dropped.
    const bg = parseColor(cs.backgroundColor);
    if (bg && bg.a * op > 0.001) {
      if (isPage) this.items.push({ kind: 'raw', svg: `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="${hex(bg)}"/>` });
      else this.items.push({ kind: 'raw', svg: this.shape(x, y, w, h, radius, `fill="${hex(bg)}"${opac('fill', bg.a * op)}`) });
    }
    if (cs.backgroundImage && cs.backgroundImage !== 'none') this.gradient(cs.backgroundImage, x, y, w, h, radius, op);

    // Borders.
    const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map(side => ({
      w: px(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) * s,
      style: cs.getPropertyValue(`border-${side.toLowerCase()}-style`),
      color: parseColor(cs.getPropertyValue(`border-${side.toLowerCase()}-color`)),
    }));
    const visible = sides.filter(b => b.w > 0 && b.style !== 'none' && b.style !== 'hidden' && b.color && b.color.a > 0);
    if (visible.length) {
      const same = visible.length === 4 && sides.every(b => Math.abs(b.w - sides[0].w) < 0.01 && b.style === sides[0].style && b.color && sides[0].color && hex(b.color) === hex(sides[0].color) && b.color.a === sides[0].color.a);
      if (same) {
        const b = sides[0], c = b.color!;
        const paint = (bw: number, inset: number, extra = '') =>
          this.shape(x + inset + bw / 2, y + inset + bw / 2, w - 2 * inset - bw, h - 2 * inset - bw, Math.max(0, radius - inset - bw / 2),
            `fill="none" stroke="${hex(c)}" stroke-width="${n(bw)}"${opac('stroke', c.a * op)}${extra}`);
        // Chrome draws a `double` border narrower than 3px as a single line.
        if (b.style === 'double' && b.w / s >= 3) {
          const third = b.w / 3;
          this.items.push({ kind: 'raw', svg: paint(third, 0) }, { kind: 'raw', svg: paint(third, 2 * third) });
        } else {
          const dash = b.style === 'dashed' ? ` stroke-dasharray="${n(b.w * 3)},${n(b.w * 3)}"` : b.style === 'dotted' ? ` stroke-dasharray="${n(b.w)},${n(b.w)}"` : '';
          this.items.push({ kind: 'raw', svg: paint(b.w, 0, dash) });
        }
      } else {
        // Individual sides as thin filled rectangles (corners left square).
        sides.forEach((b, i) => {
          if (!(b.w > 0 && b.style !== 'none' && b.style !== 'hidden' && b.color && b.color.a > 0)) return;
          const [rx, ry, rw, rh] = i === 0 ? [x, y, w, b.w] : i === 1 ? [x + w - b.w, y, b.w, h] : i === 2 ? [x, y + h - b.w, w, b.w] : [x, y, b.w, h];
          this.items.push({ kind: 'raw', svg: `<rect x="${n(rx)}" y="${n(ry)}" width="${n(rw)}" height="${n(rh)}" fill="${hex(b.color)}"${opac('fill', b.color.a * op)}/>` });
        });
      }
    }

    // Inset hairline rings drawn with box-shadow (`inset 0 0 0 1px colour`).
    // Outer shadows are the screen's "lifted paper" effect, not artwork.
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      for (const sh of splitTop(cs.boxShadow)) {
        if (!/\binset\b/.test(sh)) continue;
        const color = parseColor(sh.match(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/i)?.[1]);
        const lens = sh.replace(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/i, '').match(/-?[\d.]+px/g)?.map(v => parseFloat(v)) ?? [];
        const [ox = 0, oy = 0, blur = 0, spread = 0] = lens;
        if (!color || ox || oy || blur || spread <= 0) { if (color && (blur || ox || oy)) this.warnings.add('Soft shadows are not included in the SVG.'); continue; }
        const sw = spread * s;
        this.items.push({ kind: 'raw', svg: this.shape(x + sw / 2, y + sw / 2, w - sw, h - sw, Math.max(0, radius - sw / 2), `fill="none" stroke="${hex(color)}" stroke-width="${n(sw)}"${opac('stroke', color.a * op)}`) });
      }
    }
  }

  /** A rect, or an ellipse when the corners make it a circle/pill-free dot. */
  private shape(x: number, y: number, w: number, h: number, radius: number, paint: string) {
    if (w <= 0 || h <= 0) return '';
    if (radius >= Math.min(w, h) / 2 - 0.01 && Math.abs(w - h) < 0.01) {
      return `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${paint}/>`;
    }
    const rr = radius > 0.01 ? ` rx="${n(radius)}" ry="${n(radius)}"` : '';
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rr} ${paint}/>`;
  }

  /* linear-gradient() → <linearGradient> with opaque stops pre-composited over
     the paper, so an importer that ignores stop-opacity still gets the look. */
  private gradient(css: string, x: number, y: number, w: number, h: number, radius: number, op: number) {
    const m = css.match(/^linear-gradient\((.*)\)$/s);
    if (!m) { this.warnings.add('A background pattern was simplified out of the SVG.'); return; }
    const parts = splitTop(m[1]);
    let angle = 180;
    if (/^-?[\d.]+(deg|turn|rad)$/.test(parts[0]) || parts[0].startsWith('to ')) {
      const d = parts.shift()!;
      if (d.endsWith('deg')) angle = parseFloat(d);
      else if (d.endsWith('turn')) angle = parseFloat(d) * 360;
      else if (d.endsWith('rad')) angle = (parseFloat(d) * 180) / Math.PI;
      else angle = ({ 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 } as Record<string, number>)[d] ?? 180;
    }
    const stops = parts.map(p => {
      const cm = p.match(/^(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}|transparent|[a-z]+)\s*(-?[\d.]+%)?/i);
      return { color: parseColor(cm?.[1]) ?? { r: 0, g: 0, b: 0, a: 0 }, pos: cm?.[2] ? parseFloat(cm[2]) / 100 : NaN };
    });
    if (stops.length < 2) return;
    if (isNaN(stops[0].pos)) stops[0].pos = 0;
    if (isNaN(stops[stops.length - 1].pos)) stops[stops.length - 1].pos = 1;
    for (let i = 1; i < stops.length - 1; i++) {
      if (!isNaN(stops[i].pos)) continue;
      let j = i; while (isNaN(stops[j].pos)) j++;
      const a = stops[i - 1].pos, b = stops[j].pos;
      for (let k = i; k < j; k++) stops[k].pos = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    }
    const rad = (angle * Math.PI) / 180;
    const dx = Math.sin(rad), dy = -Math.cos(rad);
    const id = this.id('grad');
    const stopXml = stops.map(st => `<stop offset="${n(Math.max(0, Math.min(1, st.pos)))}" stop-color="${hex(over(st.color, st.color.a * op, this.paper))}"/>`).join('');
    this.items.push({
      kind: 'raw',
      svg: `<defs><linearGradient id="${id}" gradientUnits="objectBoundingBox" x1="${n(0.5 - dx / 2)}" y1="${n(0.5 - dy / 2)}" x2="${n(0.5 + dx / 2)}" y2="${n(0.5 + dy / 2)}">${stopXml}</linearGradient></defs>`
        + this.shape(x, y, w, h, radius, `fill="url(#${id})"`),
    });
  }

  /* Inline <svg> (deity icons, motifs, corner ornaments, dividers) → a <g>
     carrying the full matrix from its user space to the page, with every
     element's computed paint written out as attributes. */
  private svg(svg: SVGSVGElement, op: number) {
    const ctm = svg.getScreenCTM();
    const r = svg.getBoundingClientRect();
    if (!ctm || r.width < 0.01 || r.height < 0.01) return;
    const k = 1 / this.viewScale;
    const a = ctm.a * k, b = ctm.b * k, c = ctm.c * k, d = ctm.d * k;
    const e = (ctm.e - this.origin.left) * k, f = (ctm.f - this.origin.top) * k;
    const body = Array.from(svg.children).map(ch => this.svgNode(ch, op)).join('');
    if (body) this.items.push({ kind: 'raw', svg: `<g transform="matrix(${n6(a)} ${n6(b)} ${n6(c)} ${n6(d)} ${n(e)} ${n(f)})">${body}</g>` });
  }

  private svgNode(el: Element, inherited: number): string {
    const tag = el.tagName.toLowerCase();
    if (['title', 'desc', 'metadata', 'style', 'script'].includes(tag)) return '';
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return '';
    const op = inherited * Number(cs.opacity || 1);
    if (op <= 0.001) return '';
    let transform = el.getAttribute('transform') ?? '';
    if (transform && /skew/i.test(transform)) {
      const m = (el as SVGGraphicsElement).transform?.baseVal?.consolidate()?.matrix;
      transform = m ? `matrix(${n6(m.a)} ${n6(m.b)} ${n6(m.c)} ${n6(m.d)} ${n(m.e)} ${n(m.f)})` : '';
    }
    const tAttr = transform ? ` transform="${esc(transform)}"` : '';
    if (tag === 'g' || tag === 'a') {
      const kids = Array.from(el.children).map(ch => this.svgNode(ch, op)).join('');
      return kids ? `<g${tAttr}>${kids}</g>` : '';
    }
    if (tag === 'svg') {
      this.warnings.add('A nested drawing inside an icon was skipped.');
      return '';
    }
    const geom = GEOMETRY[tag];
    if (!geom) {
      if (tag !== 'defs') this.warnings.add(`An unsupported drawing element (<${tag}>) was skipped.`);
      return '';
    }
    let attrs = '';
    for (const g of geom) {
      const v = el.getAttribute(g);
      if (v !== null && v !== '') attrs += ` ${g}="${esc(v)}"`;
    }
    return `<${tag}${attrs}${tAttr}${this.paint(cs, op)}/>`;
  }

  /** Computed fill/stroke as plain SVG 1.1 presentation attributes. */
  private paint(cs: CSSStyleDeclaration, op: number): string {
    let out = '';
    const fillRaw = cs.fill;
    const fill = parseColor(fillRaw);
    if (fillRaw.startsWith('url(')) {
      this.warnings.add('A gradient inside an icon was simplified to a solid colour.');
      out += ` fill="#C0892E"`;
    } else if (!fill || fill.a === 0) out += ' fill="none"';
    else {
      out += ` fill="${hex(fill)}"` + opac('fill', fill.a * Number(cs.fillOpacity || 1) * op);
      if (cs.fillRule === 'evenodd') out += ' fill-rule="evenodd"';
    }
    const stroke = parseColor(cs.stroke);
    const sw = px(cs.strokeWidth);
    if (stroke && stroke.a > 0 && sw > 0) {
      out += ` stroke="${hex(stroke)}" stroke-width="${n(sw)}"` + opac('stroke', stroke.a * Number(cs.strokeOpacity || 1) * op);
      if (cs.strokeLinecap && cs.strokeLinecap !== 'butt') out += ` stroke-linecap="${cs.strokeLinecap}"`;
      if (cs.strokeLinejoin && cs.strokeLinejoin !== 'miter') out += ` stroke-linejoin="${cs.strokeLinejoin}"`;
      const ml = Number(cs.strokeMiterlimit);
      if (ml && ml !== 4) out += ` stroke-miterlimit="${n(ml)}"`;
      if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
        const dashes = cs.strokeDasharray.split(/[\s,]+/).map(px);
        // A zero-length dash with round caps draws dots; some importers drop
        // zero-length segments entirely, so give each dot a hair of length.
        out += ` stroke-dasharray="${dashes.map(v => n(v === 0 ? 0.01 : v)).join(',')}"`;
        const off = px(cs.strokeDashoffset);
        if (off) out += ` stroke-dashoffset="${n(off)}"`;
      }
    }
    return out;
  }

  /** editableFamily(), noting when the card's own font lacks the script. */
  private editFamily(families: string[], text: string) {
    const fam = editableFamily(families, text);
    if (!families.includes(fam)) this.missingScript.add(families[0] ?? '');
    return fam;
  }

  /* Text: one item per laid-out line of each text node. */
  private text(node: Text, parent: Element, cs: CSSStyleDeclaration, op: number) {
    const data = node.data;
    if (!data.trim()) return;
    const color = parseColor(cs.color);
    if (!color || color.a * op <= 0.001) return;
    const lang = (parent.closest('[lang]')?.getAttribute('lang')) || document.documentElement.lang || 'en';
    const seg = this.segmenters(lang);
    const range = document.createRange();

    // Pieces: words (and the spaces between them), each with its line box.
    interface Piece { start: number; end: number; space: boolean; emoji?: boolean; top: number; bottom: number; left: number; right: number }
    const pieces: Piece[] = [];
    const rectOf = (start: number, end: number) => {
      range.setStart(node, start); range.setEnd(node, end);
      return Array.from(range.getClientRects()).filter(r => r.width > 0 || r.height > 0);
    };
    for (const w of seg.word.segment(data)) {
      const start = w.index, end = w.index + w.segment.length;
      const space = !w.segment.trim();
      const rects = rectOf(start, end);
      if (!rects.length) continue;
      const tops = new Set(rects.map(r => Math.round(r.top)));
      if (EMOJI.test(w.segment)) {
        // Emoji are drawn as artwork, so each one needs its own box.
        for (const g of seg.grapheme.segment(w.segment)) {
          const gs = start + g.index, ge = gs + g.segment.length;
          const gr = rectOf(gs, ge)[0];
          if (gr) pieces.push({ start: gs, end: ge, space: !g.segment.trim(), emoji: EMOJI.test(g.segment), top: gr.top, bottom: gr.bottom, left: gr.left, right: gr.right });
        }
      } else if (tops.size === 1 || space) {
        const r = rects[0];
        pieces.push({ start, end, space, top: r.top, bottom: r.bottom, left: Math.min(...rects.map(q => q.left)), right: Math.max(...rects.map(q => q.right)) });
      } else {
        // A word broken across lines: fall back to grapheme pieces.
        for (const g of seg.grapheme.segment(w.segment)) {
          const gs = start + g.index, ge = gs + g.segment.length;
          const gr = rectOf(gs, ge)[0];
          if (gr) pieces.push({ start: gs, end: ge, space: false, top: gr.top, bottom: gr.bottom, left: gr.left, right: gr.right });
        }
      }
    }

    // Group into lines by vertical position.
    const lines: Piece[][] = [];
    for (const p of pieces) {
      const line = lines[lines.length - 1];
      const ref = line?.find(q => !q.space) ?? line?.[0];
      if (line && ref && Math.abs(p.top - ref.top) < Math.max(2, (ref.bottom - ref.top) * 0.5)) line.push(p);
      else lines.push([p]);
    }

    const s = this.scaleOf(parent);
    const fontSize = px(cs.fontSize);
    const weight = Number(cs.fontWeight) || (cs.fontWeight === 'bold' ? 700 : 400);
    const italic = cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique');
    const ls = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing);
    const families = familyList(cs.fontFamily);
    this.ctx.font = `${italic ? 'italic ' : ''}${weight} ${fontSize}px ${cs.fontFamily}`;
    const fm = this.ctx.measureText('Hxग');
    const asc = fm.fontBoundingBoxAscent, desc = fm.fontBoundingBoxDescent;
    const align = cs.textAlign;
    const anchor: TextItem['anchor'] = align === 'center' || align === '-webkit-center' ? 'middle' : (align === 'right' || align === 'end') ? 'end' : 'start';
    const collapse = !/^pre/.test(cs.whiteSpace) && cs.whiteSpaceCollapse !== 'preserve';
    if (cs.fontVariantCaps && cs.fontVariantCaps !== 'normal') this.warnings.add('Small capitals were exported as ordinary letters.');

    // Each line splits further around emoji, which become artwork items.
    const chunks: Piece[][] = [];
    for (const line of lines) {
      let cur: Piece[] = [];
      for (const p of line) {
        if (p.emoji) {
          if (cur.length) chunks.push(cur);
          chunks.push([p]);
          cur = [];
        } else cur.push(p);
      }
      if (cur.length) chunks.push(cur);
    }

    for (const line of chunks) {
      const words = line.filter(p => !p.space);
      if (!words.length) continue;
      const first = words[0], last = words[words.length - 1];
      if (first.emoji) {
        const top = this.ly(first.top), bottom = this.ly(first.bottom);
        const baseline = asc + desc > 0 ? top + ((bottom - top) * asc) / (asc + desc) : bottom;
        const size = fontSize * s;
        this.items.push({
          kind: 'emoji', glyph: data.slice(first.start, first.end), size,
          cx: (this.lx(first.left) + this.lx(first.right)) / 2, baseline,
          opacity: Math.min(1, op), fallback: {
            kind: 'text', text: data.slice(first.start, first.end), families, size, weight, italic, letterSpacing: 0,
            color: hex(color), opacity: Math.min(1, color.a * op),
            left: this.lx(first.left), right: this.lx(first.right), baseline, anchor: 'middle', lang,
          },
        });
        continue;
      }
      let text = data.slice(first.start, last.end);
      if (collapse) text = text.replace(/[\s\n\r\t]+/g, ' ');
      text = applyTransform(text, cs.textTransform, lang);
      range.setStart(node, first.start); range.setEnd(node, last.end);
      const box = range.getBoundingClientRect();
      const left = this.lx(Math.min(box.left, ...words.map(w => w.left)));
      const right = this.lx(Math.max(box.right, ...words.map(w => w.right)));
      const top = this.ly(first.top), bottom = this.ly(first.bottom);
      // Text rects span the font's ascent+descent; split that box in the same
      // ratio to land on the baseline whatever rounding Chrome applied.
      const baseline = asc + desc > 0 ? top + ((bottom - top) * asc) / (asc + desc) : bottom;
      this.items.push({
        kind: 'text', text, families, editFamily: this.editFamily(families, text), size: fontSize * s, weight, italic, letterSpacing: ls * s,
        color: hex(color), opacity: Math.min(1, color.a * op),
        left, right, baseline, anchor, lang,
      });
    }
  }
}

const n6 = (v: number) => String(Math.round(v * 1e6) / 1e6);
const opac = (what: 'fill' | 'stroke', a: number) => (a < 0.999 ? ` ${what}-opacity="${n(Math.max(0, a))}"` : '');

function applyTransform(text: string, tt: string, lang: string) {
  if (tt === 'uppercase') return text.toLocaleUpperCase(lang);
  if (tt === 'lowercase') return text.toLocaleLowerCase(lang);
  if (tt === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toLocaleUpperCase(lang));
  return text;
}

const GENERIC_FAMILY = /^(serif|sans-serif|cursive|fantasy|monospace|system-ui|ui-serif|ui-sans-serif|emoji|math)$/i;

const inRanges = (range: string, cp: number) => range.split(',').some(part => {
  const p = part.trim().replace(/^U\+/i, '');
  if (!p) return false;
  const [lo, hi = lo] = p.includes('?') ? [p.replace(/\?/g, '0'), p.replace(/\?/g, 'F')] : p.split('-');
  return cp >= parseInt(lo, 16) && cp <= parseInt(hi, 16);
});

/** Whether a web font family actually covers `cp`, from the unicode-range of
 *  its loaded @font-face rules. A family with no web faces is a system font:
 *  unknown, so assumed to cover it. */
function familyCovers(family: string, cp: number): boolean {
  const faces = Array.from(document.fonts ?? []).filter(f => f.family.replace(/^['"]|['"]$/g, '') === family);
  if (!faces.length) return true;
  return faces.some(f => inRanges(f.unicodeRange || 'U+0-10FFFF', cp));
}

/** The one family name an editable <text> should carry: the first in the CSS
 *  list that really has the line's letters, which is the font the browser
 *  drew it with. When none does (Devanagari typed into a Latin-only font),
 *  the browser fell back to a system font; on Windows that's Nirmala UI for
 *  every Indian script, which CorelDRAW sees too. */
export function editableFamily(families: string[], text: string): string {
  const named = families.filter(f => !GENERIC_FAMILY.test(f));
  const letter = text.match(/[\p{L}\p{M}\p{N}]/u)?.[0];
  const cp = letter?.codePointAt(0);
  if (cp !== undefined && cp > 0x7f) {
    const hit = named.find(f => familyCovers(f, cp));
    if (hit) return hit;
    if (cp >= 0x0900 && cp <= 0x0DFF) return 'Nirmala UI';
  }
  return named[0] ?? 'Times New Roman';
}

/* ── Writing the SVG ──────────────────────────────────────────────────────── */

/** The editable form of one text line: a single <text> CorelDRAW can retype. */
export function textElement(t: TextItem): string {
  const x = t.anchor === 'middle' ? (t.left + t.right) / 2 : t.anchor === 'end' ? t.right : t.left;
  // CorelDRAW chokes on quoted lists and fallbacks; the first family is the font.
  const family = t.editFamily ?? editableFamily(t.families, t.text);
  let a = `x="${n(x)}" y="${n(t.baseline)}" font-family="${esc(family)}" font-size="${n(t.size)}"`;
  if (t.weight >= 600) a += ` font-weight="${t.weight === 700 ? 'bold' : t.weight}"`;
  else if (t.weight !== 400) a += ` font-weight="${t.weight}"`;
  if (t.italic) a += ' font-style="italic"';
  if (Math.abs(t.letterSpacing) > 0.005) a += ` letter-spacing="${n(t.letterSpacing)}"`;
  if (t.anchor !== 'start') a += ` text-anchor="${t.anchor}"`;
  a += ` fill="${t.color}"${opac('fill', t.opacity)}`;
  return `<text ${a} xml:space="preserve">${esc(t.text)}</text>`;
}

/* ── Emoji artwork ────────────────────────────────────────────────────────
   Twemoji (CC-BY 4.0, the same set the deity icons use), fetched from
   jsDelivr only when a card has emoji in its text, and rewritten into the
   same attribute-only subset as everything else. */

const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';
const twemojiCache = new Map<string, Promise<((opacity: number) => string) | null>>();

function twemoji(glyph: string) {
  let p = twemojiCache.get(glyph);
  if (!p) {
    p = (async () => {
      const cps = [...glyph].map(ch => ch.codePointAt(0)!.toString(16));
      const names = cps.includes('200d') ? [cps.join('-')] : [cps.filter(c => c !== 'fe0f').join('-'), cps.join('-')];
      for (const name of [...new Set(names)]) {
        try {
          const res = await fetch(`${TWEMOJI}${name}.svg`);
          if (!res.ok) continue;
          const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
          const root = doc.documentElement;
          if (root.nodeName !== 'svg') continue;
          return (opacity: number) => Array.from(root.children).map(ch => cleanStatic(ch, { fill: '#000000' }, opacity)).join('');
        } catch { /* try the next name */ }
      }
      return null;
    })();
    twemojiCache.set(glyph, p);
  }
  return p;
}

/** A parsed (not rendered) SVG element → attribute-only SVG 1.1, resolving
 *  inherited fill/stroke onto each shape. */
function cleanStatic(el: Element, inherit: Record<string, string>, opacity: number): string {
  const tag = el.tagName.toLowerCase();
  const paintKeys = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit'];
  const paint: Record<string, string> = { ...inherit };
  for (const k of paintKeys) { const v = el.getAttribute(k); if (v !== null) paint[k] = v; }
  const op = opacity * Number(el.getAttribute('opacity') ?? 1);
  const t = el.getAttribute('transform');
  const tAttr = t && !/skew/i.test(t) ? ` transform="${esc(t)}"` : '';
  if (tag === 'g') return `<g${tAttr}>${Array.from(el.children).map(ch => cleanStatic(ch, paint, op)).join('')}</g>`;
  const geom = GEOMETRY[tag];
  if (!geom) return '';
  let a = '';
  for (const g of geom) { const v = el.getAttribute(g); if (v !== null && v !== '') a += ` ${g}="${esc(v)}"`; }
  for (const [k, v] of Object.entries(paint)) {
    if (k === 'fill-opacity' || k === 'stroke-opacity') continue;
    const c = (k === 'fill' || k === 'stroke') ? parseColor(v) : null;
    a += ` ${k}="${esc(c ? hex(c) : v)}"`;
  }
  const fo = Number(paint['fill-opacity'] ?? 1) * op, so = Number(paint['stroke-opacity'] ?? 1) * op;
  if (paint.fill !== 'none') a += opac('fill', fo);
  if (paint.stroke && paint.stroke !== 'none') a += opac('stroke', so);
  return `<${tag}${a}${tAttr}/>`;
}

export interface Outliner {
  /** Path data for a text line, or null if it can't be shaped (the caller falls back to <text>). */
  outline(t: TextItem): Promise<{ d: string; extra?: string } | null>;
  warnings: Set<string>;
}

async function pageSvg(page: HTMLElement, index: number, variant: SvgVariant, outliner: Outliner | null, warnings: Set<string>): Promise<string> {
  const scene = new PageScene(page, index);
  scene.walk(page, 1);
  scene.warnings.forEach(w => warnings.add(w));
  if (scene.missingScript.size) {
    const list = [...scene.missingScript].join(', ');
    const lead = `Some lines use letters that ${list} ${scene.missingScript.size > 1 ? "don't" : "doesn't"} have, so the card shows them in the computer's own font.`;
    warnings.add(variant === 'editable'
      ? `${lead} Those lines name Nirmala UI (built into Windows) in this file.`
      : `${lead} The outlines draw them in a similar open font (Noto Sans), which can look slightly different.`);
  }

  const W = page.offsetWidth, H = page.offsetHeight;
  const wIn = Number(page.dataset.widthIn) || W / PX_PER_IN;
  const hIn = Number(page.dataset.heightIn) || H / PX_PER_IN;
  const body: string[] = [];
  for (const item of scene.items) {
    if (item.kind === 'raw') { if (item.svg) body.push(item.svg); continue; }
    if (item.kind === 'emoji') {
      const art = await twemoji(item.glyph);
      if (art) {
        // Twemoji art is a 36-unit square; set it 1em tall, sitting on the
        // baseline the way DeityGlyph sets the deity icons (0.12em below it).
        const k = item.size / 36;
        const x = item.cx - item.size / 2, y = item.baseline + 0.12 * item.size - item.size;
        body.push(`<g transform="matrix(${n6(k)} 0 0 ${n6(k)} ${n(x)} ${n(y)})">${art(item.opacity)}</g>`);
      } else {
        warnings.add(`The emoji ${item.glyph} could not be drawn as artwork and was left as text (it may not show in CorelDRAW).`);
        body.push(textElement(item.fallback));
      }
      continue;
    }
    if (variant === 'outlined' && outliner) {
      const o = await outliner.outline(item);
      if (o) {
        if (o.d) body.push(`<path d="${o.d}" fill="${item.color}"${opac('fill', item.opacity)}${o.extra ?? ''}/>`);
        continue;
      }
    }
    body.push(textElement(item));
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${n(wIn)}in" height="${n(hIn)}in" viewBox="0 0 ${W} ${H}">\n`
    + `<title>Wedding card, page ${index + 1}</title>\n`
    + body.join('\n') + '\n</svg>\n';
}

/** One SVG per card page under `root`. */
export async function cardSvgFiles(root: HTMLElement, base: string, variant: SvgVariant): Promise<SvgExportResult> {
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.wmp-card-page'));
  const targets = pages.length ? pages : [root];
  const warnings = new Set<string>();
  await document.fonts?.ready;
  let outliner: Outliner | null = null;
  if (variant === 'outlined') {
    try {
      const { createOutliner } = await import('./svgOutline');
      outliner = await createOutliner();
    } catch (err) {
      console.error(err);
      warnings.add('The text-outlining engine could not load, so the text was exported as editable text instead.');
    }
  }
  const files: File[] = [];
  for (let i = 0; i < targets.length; i++) {
    const svg = await pageSvg(targets[i], i, variant, outliner, warnings);
    const name = targets.length > 1 ? `${base}-page-${i + 1}-${variant}.svg` : `${base}-${variant}.svg`;
    files.push(new File([svg], name, { type: 'image/svg+xml' }));
  }
  outliner?.warnings.forEach(w => warnings.add(w));
  return { files, warnings: [...warnings] };
}
