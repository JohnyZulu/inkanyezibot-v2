// lib/agent/tools/report-generator.js
//
// Tool: generate_report — produce a pipeline report from the CRM.
// CODE computes exact metrics; the LLM only writes the narrative.

import { tool } from "@langchain/core/tools";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { brain } from "../brain.js";
import { listLeads } from "../sheet-source.js";
import { ALLOWED_STATUSES, ALLOWED_SCORES, FOLLOW_UP_STALE_DAYS } from "../constants.js";
import { UNTRUSTED_DATA_RULE, contentToText } from "../llm-helpers.js";

// Business rules (see review decisions):
//   WON_STATUS: a booked call is the Phase-1 "win" signal.
//   A won lead EXITS the active pipeline (active = not won AND not lost),
//   so "active" means "deals still needing work" and won leads aren't double-counted.
const WON_STATUS = "Booked";
const LOST_STATUSES = ["Closed", "Not Interested"];

/** Compute exact pipeline metrics. Pure, deterministic, testable. */
export function computeMetrics(leads) {
  const total = leads.length;

  // By status — initialise every known status to 0 for a stable shape.
  const byStatus = {};
  for (const s of ALLOWED_STATUSES) byStatus[s] = 0;
  for (const lead of leads) {
    if (byStatus[lead.status] === undefined) byStatus[lead.status] = 0;
    byStatus[lead.status] += 1;
  }

  // By score — single pass, explicit allowed-score check (fixes the bug where
  // unknown non-empty scores were lost from the breakdown). Non-string scores
  // are treated as unscored rather than throwing.
  const byScore = { HOT: 0, WARM: 0, COLD: 0, UNSCORED: 0 };
  for (const lead of leads) {
    const s = typeof lead.score === "string" ? lead.score.trim().toUpperCase() : "";
    if (ALLOWED_SCORES.includes(s)) byScore[s] += 1;
    else byScore.UNSCORED += 1;
  }

  // By industry.
  const byIndustry = {};
  for (const lead of leads) {
    const key = (typeof lead.industry === "string" && lead.industry.trim()) || "Unknown";
    byIndustry[key] = (byIndustry[key] || 0) + 1;
  }

  const won = leads.filter((l) => l.status === WON_STATUS).length;
  const lost = leads.filter((l) => LOST_STATUSES.includes(l.status)).length;
  // active = not won and not lost (booked leads have exited to "won").
  const active = leads.filter(
    (l) => l.status !== WON_STATUS && !LOST_STATUSES.includes(l.status)
  ).length;

  const conversionRate = total > 0 ? Math.round((won / total) * 1000) / 10 : 0;

  const staleLeads = leads
    .filter(
      (l) =>
        (l.status === "New" || l.status === "Contacted") &&
        Number.isFinite(l.daysOld) &&
        l.daysOld > FOLLOW_UP_STALE_DAYS
    )
    .map((l) => ({ reference: l.reference, name: l.name, status: l.status, daysOld: l.daysOld }));

  const hotLeads = leads
    .filter((l) => (typeof l.score === "string" ? l.score.trim().toUpperCase() : "") === "HOT")
    .map((l) => ({ reference: l.reference, name: l.name, industry: l.industry }));

  return {
    total, active, won, lost, conversionRate,
    byStatus, byScore, byIndustry,
    staleCount: staleLeads.length, staleLeads,
    hotCount: hotLeads.length, hotLeads,
  };
}

export const reportGeneratorTool = tool(
  async ({ reportType }) => {
    let leads;
    try { leads = await listLeads(); }
    catch (err) { console.error("generate_report: sheet read failed:", err); return JSON.stringify({ success: false, error: "Could not read the CRM sheet to build the report." }); }
    const metrics = computeMetrics(leads);

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

${UNTRUSTED_DATA_RULE}

You are given EXACT metrics computed from the CRM. Do not recalculate, estimate, or invent any numbers — use the figures provided as-is. Your job is only to turn them into a clear narrative.

${focus}

Write a short executive summary (3-5 sentences): overall pipeline state, the most notable figure(s), any risks (e.g. stale leads), and 1-2 concrete recommended actions. Plain prose only — no markdown headers, no bullet points, no "###" or "**". Do not restate every number; highlight what matters.`;

    let narrative;
    try {
      const response = await brain.invoke([
        new SystemMessage(REPORT_PROMPT),
        new HumanMessage(`Metrics (JSON):\n${JSON.stringify(metrics, null, 2)}`),
      ]);
      narrative = contentToText(response.content).trim();
    } catch (err) {
      console.error("generate_report narrative call failed:", err);
      return JSON.stringify({
        success: true, reportType: reportType || "pipeline", metrics,
        narrative: "(Narrative unavailable — the summary model call did not complete. The metrics above are accurate.)",
      });
    }

    if (!narrative) narrative = "(Narrative unavailable. The metrics above are accurate.)";

    return JSON.stringify({ success: true, reportType: reportType || "pipeline", metrics, narrative });
  },
  {
    name: "generate_report",
    description:
      "Generate a pipeline report from the CRM. Returns EXACT metrics (totals, conversion rate, status/score/industry breakdowns, stale leads, hot leads) computed from the data, plus a written executive summary. Use when asked for a report, a pipeline overview, a summary of leads, or 'how are we doing'.",
    schema: z.object({
      reportType: z
        .enum(["pipeline", "stale_leads", "hot_leads"])
        .optional()
        .describe("Focus: 'pipeline' (default), 'stale_leads', or 'hot_leads'."),
    }),
  }
);
