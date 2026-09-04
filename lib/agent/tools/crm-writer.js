// lib/agent/tools/crm-writer.js
//
// Tool: update_crm — update an existing lead's status, score, or notes ONLY.
//
// Fixes applied from review:
//   #1  Prototype-pollution bypass — existence is checked via the shared store's
//       Map (hasLead/getLead), so "__proto__"/"constructor"/etc. are ordinary
//       misses. No inherited object can ever be treated as a lead.
//   #3  Shared state — writes go through the same store read_crm reads from.
//   #6  Non-throwing contract — validation returns {success:false} JSON; the
//       one place that could throw (unexpected error) is caught and stringified
//       safely with String(err?.message ?? err).
//   #7  Notes bounds — trimmed, length-capped, control chars stripped, empty
//       rejected. (Sheets formula-prefix escaping is deferred to Stage 2, done
//       at the actual Sheets write with RAW input mode.)

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getLead, updateLead } from "../store.js";
import { ALLOWED_STATUSES, ALLOWED_SCORES } from "../constants.js";

const MAX_NOTE_LENGTH = 500;

function cleanNote(raw) {
  // Strip control characters, collapse whitespace, trim, cap length.
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, MAX_NOTE_LENGTH);
}

export const crmWriterTool = tool(
  async ({ reference, status, score, notes }) => {
    try {
      // 1. Lead must exist — prototype-safe via the Map-backed store.
      if (!getLead(reference)) {
        return JSON.stringify({
          success: false,
          error: `No lead found with reference "${reference}". Use read_crm to check valid references. No changes made.`,
        });
      }

      // 2. Validate values BEFORE any write.
      if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
        return JSON.stringify({
          success: false,
          error: `Invalid status "${status}". Allowed: ${ALLOWED_STATUSES.join(", ")}. No changes made.`,
        });
      }
      if (score !== undefined && !ALLOWED_SCORES.includes(score)) {
        return JSON.stringify({
          success: false,
          error: `Invalid score "${score}". Allowed: ${ALLOWED_SCORES.join(", ")}. No changes made.`,
        });
      }

      // 3. Clean notes; a note that is empty after cleaning is not a valid note.
      let cleanedNote;
      if (notes !== undefined) {
        cleanedNote = cleanNote(notes);
        if (cleanedNote === "") {
          return JSON.stringify({
            success: false,
            error: "Note was empty after trimming — provide meaningful note text. No changes made.",
          });
        }
      }

      // 4. Require at least one real change.
      if (status === undefined && score === undefined && cleanedNote === undefined) {
        return JSON.stringify({
          success: false,
          error: "Nothing to update — provide at least one of: status, score, notes.",
        });
      }

      // 5. Apply via the store (mutates only the three allowed fields).
      const updated = updateLead(reference, { status, score, appendNote: cleanedNote });
      const changed = [];
      if (status !== undefined) changed.push(`status → ${status}`);
      if (score !== undefined) changed.push(`score → ${score}`);
      if (cleanedNote !== undefined) changed.push("notes appended");

      return JSON.stringify({
        success: true,
        reference,
        name: updated.name,
        changes: changed,
        message: `Updated ${updated.name} (${reference}): ${changed.join(", ")}.`,
      });
    } catch (err) {
      // #6: never throw out of the tool — return a safe, model-readable error.
      return JSON.stringify({
        success: false,
        error: `Unexpected error updating lead: ${String(err?.message ?? err)}. No changes confirmed.`,
      });
    }
  },
  {
    name: "update_crm",
    description:
      "Update an existing lead in the Inkanyezi CRM. Can only change a lead's status, score, or notes — it cannot delete leads or change any other field. Identify the lead by its reference number (get this from read_crm first). Use after deciding a lead's new status, assigning a score, or recording a note.",
    schema: z.object({
      reference: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .describe("The lead's reference number, e.g. 'INK-PLUMB-2026-4821'. Required. Get it from read_crm."),
      status: z
        .string()
        .optional()
        .describe(
          "New status. Must be exactly one of: " + ALLOWED_STATUSES.join(", ") + ". Any other value is rejected."
        ),
      score: z
        .string()
        .optional()
        .describe("Lead score. Must be exactly one of: HOT, WARM, COLD. Any other value is rejected."),
      notes: z
        .string()
        .max(2000)
        .optional()
        .describe("A note to append to the lead's record (does not overwrite existing notes)."),
    }),
  }
);
