/* Suggests a customer's English text in an Indian script ("Aditi Sharma" →
   "अदिती शर्मा") through Google Input Tools — the same engine as Google's
   phonetic keyboards. It is unofficial and keyless, but CORS-enabled, so the
   browser calls it directly with nothing of ours in between.

   Only ever a suggestion: the result lands in an editable field, and any
   failure (offline, blocked, a changed response) just returns null so the
   caller can keep the English and ask the customer to type it themselves. */

import { CARD_LANGUAGES } from '../data/languages';

const ENDPOINT = 'https://inputtools.google.com/request';

// One result per (language, text) for the life of the page; names repeat a lot
// (a surname on every parent), and re-suggesting after an edit is then instant.
const cache = new Map<string, string>();

// The service HTML-escapes its output ("Sharma &amp; Mehta").
function unescapeHtml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" } as Record<string, string>)[e]);
}

// The service splits its input at commas and similar and silently drops them
// ("12-B, Rose Garden" → "१२-बी रोसे गार्डन"), so those are cut out here and
// put back around the converted pieces.
const SEPARATORS = /(\s*[,;:!?()[\]/\n]+\s*)/;

/** The whole value transliterated, or null if any of it couldn't be. `itc` is
 *  a CardLanguage `inputTools` code. Digits come back in the script's
 *  numerals; punctuation and line breaks are kept as typed. */
export async function transliterate(text: string, itc: string, signal?: AbortSignal): Promise<string | null> {
  const parts = text.trim().split(SEPARATORS);
  const out = await Promise.all(parts.map((p, i) => (i % 2 ? p : piece(p, itc, signal))));
  return out.some(p => p === null) ? null : normaliseDigits(out.join(''), itc);
}

// Code point of "0" in each Indian script's digit run (Devanagari, Bengali,
// Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam).
const INDIC_ZEROS = [0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66];

/** The service converts digits inconsistently: for Tamil "302001" comes back
 *  as "௩0௨00௧", Tamil digits with Latin zeros. So every digit is folded back
 *  to 0-9, then set in the language's own numerals only where its cards use
 *  them (CardLanguage.numerals); Tamil and Malayalam cards keep 0-9. */
function normaliseDigits(s: string, itc: string): string {
  const ascii = s.replace(/[०-൯]/g, ch => {
    const cp = ch.codePointAt(0)!;
    const zero = INDIC_ZEROS.find(z => cp >= z && cp <= z + 9);
    return zero === undefined ? ch : String(cp - zero);
  });
  const lang = CARD_LANGUAGES.find(l => l.inputTools === itc);
  if (!lang?.numerals) return ascii;
  const fmt = new Intl.NumberFormat(`${lang.locale}-u-nu-${lang.numerals}`, { useGrouping: false });
  return ascii.replace(/\d/g, d => fmt.format(Number(d)));
}

async function piece(text: string, itc: string, signal?: AbortSignal): Promise<string | null> {
  const src = text.trim();
  if (!src) return '';
  const key = `${itc}\u0000${src}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    const url = `${ENDPOINT}?text=${encodeURIComponent(src)}&itc=${encodeURIComponent(itc)}&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    // ["SUCCESS", [[segment, [best, …], …], …]] — the service splits on commas
    // and similar, so the answer is every segment's best candidate, in order.
    if (!Array.isArray(data) || data[0] !== 'SUCCESS' || !Array.isArray(data[1])) return null;
    let out = '';
    for (const seg of data[1] as unknown[]) {
      if (!Array.isArray(seg) || !Array.isArray(seg[1]) || typeof seg[1][0] !== 'string') return null;
      out += seg[1][0];
    }
    out = unescapeHtml(out).trim();
    if (!out) return null;
    cache.set(key, out);
    return out;
  } catch {
    return null;   // offline, blocked, aborted or not JSON
  }
}
