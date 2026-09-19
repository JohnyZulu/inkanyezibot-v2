// lib/agent/tools/crm-writer.js
//
// Tool: update_crm — update an existing lead's status, score, or notes ONLY.
// STAGE 2 WRITE: writes directly to the live Google Sheet via a service account
// (../sheet-source.js updateLead), matched by Reference. No Make dependency.
//
// Safety (unchanged from hardened version):
//   - Only status / score / notes can change — never other fields, never delete.
//   - status/score validated against the shared enums (schema + runtime).
//   - notes trimmed, length-capped, empty rejected.
//   - Never throws out of the tool — returns {success:false} JSON on any error.

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { updateLead, getLead } from "../sheet-source.js";
import { ALLOWED_STATUSES, ALLOWED_SCORES } from "../constants.js";

const MAX_NOTE_LENGTH = 500;

function cleanNote(raw) {
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, MAX_NOTE_LENGTH);
}

export const crmWriterTool = tool(
  async ({ reference, status, score, notes }) => {
    try {
      // 1. Validate values BEFORE any write.
      if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
        return JSON.stringify({ success: false, error: `Invalid status "${status}". Allowed: ${ALLOWED_STATUSES.join(", ")}. No changes made.` });
      }
      if (score !== undefined && !ALLOWED_SCORES.includes(score)) {
        return JSON.stringify({ success: false, error: `Invalid score "${score}". Allowed: ${ALLOWED_SCORES.join(", ")}. No changes made.` });
      }
      let cleanedNote;
      if (notes !== undefined) {
        cleanedNote = cleanNote(notes);
        if (cleanedNote === "") {
          return JSON.stringify({ success: false, error: "Note was empty after trimming — provide meaningful note text. No changes made." });
        }
      }
      if (status === undefined && score === undefined && cleanedNote === undefined) {
        return JSON.stringify({ success: false, error: "Nothing to update — provide at least one of: status, score, notes." });
      }

      // 2. Apply via the service-account writer (matched by Reference).
      let result;
      try {
        result = await updateLead(reference, { status, score, appendNote: cleanedNote });
      } catch (err) {
        console.error(`update_crm write failed for ${reference}:`, err);
        return JSON.stringify({ success: false, error: "The CRM write did not complete. No change confirmed." });
      }

      // 3. Lead not found by reference.
      if (result === null) {
        return JSON.stringify({ success: false, error: `No lead found with reference "${reference}". Use read_crm to check valid references. No changes made.` });
      }

      const changed = [];
      if (status !== undefined) changed.push(`status → ${status}`);
      if (score !== undefined) changed.push(`score → ${score}`);
      if (cleanedNote !== undefined) changed.push("notes appended");

      return JSON.stringify({
        success: true,
        reference,
        changes: changed,
        message: `Updated lead ${reference}: ${changed.join(", ")}.`,
      });
    } catch (err) {
      console.error(`update_crm unexpected error for ${reference}:`, err);
      return JSON.stringify({ success: false, error: "An unexpected error occurred and no change was confirmed." });
    }
  },
  {
    name: "update_crm",
    description:
      "Update an existing lead in the Inkanyezi CRM. Can only change a lead's status, score, or notes — it cannot delete leads or change any other field. Identify the lead by its reference number (get this from read_crm first). Use after deciding a lead's new status, assigning a score, or recording a note.",
    schema: z.object({
      reference: z.string().trim().min(1).max(40).describe("The lead's reference number, e.g. 'INK-GEN-2026-4821'. Required. Get it from read_crm."),
      status: z.enum(ALLOWED_STATUSES).optional().describe("New status for the lead."),
      score: z.enum(ALLOWED_SCORES).optional().describe("Lead score: HOT, WARM, or COLD."),
      notes: z.string().max(2000).optional().describe("A note to append to the lead's record (does not overwrite existing notes)."),
    }),
  }
);
