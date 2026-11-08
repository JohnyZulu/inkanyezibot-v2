// lib/commerce/owner.js — owner authorisation for commerce surfaces.
// Google sign-in alone is NOT owner authorisation (v0.3 §14): the signed-in email
// must also be listed in OWNER_EMAILS. Fails closed if the env var is missing.

import { auth } from '@/auth';
import { commerceConfig } from './config';

export async function requireOwner() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return { ok: false, status: 401 };
  const { ownerEmails } = commerceConfig();
  if (!ownerEmails.includes(email)) return { ok: false, status: 403 };
  return { ok: true, email };
}
