/* Suggests a customer's English text in an Indian script ("Aditi Sharma" →
   "अदिती शर्मा") through Google Input Tools — the same engine as Google's
   phonetic keyboards. It is unofficial and keyless, but CORS-enabled, so the
   browser calls it directly with nothing of ours in between.

   Only ever a suggestion: the result lands in an editable field, and any
   failure (offline, blocked, a changed response) just returns null so the
   caller can keep the English and ask the customer to type it themselves. */

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
  return out.some(p => p === null) ? null : out.join('');
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
