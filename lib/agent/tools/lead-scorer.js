// lib/agent/tools/lead-scorer.js
//
// The agent's third tool: SCORE a lead as HOT / WARM / COLD.
//
// Unlike read_crm and update_crm (plain functions), this tool makes its OWN
// focused Gemini call. It applies an explicit, documented rubric so scores are
// consistent and explainable — a client can always ask "why HOT?" and get a
// concrete answer tied to the criteria. The rubric lives in ONE place
// (SCORING_RUBRIC below) so it can be tuned, versioned, or made per-client later.
//
// Design choices:
//   - Takes the lead's details as input (the agent gets them from read_crm and
//     passes them here) — so the scorer is decoupled from where data is stored.
//   - Weighs the clarity/value of the stated problem most heavily, because that
//     is the strongest real buying signal.
//   - Parses the model's reply defensively and NEVER throws — a parse failure
//     returns a readable error the agent can act on (the "return errors, don't
//     throw" rule we adopted).

import { tool } from "@langchain/core/tools";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { brain } from "../brain.js";

const SCORING_RUBRIC = `You score sales leads for Inkanyezi Technologies, an AI automation consultancy serving South African SMEs. Score each lead as exactly HOT, WARM, or COLD.

HOT — strong buying signals: the lead states a specific, costly, or recurring problem that AI automation directly solves (e.g. losing leads to slow follow-up, drowning in manual admin, missing after-hours enquiries); OR has engaged actively/repeatedly; AND is reachable.
WARM — genuine interest but softer: a real need that is less specific or lower urgency, OR limited engagement so far, OR incomplete contact details.
COLD — weak fit or low intent: a vague enquiry, no clear problem, poor fit for automation, or minimal engagement.

Weigh the clarity and value of the stated problem most heavily — it is the strongest signal of buying intent. Industry and contact completeness are secondary.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"score": "HOT" | "WARM" | "COLD", "reasoning": "one or two sentences citing the specific signals that drove the score"}`;

/**
 * Defensively parse the model's scoring reply into { score, reasoning }.
 * Handles clean JSON, JSON wrapped in ```code fences```, or stray text.
 * Returns null if it can't extract a valid score.
 */
export function parseScoreResponse(text) {
  if (!text || typeof text !== "string") return null;

  // Strip markdown code fences if the model added them despite instructions.
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Try to isolate the JSON object if there's surrounding text.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const score = String(parsed.score || "").toUpperCase();
  if (!["HOT", "WARM", "COLD"].includes(score)) return null;

  return {
    score,
    reasoning: parsed.reasoning || "No reasoning provided.",
  };
}

export const leadScorerTool = tool(
  async ({ name, industry, summary, status, daysOld }) => {
    const leadDescription = [
      `Name: ${name || "unknown"}`,
      `Industry: ${industry || "unknown"}`,
      `Status: ${status || "unknown"}`,
      `Days since first contact: ${daysOld ?? "unknown"}`,
      `Summary of their enquiry: ${summary || "(none provided)"}`,
    ].join("\n");

    let reply;
    try {
      const response = await brain.invoke([
        new SystemMessage(SCORING_RUBRIC),
        new HumanMessage(`Score this lead:\n\n${leadDescription}`),
      ]);
      reply = response.content;
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: `Scoring model call failed: ${err.message}. No score assigned.`,
      });
    }

    const result = parseScoreResponse(reply);
    if (!result) {
      return JSON.stringify({
        success: false,
        error: "Could not parse a valid score from the model. No score assigned.",
      });
    }

    return JSON.stringify({
      success: true,
      score: result.score,
      reasoning: result.reasoning,
      message: `Scored ${name || "lead"} as ${result.score}: ${result.reasoning}`,
    });
  },
  {
    name: "score_lead",
    description:
      "Assess a single lead and score it HOT, WARM, or COLD with reasoning, using Inkanyezi's scoring rubric. Provide the lead's details (get them from read_crm first). After scoring, use update_crm to save the score to the lead's record.",
    schema: z.object({
      name: z.string().optional().describe("The lead's name."),
      industry: z.string().optional().describe("The lead's industry, e.g. 'Plumbing'."),
      summary: z
        .string()
        .describe("The summary of the lead's enquiry / what they said they need. This is the most important input."),
      status: z.string().optional().describe("Current CRM status, e.g. 'New', 'Contacted'."),
      daysOld: z.number().optional().describe("How many days since first contact."),
    }),
  }
);
