// lib/agent/constants.js
//
// Single source of truth for CRM enums, shared by every tool so the reader,
// writer, and scorer can never drift out of agreement on valid values.

export const ALLOWED_STATUSES = [
  "New",
  "Contacted",
  "Follow-up Sent",
  "Booked",
  "Closed",
  "Not Interested",
];

export const ALLOWED_SCORES = ["HOT", "WARM", "COLD"];

// Stale-lead thresholds (days). Deliberately different — they answer two
// different questions, so keep them named and distinct:
//   FOLLOW_UP_STALE_DAYS — pipeline urgency: a New/Contacted lead older than
//     this needs a nudge soon (used by generate_report).
//   HYGIENE_NEGLECT_DAYS — data/process problem: a New/Contacted lead ignored
//     this long is a red flag (used by check_hygiene).
export const FOLLOW_UP_STALE_DAYS = 2;
export const HYGIENE_NEGLECT_DAYS = 7;
