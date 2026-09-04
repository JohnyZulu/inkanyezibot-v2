// lib/agent/tools/crm-reader.js
//
// Tool: read_crm — read leads from the CRM.
// Now backed by the shared store (lib/agent/store.js), so it sees writes made
// by update_crm within the same run. statusFilter is validated against the
// shared status enum, so a typo returns a clear error instead of silently
// producing an empty result (#13).

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { listLeads } from "../store.js";
import { ALLOWED_STATUSES } from "../constants.js";

export const crmReaderTool = tool(
  async ({ statusFilter }) => {
    let leads = listLeads();

    if (statusFilter !== undefined) {
      const filter = statusFilter.trim();
      if (filter.toLowerCase() !== "all") {
        const match = ALLOWED_STATUSES.find(
          (s) => s.toLowerCase() === filter.toLowerCase()
        );
        if (!match) {
          return JSON.stringify({
            success: false,
            error: `Unknown status filter "${statusFilter}". Valid: ${ALLOWED_STATUSES.join(", ")}, or "all".`,
          });
        }
        leads = leads.filter((lead) => lead.status === match);
      }
    }

    return JSON.stringify({ success: true, count: leads.length, leads }, null, 2);
  },
  {
    name: "read_crm",
    description:
      "Read leads from the Inkanyezi CRM. Use this whenever you need to know about current leads, the pipeline, or their status. Returns each lead's reference, name, contact details, industry, a summary, current status, score, notes, and how many days old the lead is.",
    schema: z.object({
      statusFilter: z
        .string()
        .trim()
        .max(40)
        .optional()
        .describe(
          `Optional status to filter by. One of: ${ALLOWED_STATUSES.join(", ")}, or "all" (or omit) for every lead.`
        ),
    }),
  }
);
