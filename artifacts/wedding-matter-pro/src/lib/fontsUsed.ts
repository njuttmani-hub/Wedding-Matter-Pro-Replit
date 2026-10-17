import type { FormState } from '../types';
import { FONTS } from '../data/constants';

export interface UsedFont {
  /** Family name as the designer installs it ("Cormorant Garamond"). */
  name: string;
  /** What it's used for on this card. */
  roles: string[];
  /** Free download page on Google Fonts (all are open-licensed). */
  url: string;
}

/** The family name inside a CSS font-family string: "'EB Garamond', serif" → "EB Garamond". */
export function familyName(cssFamily: string): string {
  return (cssFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** The fonts a card actually uses, for the designer to install before opening
 *  an editable export in CorelDRAW or Word, which only see fonts installed in
 *  Windows, not the web fonts the site loads. */
export function fontsUsed(form: FormState): UsedFont[] {
  const roles: [string, string][] = [
    [form.design.headingFont, 'Names & headings'],
    [form.design.bodyFont, 'Body text'],
    [form.design.scriptFont, 'Relation word (e.g. "Weds")'],
  ];
  const out: UsedFont[] = [];
  for (const [css, role] of roles) {
    const name = familyName(css);
    if (!name) continue;
    const known = FONTS.find(f => familyName(f.family) === name);
    const display = known?.name ?? name;
    const existing = out.find(f => f.name === display);
    if (existing) existing.roles.push(role);
    else out.push({ name: display, roles: [role], url: `https://fonts.google.com/specimen/${encodeURIComponent(display).replace(/%20/g, '+')}` });
  }
  return out;
}
