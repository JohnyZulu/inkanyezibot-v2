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
