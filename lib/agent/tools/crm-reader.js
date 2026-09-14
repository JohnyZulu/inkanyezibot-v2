// lib/agent/tools/crm-reader.js
//
// Tool: read_crm — read leads from the CRM.
// STAGE 2: now reads the LIVE Google Sheet via ../sheet-source.js (async).
// statusFilter is validated against the shared status enum, so a typo returns a
// clear error instead of silently producing an empty result.

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { listLeads } from "../sheet-source.js";
import { ALLOWED_STATUSES } from "../constants.js";

export const crmReaderTool = tool(
  async ({ statusFilter }) => {
    let leads;
    try {
      leads = await listLeads();
    } catch (err) {
      console.error("read_crm: sheet read failed:", err);
      return JSON.stringify({
        success: false,
        error: "Could not read the CRM sheet right now. No data returned.",
      });
    }

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
        // Blank statuses on real leads won't match a filter — that's fine.
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
        .enum([...ALLOWED_STATUSES, "all"])
        .optional()
        .describe(
          `Optional status to filter by. One of: ${ALLOWED_STATUSES.join(", ")}, or "all" (or omit) for every lead.`
        ),
    }),
  }
);
