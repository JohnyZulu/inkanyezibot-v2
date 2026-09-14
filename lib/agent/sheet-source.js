// lib/agent/sheet-source.js
//
// STAGE 2: reads leads from the LIVE Google Sheet instead of the in-memory
// seed store. It exposes the SAME interface as store.js (listLeads, getLead)
// so the read-based tools (read_crm, generate_report, check_hygiene) need no
// changes — only their import source swaps from ../store.js to ../sheet-source.js.
//
// Reads via the anonymous Google Sheets API key (same method /api/sheet uses,
// which requires the sheet to be shared "Anyone with the link — Viewer"). This
// is a READ-only path; writes are handled separately (they need auth an API key
// can't provide — see the write tool).
//
// Column contract (Lead Data tab, A-R) — this MUST match the sheet layout:
//   A Name  B Email  C Phone  D Company  E Service Interest  F Message
//   G Has Email  H Has WhatsApp  I Source  J Timestamp  K Reference
//   L Meeting Status  M Meeting Date  N Meeting Time  O Booking ID
//   P Score  Q Notes  R Status
// If the sheet columns are reordered, update HEADER_MAP below.

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_TAB = "Lead Data";
const RANGE = `${SHEET_TAB}!A:R`;

// Map sheet column INDEX (0-based) to the tool field name.
const COLUMNS = [
  "name",          // A
  "email",         // B
  "phone",         // C
  "company",       // D
  "serviceInterest", // E
  "message",       // F  (the customer's issue / conversation)
  "hasEmailRaw",   // G
  "hasWhatsappRaw",// H
  "source",        // I
  "timestamp",     // J
  "reference",     // K  (stable unique ID)
  "meetingStatus", // L
  "meetingDate",   // M
  "meetingTime",   // N
  "bookingId",     // O
  "score",         // P
  "notes",         // Q
  "status",        // R  (lead lifecycle status)
];

/** Compute whole days between a timestamp and now. Returns null if unparseable. */
function daysSince(timestamp) {
  if (!timestamp) return null;
  const then = new Date(timestamp);
  if (isNaN(then.getTime())) return null;
  const ms = Date.now() - then.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function truthy(v) {
  return String(v || "").trim().toLowerCase() === "true";
}

/** Turn one sheet row (array of cell values) into a lead object the tools expect. */
function rowToLead(row) {
  const lead = {};
  COLUMNS.forEach((field, i) => {
    lead[field] = row[i] !== undefined && row[i] !== null ? String(row[i]) : "";
  });

  // Derived / normalised fields the tools use:
  return {
    reference: lead.reference,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    // tools historically use `industry`; map Service Interest to it, keep company too
    industry: lead.serviceInterest || lead.company || "",
    company: lead.company,
    summary: lead.message, // the customer's issue lives in Message
    status: lead.status,
    score: lead.score,
    notes: lead.notes,
    daysOld: daysSince(lead.timestamp),
    hasEmail: truthy(lead.hasEmailRaw) || !!(lead.email && lead.email.trim()),
    hasPhone: truthy(lead.hasWhatsappRaw) || !!(lead.phone && lead.phone.trim()),
    source: lead.source,
    meetingStatus: lead.meetingStatus,
    bookingId: lead.bookingId,
    timestamp: lead.timestamp,
  };
}

/**
 * Fetch all leads from the live sheet.
 * Throws on config/fetch errors (fail loud) — callers surface an honest error
 * rather than silently returning nothing.
 */
export async function listLeads() {
  if (!SHEET_ID || !API_KEY) {
    throw new Error("Missing GOOGLE_SHEET_ID or GOOGLE_SHEETS_API_KEY");
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}?key=${API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Sheets read failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const rows = Array.isArray(data.values) ? data.values : [];
  if (rows.length < 2) return []; // header only or empty

  // rows[0] is the header; skip it. Filter out rows with no name (blank rows).
  return rows
    .slice(1)
    .map(rowToLead)
    .filter((lead) => lead.name && lead.name.trim());
}

/** Get one lead by its Reference. Returns null if not found. */
export async function getLead(reference) {
  if (!reference) return null;
  const leads = await listLeads();
  return leads.find((l) => l.reference === reference) || null;
}
