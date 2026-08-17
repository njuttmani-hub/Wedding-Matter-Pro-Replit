import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Null when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't configured
 * (e.g. a fresh checkout before setup). Every caller in lib/orders.ts and
 * lib/auth.ts handles the null case so the app still renders — orders just
 * can't be saved or loaded until the keys are set. See CLAUDE.md.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

if (!supabase) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — orders will not be saved or loaded. See CLAUDE.md for setup.',
  );
}
