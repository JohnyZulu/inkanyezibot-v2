// lib/agent/tools/report-generator.js
//
// Tool: generate_report — produce a pipeline report from the CRM.
//
// Design principle (same as score_lead): CODE computes the numbers, the LLM
// writes the prose. All metrics (counts, conversion rate, revenue, breakdowns)
// are calculated deterministically in JavaScript so they are always exact and
// consistent — never estimated by the model from a data dump. Gemini then turns
// those exact figures into a readable executive summary with observations and
// recommended actions.
//
// The tool reads the CRM via the shared store (same data read_crm sees), so the
// report always reflects current pipeline state. In Stage 2, when the store is
// swapped for the real Google Sheet, this tool needs no changes.

import { tool } from "@langchain/core/tools";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { brain } from "../brain.js";
import { listLeads } from "../store.js";
import { ALLOWED_STATUSES } from "../constants.js";

// Statuses that count as "still active in the pipeline" vs closed.
const CLOSED_STATUSES = ["Closed", "Not Interested"];
const WON_STATUS = "Booked"; // treat a booked call as the Phase-1 "win" signal

/**
 * Compute exact pipeline metrics from the leads array.
 * Pure function, no LLM — fully deterministic and testable.
 */
export function computeMetrics(leads) {
  const total = leads.length;

  // Count by status (initialise every known status to 0 so the report is stable)
  const byStatus = {};
  for (const s of ALLOWED_STATUSES) byStatus[s] = 0;
  for (const lead of leads) {
    if (byStatus[lead.status] === undefined) byStatus[lead.status] = 0;
    byStatus[lead.status] += 1;
  }

  // Count by score
  const byScore = { HOT: 0, WARM: 0, COLD: 0, UNSCORED: 0 };
  for (const lead of leads) {
    const s = (lead.score || "").toUpperCase();
    if (byScore[s] === undefined) byScore.UNSCORED += 1;
    else if (s === "") byScore.UNSCORED += 1;
    else byScore[s] += 1;
  }
  // (leads with empty score fall through to UNSCORED)
  byScore.UNSCORED = leads.filter((l) => !l.score).length;

  // Count by industry
  const byIndustry = {};
  for (const lead of leads) {
    const key = lead.industry || "Unknown";
    byIndustry[key] = (byIndustry[key] || 0) + 1;
  }

  const active = leads.filter((l) => !CLOSED_STATUSES.includes(l.status)).length;
  const won = leads.filter((l) => l.status === WON_STATUS).length;

  // Conversion rate = won / total (guard against divide-by-zero)
  const conversionRate = total > 0 ? Math.round((won / total) * 1000) / 10 : 0;

  // Stale leads: still New/Contacted and older than 2 days
  const staleLeads = leads
    .filter(
      (l) =>
        (l.status === "New" || l.status === "Contacted") &&
        typeof l.daysOld === "number" &&
        l.daysOld > 2
    )
    .map((l) => ({ reference: l.reference, name: l.name, status: l.status, daysOld: l.daysOld }));

  // Hottest leads (scored HOT), for the "focus on these" section
  const hotLeads = leads
    .filter((l) => (l.score || "").toUpperCase() === "HOT")
    .map((l) => ({ reference: l.reference, name: l.name, industry: l.industry }));

  return {
    total,
    active,
    won,
    conversionRate,
    byStatus,
    byScore,
    byIndustry,
    staleCount: staleLeads.length,
    staleLeads,
    hotCount: hotLeads.length,
    hotLeads,
  };
}

export const reportGeneratorTool = tool(
  async ({ reportType }) => {
    const leads = listLeads();
    const metrics = computeMetrics(leads);

    // If there is no data, return a clean, honest result — don't ask the model
    // to narrate an empty pipeline into something it isn't.
    if (metrics.total === 0) {
      return JSON.stringify({
        success: true,
        reportType: reportType || "pipeline",
        metrics,
        narrative: "The CRM currently contains no leads, so there is nothing to report yet.",
      });
    }

    const focus =
      reportType === "stale_leads"
        ? "Focus the narrative on stale leads that need follow-up."
        : reportType === "hot_leads"
        ? "Focus the narrative on the hottest leads and recommended next actions."
        : "Give a balanced pipeline overview.";

    const REPORT_PROMPT = `You write concise internal pipeline reports for Inkanyezi Technologies, an AI automation consultancy.

You are given EXACT metrics computed from the CRM. Do not recalculate, estimate, or invent any numbers — use the figures provided as-is. Your job is only to turn them into a clear, useful narrative.

${focus}

Write a short executive summary (3-5 sentences) covering: the overall pipeline state, the most notable figure(s), any risks (e.g. stale leads), and 1-2 concrete recommended actions. Keep it direct and businesslike. Do not use markdown headers or bullet points — plain prose. Do not restate every number; highlight what matters.`;

    let narrative;
    try {
      const response = await brain.invoke([
        new SystemMessage(REPORT_PROMPT),
        new HumanMessage(`Metrics (JSON):\n${JSON.stringify(metrics, null, 2)}`),
      ]);
      narrative =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
          ? response.content.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("")
          : "";
      narrative = narrative.trim();
    } catch (err) {
      console.error("generate_report narrative call failed:", err);
      // The metrics are still valid even if the narrative fails — return them
      // with a note, rather than failing the whole report.
      return JSON.stringify({
        success: true,
        reportType: reportType || "pipeline",
        metrics,
        narrative: "(Narrative unavailable — the summary model call did not complete. The metrics above are accurate.)",
      });
    }

    if (!narrative) {
      narrative = "(Narrative unavailable. The metrics above are accurate.)";
    }

    return JSON.stringify({
      success: true,
      reportType: reportType || "pipeline",
      metrics,
      narrative,
    });
  },
  {
    name: "generate_report",
    description:
      "Generate a pipeline report from the CRM. Returns EXACT metrics (totals, conversion rate, status/score/industry breakdowns, stale leads, hot leads) computed from the data, plus a written executive summary. Use when asked for a report, a pipeline overview, a summary of leads, or 'how are we doing'.",
    schema: z.object({
      reportType: z
        .enum(["pipeline", "stale_leads", "hot_leads"])
        .optional()
        .describe(
          "What to focus the report on: 'pipeline' (default, balanced overview), 'stale_leads' (leads needing follow-up), or 'hot_leads' (top prospects and next actions)."
        ),
    }),
  }
);
