// lib/commerce/db.js — server-only Supabase access. The secret key never reaches
// the browser: this module is imported only by API routes / server components.
// Every call goes through a public.commerce_* database function; the app never
// writes tables directly (the database owns money/stock/state rules).

import { createClient } from '@supabase/supabase-js';
import { commerceConfig } from './config';

let client = null;

function db() {
  if (!client) {
    const { supabaseUrl, supabaseSecretKey } = commerceConfig();
    client = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export async function rpc(fn, args = {}) {
  if (!fn.startsWith('commerce_')) throw new Error('Only commerce_* functions may be called');
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    // Log the function and code only — never the arguments (they contain PII).
    console.error('[commerce.rpc]', fn, error.code, error.message);
    throw new Error(`Database call failed: ${fn}`);
  }
  return data;
}
