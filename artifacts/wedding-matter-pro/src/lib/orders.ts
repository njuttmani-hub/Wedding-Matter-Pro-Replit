import { supabase } from './supabase';
import type { FormState, SubmittedOrder } from '../types';

interface OrderRow {
  order_number: number;
  couple: string;
  status: SubmittedOrder['status'];
  form: FormState;
  created_at: string;
}

const ORDER_ID_PREFIX = 'WMP-';

function fromRow(row: OrderRow): SubmittedOrder {
  return {
    orderId: `${ORDER_ID_PREFIX}${row.order_number}`,
    at: new Date(row.created_at).toLocaleString(),
    couple: row.couple,
    form: row.form,
    status: row.status,
  };
}

function orderNumber(orderId: string): number {
  return Number(orderId.slice(ORDER_ID_PREFIX.length));
}

export async function fetchOrders(): Promise<SubmittedOrder[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('order_number, couple, status, form, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[orders] fetch failed', error);
    return [];
  }
  return (data as OrderRow[]).map(fromRow);
}

// Goes through the create_order() RPC rather than a direct table insert —
// customers (the anon key) have no table privileges at all, only execute
// rights on this function. See supabase/schema.sql for why.
export async function insertOrder(couple: string, form: FormState): Promise<SubmittedOrder | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .rpc('create_order', { p_couple: couple, p_form: form })
    .single();
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
