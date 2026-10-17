/* ─── Text → vector outlines for the "outlined" SVG export ───────────────────
   Lazy-loaded by svgExport.ts only when the designer asks for outlines, so
   HarfBuzz (WASM, ~0.4 MB) and the font downloads never touch the main bundle.

   Shaping: HarfBuzz, which handles every Indian script the card supports
   (Devanagari conjuncts and matras, Gujarati, Gurmukhi, Bengali, Tamil,
   Telugu, Kannada, Malayalam) the way the browser does. opentype.js alone
   would not reorder matras or form conjuncts.

   Fonts: the same Google Fonts families, fetched as TTF from Fontsource's
   jsDelivr CDN (CORS-enabled). The Fontsource API lists each family's weights,
   styles and per-script subsets with their Unicode ranges, so each piece of a
   line is shaped with the subset file that covers its script. Subsets are
   split at spaces, which never join, so shaping across a split is exact. */

import type { Outliner, TextItem } from './svgExport';

type HB = typeof import('harfbuzzjs');
type HBFont = InstanceType<HB['Font']>;

interface FontMeta {
  id: string;
  family: string;
  weights: number[];
  styles: string[];
  defSubset: string;
  subsets: string[];
  ranges: Record<string, [number, number][]>;
  variants: Record<string, Record<string, Record<string, { url: { ttf?: string; woff?: string } }>>>;
}

const GENERIC = /^(serif|sans-serif|cursive|fantasy|monospace|system-ui|ui-serif|ui-sans-serif|emoji|math)$/i;

/** Where the browser would fall back to a system font (Nirmala UI, Segoe UI
 *  Symbol …) for a character the card's font lacks — ॥ in a Latin font, ✦ ◈ —
 *  the outlines use the closest open equivalent. Only consulted on a miss. */
const FALLBACKS = [
  'Noto Sans Devanagari', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi', 'Noto Sans Bengali', 'Noto Sans Tamil',
  'Noto Sans Telugu', 'Noto Sans Kannada', 'Noto Sans Malayalam', 'Noto Sans', 'Noto Sans Symbols 2',
  'Noto Sans Symbols', 'Noto Sans Math',
];

function parseRanges(s: string): [number, number][] {
  return s.split(',').map(p => p.trim().replace(/^U\+/i, '')).filter(Boolean).map(p => {
    if (p.includes('-')) { const [a, b] = p.split('-'); return [parseInt(a, 16), parseInt(b, 16)] as [number, number]; }
    if (p.includes('?')) return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)] as [number, number];
    const v = parseInt(p, 16); return [v, v] as [number, number];
  });
}

/** CSS font-matching for weight (CSS Fonts 4 §5.2). */
function pickWeight(available: number[], want: number): number {
  const ws = [...available].sort((a, b) => a - b);
  if (ws.includes(want)) return want;
  const below = ws.filter(w => w < want).reverse(), above = ws.filter(w => w > want);
  if (want >= 400 && want <= 500) {
    const upTo500 = above.filter(w => w <= 500);
    return upTo500[0] ?? below[0] ?? above[0];
  }
  return want < 400 ? (below[0] ?? above[0]) : (above[0] ?? below[0]);
}

/** Skia's fake-bold outset: 1/24 of the size at 9px, 1/32 at 36px and up. */
function fakeBoldWidth(size: number) {
  const t = Math.max(0, Math.min(1, (size - 9) / 27));
  return size * (1 / 24 + (1 / 32 - 1 / 24) * t);
}

const r2 = (v: number) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };
// Outline points to 0.1 px (0.03 mm): finer is invisible in print and only grows the file.
const r1 = (v: number) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? '0' : String(r); };

export async function createOutliner(): Promise<Outliner> {
  const hb: HB = await import('harfbuzzjs');
  const warnings = new Set<string>();
  const metaCache = new Map<string, Promise<FontMeta | null>>();
  const fontCache = new Map<string, Promise<{ font: HBFont; upem: number; cmap: Set<number> } | null>>();
  const pathCache = new Map<string, string>();

  const meta = (family: string) => {
    const id = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let p = metaCache.get(id);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch(`https://api.fontsource.org/v1/fonts/${id}`);
          if (!res.ok) return null;
          const j = await res.json();
          const ranges: Record<string, [number, number][]> = {};
          for (const [k, v] of Object.entries(j.unicodeRange ?? {})) ranges[k] = parseRanges(String(v));
          const subsets = Object.keys(ranges);
          // Look in the default (Latin) subset first: ranges overlap, and the
          // first file to cover a character is the one browsers use too.
          subsets.sort((a, b) => (a === j.defSubset ? -1 : b === j.defSubset ? 1 : 0));
          return { id, family: j.family, weights: j.weights, styles: j.styles, defSubset: j.defSubset, subsets, ranges, variants: j.variants } as FontMeta;
        } catch { return null; }
      })();
      metaCache.set(id, p);
    }
    return p;
  };

  const loadFont = (url: string) => {
    let p = fontCache.get(url);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const face = new hb.Face(new hb.Blob(await res.arrayBuffer()));
          return { font: new hb.Font(face), upem: face.upem, cmap: new Set(face.collectUnicodes()) };
        } catch { return null; }
      })();
      fontCache.set(url, p);
    }
    return p;
  };

  interface Choice { url: string; meta: FontMeta; weight: number; style: string }

  const choose = async (families: string[], cp: number, weight: number, italic: boolean): Promise<Choice | null> => {
    for (const fam of [...families, ...FALLBACKS]) {
      if (GENERIC.test(fam)) continue;
      const m = await meta(fam);
      if (!m) continue;
      // Stand-ins for system fonts (Nirmala UI has only regular and bold, so
      // Chrome draws 500 as regular) snap to those two weights.
      const want = families.includes(fam) ? weight : weight >= 600 ? 700 : 400;
      const w = pickWeight(m.weights, want);
      const style = italic && m.styles.includes('italic') ? 'italic' : 'normal';
      for (const subset of m.subsets.filter(s => m.ranges[s].some(([lo, hi]) => cp >= lo && cp <= hi))) {
        const file = m.variants?.[String(w)]?.[style]?.[subset]?.url?.ttf;
        if (!file) continue;
        // Subset ranges can promise more than the file holds; check its cmap.
        const loaded = await loadFont(file);
        if (!loaded || !loaded.cmap.has(cp)) continue;
        return { url: file, meta: m, weight: w, style };
      }
    }
    return null;
  };

  async function outline(t: TextItem): Promise<{ d: string; extra?: string } | null> {
    const seg = new Intl.Segmenter(t.lang || undefined, { granularity: 'grapheme' });
    const graphemes = [...seg.segment(t.text)].map(g => g.segment);

    // Runs of graphemes sharing one font file. Spaces and joiners stay with
    // the run they sit in rather than forcing a switch to the Latin file.
    interface Run { choice: Choice; text: string; graphemes: number }
    const runs: Run[] = [];
    for (const g of graphemes) {
      const cp = g.codePointAt(0)!;
      const neutral = /^[\s​-‍⁠﻿]+$/.test(g);
      const cur = runs[runs.length - 1];
      if (neutral && cur) { cur.text += g; cur.graphemes++; continue; }
      const choice = await choose(t.families, cp, t.weight, t.italic);
      if (!choice) {
        warnings.add(`No downloadable font for "${g}" in ${t.families[0] ?? 'the card font'}; that line was left as editable text.`);
        return null;
      }
      if (cur && cur.choice.url === choice.url) { cur.text += g; cur.graphemes++; }
      else runs.push({ choice, text: g, graphemes: 1 });
    }

    // Shape every run, collecting glyphs in page units relative to the line start.
    interface Glyph { path: string; x: number; y: number; k: number; skew: number }
    const glyphs: Glyph[] = [];
    let pen = 0, synthBold = false;
    for (const run of runs) {
      const f = await loadFont(run.choice.url);
      if (!f) {
        warnings.add(`Couldn't download the font ${run.choice.meta.family}; its text was left editable.`);
        return null;
      }
      const k = t.size / f.upem;
      const skew = t.italic && run.choice.style !== 'italic' ? 0.25 : 0;   // the browser's synthetic oblique
      if (t.weight >= 600 && run.choice.weight < 600) synthBold = true;     // and its synthetic bold
      const buf = new hb.Buffer();
      buf.addText(run.text);
      buf.guessSegmentProperties();
      if (t.lang) buf.setLanguage(t.lang);
      // Like the browser, letter-spaced text gets no optional ligatures.
      const feats = Math.abs(t.letterSpacing) > 0.005
        ? ['liga', 'clig', 'dlig', 'calt'].map(tag => new hb.Feature(tag, 0))
        : [];
      hb.shape(f.font, buf, feats);
      const infos = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
      for (let i = 0; i < infos.length; i++) {
        const gid = infos[i].codepoint;
        if (gid === 0 && !/^\s$/.test(run.text[infos[i].cluster] ?? '')) {
          const ch = run.text.slice(infos[i].cluster).match(/^./su)?.[0] ?? '';
          warnings.add(`The font ${run.choice.meta.family} has no shape for "${ch}"; a line containing it was left as editable text.`);
          return null;
        }
        const key = `${run.choice.url}#${gid}`;
        let path = pathCache.get(key);
        if (path === undefined) { path = f.font.glyphToPath(gid); pathCache.set(key, path); }
        if (path) glyphs.push({ path, x: pen + pos[i].xOffset * k, y: pos[i].yOffset * k, k, skew });
        pen += pos[i].xAdvance * k;
        // Letter-spacing goes after each cluster (each grapheme, in practice).
        const nextCluster = i + 1 < infos.length ? infos[i + 1].cluster : -1;
        if (nextCluster !== infos[i].cluster) pen += t.letterSpacing;
      }
    }

    const width = pen;
    const x0 = t.anchor === 'middle' ? (t.left + t.right) / 2 - width / 2 : t.anchor === 'end' ? t.right - width : t.left;
    const by = t.baseline;
    let d = '';
    for (const g of glyphs) {
      const ox = x0 + g.x, oy = by - g.y;
      d += g.path.replace(/([MLQCZ])([^MLQCZ]*)/gi, (_, cmd: string, args: string) => {
        const nums = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
        const out: string[] = [];
        for (let j = 0; j + 1 < nums.length; j += 2) {
          const fx = nums[j], fy = nums[j + 1];
          out.push(`${r1(ox + (fx + g.skew * fy) * g.k)} ${r1(oy - fy * g.k)}`);
        }
        return cmd.toUpperCase() + out.join(' ');
      });
    }
    const extra = synthBold
      ? ` stroke="${t.color}" stroke-width="${r2(fakeBoldWidth(t.size))}" stroke-linejoin="round"${t.opacity < 0.999 ? ` stroke-opacity="${r2(t.opacity)}"` : ''}`
      : undefined;
    if (import.meta.env.DEV) {
      const measured = t.right - t.left;
      if (measured > 0 && Math.abs(width - measured) / measured > 0.04) {
        console.debug(`[svg outline] width differs: "${t.text}" shaped ${width.toFixed(1)} vs browser ${measured.toFixed(1)}`);
      }
    }
    return { d, extra };
  }

  return { outline, warnings };
}
