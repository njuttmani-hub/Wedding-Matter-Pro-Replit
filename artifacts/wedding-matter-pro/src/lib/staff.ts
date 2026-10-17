import { supabase } from './supabase';

/** A row of the `staff` table (see supabase/schema.sql). */
export interface StaffMember {
  userId: string;
  name: string;
  email: string;
  /** The ?by= value in their customer link. */
  code: string;
  role: 'owner' | 'staff';
  active: boolean;
}

interface StaffRow { user_id: string; name: string; email: string; code: string; role: 'owner' | 'staff'; active: boolean }

const fromRow = (r: StaffRow): StaffMember => ({ userId: r.user_id, name: r.name, email: r.email, code: r.code, role: r.role, active: r.active });

/** The signed-in user's own staff row, or null if they have none (they then see no orders). */
export async function fetchMe(userId: string): Promise<StaffMember | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('staff').select('user_id, name, email, code, role, active').eq('user_id', userId).maybeSingle();
  if (error) {
    // The staff table doesn't exist until supabase/schema.sql is re-run.
    console.error('[staff] fetch me failed', error);
    return null;
  }
  return data ? fromRow(data as StaffRow) : null;
}

/** Every staff member — RLS returns them all only to the owner; staff get just themselves. */
export async function fetchStaff(): Promise<StaffMember[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('staff').select('user_id, name, email, code, role, active').order('created_at');
  if (error) {
    console.error('[staff] fetch failed', error);
    return [];
  }
  return (data as StaffRow[]).map(fromRow);
}

type StaffAction =
  | { action: 'create'; name: string; email: string; password: string; code: string }
  | { action: 'setActive'; userId: string; active: boolean }
  | { action: 'resetPassword'; userId: string; password: string }
  | { action: 'remove'; userId: string };

/** Runs an owner-only change through the `manage-staff` Edge Function (it
 *  holds the key that creates logins). Returns an error message, or null. */
export async function manageStaff(req: StaffAction): Promise<string | null> {
  if (!supabase) return 'Admin is not configured yet — see CLAUDE.md.';
  const { data, error } = await supabase.functions.invoke('manage-staff', { body: req });
  if (error) {
    // A non-2xx reply carries our { error } message in the response body.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    if (body?.error) return String(body.error);
    return /Failed to send|FunctionsFetchError|404/i.test(String(error.message ?? error))
      ? 'The staff manager isn\'t set up in Supabase yet (Edge Function "manage-staff") — see CLAUDE.md.'
      : String(error.message ?? error);
  }
  return data?.error ? String(data.error) : null;
}

/** Suggests a link name from a person's name: "Rahul Verma" → "rahul-verma". */
export function codeFromName(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

const REF_KEY = 'wmp_ref';

/** Remembers the ?by= code a customer arrived with, so an order placed after a
 *  reload, or days later from the saved draft, still goes to that staff
 *  member. A newer link replaces an older one. */
export function captureRef(): void {
  try {
    const ref = new URLSearchParams(window.location.search).get('by');
    if (ref && /^[a-z0-9-]{2,32}$/i.test(ref)) localStorage.setItem(REF_KEY, ref.toLowerCase());
  } catch { /* storage blocked: the order just goes to the owner */ }
}

export function currentRef(): string | null {
  try { return localStorage.getItem(REF_KEY); } catch { return null; }
}

/** The customer link a staff member shares. */
export function staffLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?by=${encodeURIComponent(code)}`;
}
