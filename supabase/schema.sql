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

-- Row Level Security: customers (using the public anon key) get NO direct
-- table access at all — not even insert. They can only create an order
-- through the create_order() function below, which runs with elevated
-- privileges and returns just the two fields the wizard's Success screen
-- needs (order_number, created_at) — never the rest of the table. Only a
-- logged-in admin (Supabase Auth session) can read, update, or delete
-- orders directly. Create that admin login under Dashboard → Authentication
-- → Users → Add user (see CLAUDE.md).

alter table orders enable row level security;

drop policy if exists "admins can read orders" on orders;
create policy "admins can read orders"
  on orders for select
  to authenticated
  using (true);

drop policy if exists "admins can update orders" on orders;
create policy "admins can update orders"
  on orders for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admins can delete orders" on orders;
create policy "admins can delete orders"
  on orders for delete
  to authenticated
  using (true);

-- The only way an anonymous customer can create an order. SECURITY DEFINER
-- means it runs as the function owner (bypassing the RLS policies above,
-- which is what lets an anon caller insert at all) but it only ever inserts
-- a fresh row with status 'New' and returns the generated order number —
-- callers can't set status, can't read anyone else's row, and can't touch
-- the table any other way.
create or replace function create_order(p_couple text, p_form jsonb)
returns table (order_number bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row orders%rowtype;
begin
  insert into orders (couple, form, status)
  values (p_couple, p_form, 'New')
  returning * into v_row;
  return query select v_row.order_number, v_row.created_at;
end;
$$;

grant execute on function create_order(text, jsonb) to anon, authenticated;

-- Live updates: lets the admin dashboard see new/changed orders across
-- devices without a manual refresh. Wrapped so re-running this file doesn't
-- error if the table was already added.
do $$
begin
  alter publication supabase_realtime add table orders;
exception
  when duplicate_object then null;
end $$;
