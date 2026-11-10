// lib/commerce/db.js — server-only Supabase access. The secret key never reaches
// the browser: this module is imported only by API routes / server components.
// Every call goes through a public.commerce_* database function; the app never
// writes tables directly (the database owns money/stock/state rules).

import { createClient } from '@supabase/supabase-js';
import { commerceConfig } from './config';

let client = null;

// Every database call gets a hard deadline (Codex review 02, outstanding risk), so a hung
// Supabase request can't silently eat the worker's or the webhook's time budget.
const DB_TIMEOUT_MS = 8000;
function fetchWithTimeout(input, init = {}) {
  const timeout = AbortSignal.timeout(DB_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

function db() {
  if (!client) {
    const { supabaseUrl, supabaseSecretKey } = commerceConfig();
    client = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: fetchWithTimeout },
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
