// lib/agent/tools/crm-writer.js
//
// The agent's second tool: UPDATE a lead in the CRM.
//
// This is the first tool that CHANGES state, so its safety is enforced in the
// tool itself, not just asked for in the prompt:
//   - It can only update three fields: status, score, notes. Nothing else.
//   - It CANNOT delete a lead, rename a lead, or touch any other column.
//   - status and score are validated against fixed allowed values — a typo or
//     a bad model suggestion is rejected, not written.
//   - It matches leads by their reference number (a stable ID), never by row
//     position, so it can't update the wrong lead if the sheet reorders.
//
// STAGE 1 (current): reads/writes an in-memory SEED store shared with
// crm-reader.js's data shape. STAGE 2 will swap the body for real Google
// Sheets writes (find row by reference → update the specific cells). The
// tool's name, description, schema, and safety rules stay identical.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Allowed values — the tool refuses anything outside these lists.
const ALLOWED_STATUSES = ["New", "Contacted", "Follow-up Sent", "Booked", "Closed", "Not Interested"];
const ALLOWED_SCORES = ["HOT", "WARM", "COLD"];

// --- Stage 1 seed store (in Stage 2 this becomes the Google Sheet) ---
// Mirrors crm-reader's leads; kept module-level so writes persist within a
// single run. (A real sheet persists across runs; this does not — fine for
// proving the write path.)
const SEED_STORE = {
  "INK-PLUMB-2026-4821": { name: "Thabo Mkhize", status: "New", score: "", notes: "" },
  "INK-RETAIL-2026-3390": { name: "Nomsa Dlamini", status: "Contacted", score: "", notes: "" },
  "INK-LEGAL-2026-7712": { name: "Sipho Ngcobo", status: "New", score: "", notes: "" },
  "INK-RETAIL-2026-3391": { name: "Nomsa Dlamini", status: "New", score: "", notes: "" },
};

export const crmWriterTool = tool(
  async ({ reference, status, score, notes }) => {
    // 1. The lead must exist — never create a new one via this tool.
    const lead = SEED_STORE[reference];
    if (!lead) {
      return JSON.stringify({
        success: false,
        error: `No lead found with reference "${reference}". Use read_crm to check valid references. No changes made.`,
      });
    }

    // 2. Validate any provided values BEFORE writing anything.
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

    // 3. At least one field must be provided — no silent no-ops.
    if (status === undefined && score === undefined && notes === undefined) {
      return JSON.stringify({
        success: false,
        error: "Nothing to update — provide at least one of: status, score, notes.",
      });
    }

    // 4. Apply only the allowed fields. Everything else is untouchable.
    const changed = [];
    if (status !== undefined) { lead.status = status; changed.push(`status → ${status}`); }
    if (score !== undefined) { lead.score = score; changed.push(`score → ${score}`); }
    if (notes !== undefined) {
      // Append notes rather than overwrite, so history isn't lost.
      lead.notes = lead.notes ? `${lead.notes} | ${notes}` : notes;
      changed.push("notes appended");
    }

    return JSON.stringify({
      success: true,
      reference,
      name: lead.name,
      changes: changed,
      message: `Updated ${lead.name} (${reference}): ${changed.join(", ")}.`,
    });
  },
  {
    name: "update_crm",
    description:
      "Update an existing lead in the Inkanyezi CRM. Can only change a lead's status, score, or notes — it cannot delete leads or change any other field. Identify the lead by its reference number (get this from read_crm first). Use this after deciding a lead's new status, assigning a score, or recording a note.",
    schema: z.object({
      reference: z
        .string()
        .describe("The lead's reference number, e.g. 'INK-PLUMB-2026-4821'. Required. Get it from read_crm."),
      status: z
        .string()
        .optional()
        .describe(
          "New status for the lead. Must be exactly one of: " +
            ALLOWED_STATUSES.join(", ") +
            ". Any other value will be rejected."
        ),
      score: z
        .string()
        .optional()
        .describe("Lead score. Must be exactly one of: HOT, WARM, COLD. Any other value will be rejected."),
      notes: z
        .string()
        .optional()
        .describe("A note to append to the lead's record (does not overwrite existing notes)."),
    }),
  }
);
