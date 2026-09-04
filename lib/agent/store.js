// lib/agent/store.js
//
// The single in-memory CRM store shared by read_crm and update_crm. This fixes
// two review findings at once:
//   #1 Prototype-pollution bypass — a Map is used instead of a plain object, so
//      map.get("__proto__") / "constructor" / "toString" are ordinary misses,
//      not inherited truthy objects. There is no way to address a non-record.
//   #3 Reader/writer out of sync — both tools go through THIS one store, so a
//      write is visible to a later read within the same process/run.
//
// STAGE 1: this is dummy seed data held in memory. It is intentionally ephemeral
// — module state does not reliably survive across serverless invocations, so a
// write in one HTTP request may not be visible in a separate later request. That
// is fine for proving the tools; real durable persistence arrives in STAGE 2 when
// this module is swapped for Google Sheets reads/writes. The tool interfaces
// (read_crm / update_crm) stay identical when that swap happens.
//
// The seed set is deliberately messy — a duplicate person, a missing phone, a
// range of ages — so it exercises the hygiene and scoring tools.

const seed = [
  {
    reference: "INK-PLUMB-2026-4821",
    name: "Thabo Mkhize",
    email: "thabo@durbanplumbing.co.za",
    phone: "0821234567",
    industry: "Plumbing",
    summary: "Wants to automate quote follow-ups; ~15 leads/week going cold.",
    status: "New",
    score: "",
    notes: "",
    daysOld: 1,
  },
  {
    reference: "INK-RETAIL-2026-3390",
    name: "Nomsa Dlamini",
    email: "nomsa.dlamini@gmail.com",
    phone: "",
    industry: "Retail",
    summary: "Asked about WhatsApp order-taking bot for a small clothing store.",
    status: "Contacted",
    score: "",
    notes: "",
    daysOld: 3,
  },
  {
    reference: "INK-LEGAL-2026-7712",
    name: "Sipho Ngcobo",
    email: "sipho@ngcobolaw.co.za",
    phone: "0739876543",
    industry: "Legal",
    summary: "Enquiry about document intake automation. Very engaged, replied twice.",
    status: "New",
    score: "",
    notes: "",
    daysOld: 5,
  },
  {
    reference: "INK-RETAIL-2026-3391",
    name: "Nomsa Dlamini",
    email: "nomsa.dlamini@gmail.com",
    phone: "",
    industry: "Retail",
    summary: "Duplicate enquiry, same person as INK-RETAIL-2026-3390.",
    status: "New",
    score: "",
    notes: "",
    daysOld: 2,
  },
];

// Map keyed by reference — prototype-safe lookups, single shared dataset.
const leads = new Map(seed.map((lead) => [lead.reference, lead]));

/** Return all leads as an array (fresh shallow copies, so callers can't mutate the store directly). */
export function listLeads() {
  return [...leads.values()].map((lead) => ({ ...lead }));
}

/** Get one lead by reference, or null. Prototype-safe (Map.get). Returns a copy. */
export function getLead(reference) {
  const lead = leads.get(reference);
  return lead ? { ...lead } : null;
}

/** True only for a real stored reference. */
export function hasLead(reference) {
  return leads.has(reference);
}

/**
 * Apply an update to the three mutable fields only. Returns the updated copy,
 * or null if the reference does not exist. Never creates a lead.
 * @param {string} reference
 * @param {{status?: string, score?: string, appendNote?: string}} changes
 */
export function updateLead(reference, changes) {
  const lead = leads.get(reference);
  if (!lead) return null;

  if (changes.status !== undefined) lead.status = changes.status;
  if (changes.score !== undefined) lead.score = changes.score;
  if (changes.appendNote !== undefined && changes.appendNote !== "") {
    lead.notes = lead.notes ? `${lead.notes} | ${changes.appendNote}` : changes.appendNote;
  }
  return { ...lead };
}
