// lib/agent/tools/crm-reader.js
//
// The agent's first tool: read leads from the CRM.
//
// STAGE 1 (current): returns SEED data defined in this file, so we can prove
// that tool-calling works end-to-end (does Gemini 3.7 Flash actually invoke a
// tool via @langchain/google?) WITHOUT needing Google Sheets auth set up yet.
//
// STAGE 2 (next): the body of the tool will be swapped to read the real
// "Lead Data" tab from the Google Sheet via a service account. The tool's
// name, description, and schema stay the same — only the data source changes —
// so nothing else in the agent has to change when we make that swap.
//
// The seed leads below are deliberately realistic and messy (a duplicate, a
// missing phone, one old lead) so they also serve as a test fixture for the
// scoring and hygiene tools built later. They are DUMMY data — safe to use on
// the free tier, which may use prompts for training.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// --- Stage 1 seed data (replace with real Sheets read in Stage 2) ---
const SEED_LEADS = [
  {
    reference: "INK-PLUMB-2026-4821",
    name: "Thabo Mkhize",
    email: "thabo@durbanplumbing.co.za",
    phone: "0821234567",
    industry: "Plumbing",
    summary: "Wants to automate quote follow-ups; ~15 leads/week going cold.",
    status: "New",
    score: "",
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
    daysOld: 2,
  },
];

export const crmReaderTool = tool(
  async ({ statusFilter }) => {
    // In Stage 2 this becomes a Google Sheets API call. For now, read seed data.
    let leads = SEED_LEADS;

    if (statusFilter && statusFilter.toLowerCase() !== "all") {
      leads = leads.filter(
        (lead) => lead.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Return JSON text — the model reads this as the tool's result.
    return JSON.stringify({ count: leads.length, leads }, null, 2);
  },
  {
    name: "read_crm",
    description:
      "Read leads from the Inkanyezi CRM. Use this whenever you need to know about current leads, the pipeline, or their status. Returns lead reference, name, contact details, industry, a summary, current status, score, and how many days old the lead is.",
    schema: z.object({
      statusFilter: z
        .string()
        .optional()
        .describe(
          "Optional status to filter by, e.g. 'New', 'Contacted', 'Follow-up Sent'. Use 'all' or omit to return every lead."
        ),
    }),
  }
);
