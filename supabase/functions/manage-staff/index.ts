// manage-staff: the owner adds, disables, re-enables, resets and removes
// staff logins from the admin dashboard.
//
// Creating a Supabase Auth user needs the service-role key, which must never
// reach a browser, so this runs as a Supabase Edge Function. Supabase injects
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY automatically.
//
// Every request is checked against the CALLER's own session: the function
// acts only if the caller is the active owner in the `staff` table.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function →
// Via editor → name it exactly `manage-staff` → paste this file → Deploy.
// (Or with the CLI: `supabase functions deploy manage-staff`.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Effectively forever; Supabase takes a Go-style duration.
const BAN_FOREVER = '876000h';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Who is calling? Resolved from their own access token, never from the body.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: 'Please sign in again.' }, 401);
  const { data: me } = await admin.from('staff').select('role, active').eq('user_id', who.user.id).maybeSingle();
  if (!me || me.role !== 'owner' || !me.active) return json({ error: 'Only the owner can manage staff.' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  const action = String(body.action ?? '');
  const userId = typeof body.userId === 'string' ? body.userId : '';

  // Guard every action that targets someone: never the owner themself.
  const target = async () => {
    if (!userId) return 'Missing staff member.';
    if (userId === who.user!.id) return 'You cannot change your own owner account here.';
    const { data } = await admin.from('staff').select('role').eq('user_id', userId).maybeSingle();
    if (!data) return 'That staff member no longer exists.';
    if (data.role === 'owner') return 'The owner account cannot be changed here.';
    return null;
  };

  switch (action) {
    case 'create': {
      const name = String(body.name ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const code = String(body.code ?? '').trim().toLowerCase();
      if (!name) return json({ error: 'Enter a name.' }, 400);
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email.' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      if (!/^[a-z0-9-]{2,32}$/.test(code)) return json({ error: 'Link name: 2–32 lowercase letters, digits or dashes.' }, 400);
      const { data: taken } = await admin.from('staff').select('user_id').eq('code', code).maybeSingle();
      if (taken) return json({ error: `The link name "${code}" is already used.` }, 409);

      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !created.user) return json({ error: error?.message ?? 'Could not create the login.' }, 400);
      const { error: rowError } = await admin.from('staff').insert({ user_id: created.user.id, name, email, code, role: 'staff' });
      if (rowError) {
        // Don't leave a login behind that has no staff row.
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: rowError.message }, 400);
      }
      return json({ ok: true, userId: created.user.id });
    }

    case 'setActive': {
      const problem = await target();
      if (problem) return json({ error: problem }, 400);
      const active = body.active === true;
      // Ban as well as flag: the flag hides orders at once (RLS checks it on
      // every query); the ban stops the login being used at all.
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : BAN_FOREVER });
      if (error) return json({ error: error.message }, 400);
      await admin.from('staff').update({ active }).eq('user_id', userId);
      return json({ ok: true });
    }

    case 'resetPassword': {
      const problem = await target();
      if (problem) return json({ error: problem }, 400);
      const password = String(body.password ?? '');
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }

    case 'remove': {
      const problem = await target();
      if (problem) return json({ error: problem }, 400);
      // Deleting the login cascades to the staff row; their orders stay and
      // go back to the owner (orders.staff_id is ON DELETE SET NULL).
      const { error } = await admin.auth.admin.deleteUser(userId);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }

    default:
      return json({ error: 'Unknown action.' }, 400);
  }
});
