import { supabase } from './supabase';
import type { FormState, SubmittedOrder } from '../types';
import { DEFAULT_CARD_SIZE } from '../data/constants';

interface OrderRow {
  order_number: number;
  couple: string;
  status: SubmittedOrder['status'];
  form: FormState;
  created_at: string;
  staff_id?: string | null;
}

const ORDER_ID_PREFIX = 'WMP-';

const LEGACY_DESIGN_DEFAULTS: Pick<FormState['design'], 'cardSize' | 'pageMode'> = {
  cardSize: DEFAULT_CARD_SIZE,
  pageMode: 'combined',
};

function fromRow(row: OrderRow): SubmittedOrder {
  return {
    orderId: `${ORDER_ID_PREFIX}${row.order_number}`,
    at: new Date(row.created_at).toLocaleString(),
    couple: row.couple,
    // Orders submitted before cardSize/pageMode existed have neither; fill them
    // in so the dashboard renders those cards exactly as it always did.
    form: { ...row.form, design: { ...LEGACY_DESIGN_DEFAULTS, ...row.form.design } },
    status: row.status,
    staffId: row.staff_id ?? null,
  };
}

function orderNumber(orderId: string): number {
  return Number(orderId.slice(ORDER_ID_PREFIX.length));
}

export async function fetchOrders(): Promise<SubmittedOrder[]> {
  if (!supabase) return [];
  const query = (cols: string) => supabase!.from('orders').select(cols).order('created_at', { ascending: false });
  let { data, error } = await query('order_number, couple, status, form, created_at, staff_id');
  // 42703 = no such column: the database predates staff accounts (schema.sql
  // not re-run yet). Load the orders without attribution rather than none.
  if (error?.code === '42703') ({ data, error } = await query('order_number, couple, status, form, created_at'));
  if (error) {
    console.error('[orders] fetch failed', error);
    return [];
  }
  return (data as unknown as OrderRow[]).map(fromRow);
}

// Goes through the create_order() RPC rather than a direct table insert —
// customers (the anon key) have no table privileges at all, only execute
// rights on this function. See supabase/schema.sql for why.
// `ref` is the ?by= code of the staff member whose link the customer used.
export async function insertOrder(couple: string, form: FormState, ref: string | null = null): Promise<SubmittedOrder | null> {
  if (!supabase) return null;
  const create = (args: Record<string, unknown>) => supabase!.rpc('create_order', args).single();
  let { data, error } = await create(ref ? { p_couple: couple, p_form: form, p_ref: ref } : { p_couple: couple, p_form: form });
  // PGRST202 = no create_order taking p_ref: the database predates staff
  // accounts. Never lose a customer's order over that; save it unattributed.
  if (error?.code === 'PGRST202' && ref) ({ data, error } = await create({ p_couple: couple, p_form: form }));
  if (error) {
    console.error('[orders] insert failed', error);
    return null;
  }
  const row = data as { order_number: number; created_at: string };
  return {
    orderId: `${ORDER_ID_PREFIX}${row.order_number}`,
    at: new Date(row.created_at).toLocaleString(),
    couple,
    form,
    status: 'New',
  };
}

export async function updateOrderStatus(orderId: string, status: SubmittedOrder['status']): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('orders').update({ status }).eq('order_number', orderNumber(orderId));
  if (error) {
    console.error('[orders] status update failed', error);
    return false;
  }
  return true;
}

export async function deleteOrder(orderId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('orders').delete().eq('order_number', orderNumber(orderId));
  if (error) {
    console.error('[orders] delete failed', error);
    return false;
  }
  return true;
}

/** Calls onChange whenever any order is inserted, updated, or deleted — by anyone, on any device. Returns an unsubscribe function. */
export function subscribeToOrders(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel('orders-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
