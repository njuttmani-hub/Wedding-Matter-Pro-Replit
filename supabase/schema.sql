-- Wedding Matter Pro — Supabase schema
--
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query
-- → paste this whole file → Run. Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
--
-- One table, one JSON column: `form` stores the entire wizard FormState object
-- (see artifacts/wedding-matter-pro/src/types.ts) exactly as the app already
-- built it, so no field-by-field migration is needed. `order_number` is a
-- database-generated sequence, displayed in the app as "WMP-<order_number>" —
-- this replaces the old client-side random ID, which could theoretically
-- collide between two customers submitting at the same moment.

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity,
  couple text not null,
  status text not null default 'New' check (status in ('New', 'In Progress', 'Completed')),
  form jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists orders_order_number_idx on orders (order_number);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_created_at_idx on orders (created_at desc);

-- Keep updated_at current on every change.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function set_updated_at();

-- ─── Staff ──────────────────────────────────────────────────────────────────
-- Everyone who can sign in to the admin dashboard has a row here. The owner
-- sees every order; each staff member sees only the orders that came in
-- through their own customer link (yoursite/?by=<code>). A Supabase Auth
-- user with NO row here can sign in but sees nothing at all.
--
-- Rows are created and changed only by the `manage-staff` Edge Function
-- (supabase/functions/manage-staff), which holds the service-role key needed
-- to create logins. The browser can only read: the owner every row, staff
-- their own.

create table if not exists staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  -- The ?by= value in the staff member's customer link.
  code text not null unique check (code ~ '^[a-z0-9-]{2,32}$'),
  role text not null default 'staff' check (role in ('owner', 'staff')),
  -- A disabled member keeps their row (and their orders' attribution) but
  -- sees nothing; the Edge Function also bans their login.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Which staff member's link an order came through. Null for orders placed
-- without a link (or before staff existed): only the owner sees those.
-- Deleting a staff member hands their orders back to the owner.
alter table orders add column if not exists staff_id uuid references staff (user_id) on delete set null;
create index if not exists orders_staff_id_idx on orders (staff_id);

-- SECURITY DEFINER so policies can consult `staff` without recursing into
-- staff's own RLS. Both read only the caller's own row.
create or replace function is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'owner' and active);
$$;

create or replace function is_active_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from staff where user_id = auth.uid() and active);
$$;

grant execute on function is_owner() to authenticated;
grant execute on function is_active_staff() to authenticated;

alter table staff enable row level security;

drop policy if exists "owner reads all staff, staff read themselves" on staff;
create policy "owner reads all staff, staff read themselves"
  on staff for select
  to authenticated
  using (is_owner() or user_id = auth.uid());

-- The first login ever created becomes the owner, so a project upgrading to
-- staff accounts doesn't lock its existing admin out. Does nothing once an
-- owner exists.
insert into staff (user_id, name, email, code, role)
select u.id, 'Owner', coalesce(u.email, ''), 'owner', 'owner'
from auth.users u
where not exists (select 1 from staff where role = 'owner')
order by u.created_at
limit 1
on conflict (user_id) do update set role = 'owner', active = true;

-- Row Level Security: customers (using the public anon key) get NO direct
-- table access at all — not even insert. They can only create an order
-- through the create_order() function below, which runs with elevated
-- privileges and returns just the two fields the wizard's Success screen
-- needs (order_number, created_at) — never the rest of the table.
--
-- Signed-in users see orders according to their `staff` row: the owner sees
-- and manages every order; an active staff member only those attributed to
-- them; anyone else nothing. The checks run in the database, so a staff
-- member's browser is never even sent another member's orders (realtime
-- updates obey the same policies).

alter table orders enable row level security;

drop policy if exists "admins can read orders" on orders;
drop policy if exists "admins can update orders" on orders;
drop policy if exists "admins can delete orders" on orders;

drop policy if exists "owner or assigned staff read orders" on orders;
create policy "owner or assigned staff read orders"
  on orders for select
  to authenticated
  using (is_owner() or (staff_id = auth.uid() and is_active_staff()));

-- `with check` stops a staff member handing an order to someone else; only
-- the owner can change who an order belongs to.
drop policy if exists "owner or assigned staff update orders" on orders;
create policy "owner or assigned staff update orders"
  on orders for update
  to authenticated
  using (is_owner() or (staff_id = auth.uid() and is_active_staff()))
  with check (is_owner() or (staff_id = auth.uid() and is_active_staff()));

drop policy if exists "owner or assigned staff delete orders" on orders;
create policy "owner or assigned staff delete orders"
  on orders for delete
  to authenticated
  using (is_owner() or (staff_id = auth.uid() and is_active_staff()));

-- The only way an anonymous customer can create an order. SECURITY DEFINER
-- means it runs as the function owner (bypassing the RLS policies above,
-- which is what lets an anon caller insert at all) but it only ever inserts
-- a fresh row with status 'New' and returns the generated order number —
-- callers can't set status, can't read anyone else's row, and can't touch
-- the table any other way.
--
-- p_ref is the ?by= code from a staff member's customer link. An unknown or
-- disabled code is ignored (the order goes to the owner) rather than
-- rejected: a customer must never lose an order over a stale link. The
-- two-argument version is dropped because Postgres would treat it and this
-- one (whose p_ref has a default) as ambiguous for two-argument calls.
drop function if exists create_order(text, jsonb);
create or replace function create_order(p_couple text, p_form jsonb, p_ref text default null)
returns table (order_number bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row orders%rowtype;
  v_staff uuid;
begin
  if p_ref is not null then
    select user_id into v_staff from staff where code = lower(trim(p_ref)) and active;
  end if;
  insert into orders (couple, form, status, staff_id)
  values (p_couple, p_form, 'New', v_staff)
  returning * into v_row;
  return query select v_row.order_number, v_row.created_at;
end;
$$;

grant execute on function create_order(text, jsonb, text) to anon, authenticated;

-- Live updates: lets the admin dashboard see new/changed orders across
-- devices without a manual refresh. Wrapped so re-running this file doesn't
-- error if the table was already added.
do $$
begin
  alter publication supabase_realtime add table orders;
exception
  when duplicate_object then null;
end $$;
