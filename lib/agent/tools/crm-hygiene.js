// lib/agent/tools/crm-hygiene.js
//
// Tool: check_hygiene — scan the CRM for data-quality problems.
//
// Design principle (same as generate_report): CODE does the detection, the LLM
// only summarises. Duplicate/missing-field/format checks must be exact and
// repeatable, so they are pure deterministic JavaScript — never left to model
// judgement. Gemini then turns the structured findings into a short summary.
//
// SAFETY: this tool is READ-ONLY. It reports issues; it never edits or deletes
// data. If the user wants issues fixed, the agent proposes update_crm actions
// for the user to approve. Detection and remediation are deliberately separate.

import { tool } from "@langchain/core/tools";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { brain } from "../brain.js";
import { listLeads } from "../store.js";
import { ALLOWED_STATUSES } from "../constants.js";

// Simple, permissive email/phone sanity checks (format only — not validation of
// real deliverability). Deliberately conservative to avoid false positives.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s()-]{6,}$/; // starts with + or digit, >=7 chars

/**
 * Run all hygiene checks. Pure function, no LLM — fully deterministic/testable.
 * Returns a structured findings array.
 */
export function runHygieneChecks(leads) {
  const findings = [];

  // --- Duplicates: same normalised email OR same normalised phone ---
  const byEmail = {};
  const byPhone = {};
  for (const lead of leads) {
    const email = (lead.email || "").trim().toLowerCase();
    const phone = (lead.phone || "").replace(/[\s()-]/g, "");
    if (email) (byEmail[email] = byEmail[email] || []).push(lead.reference);
    if (phone) (byPhone[phone] = byPhone[phone] || []).push(lead.reference);
  }
  for (const [email, refs] of Object.entries(byEmail)) {
    if (refs.length > 1) {
      findings.push({
        code: "DUPLICATE_EMAIL",
        severity: "warning",
        references: refs,
        detail: `${refs.length} leads share the email ${email}.`,
      });
    }
  }
  for (const [phone, refs] of Object.entries(byPhone)) {
    if (refs.length > 1) {
      findings.push({
        code: "DUPLICATE_PHONE",
        severity: "warning",
        references: refs,
        detail: `${refs.length} leads share the phone ${phone}.`,
      });
    }
  }

  // --- Per-lead checks ---
  for (const lead of leads) {
    const ref = lead.reference || "(no reference)";

    // Missing contact info entirely (no email AND no phone) = can't be reached
    const hasEmail = !!(lead.email && lead.email.trim());
    const hasPhone = !!(lead.phone && lead.phone.trim());
    if (!hasEmail && !hasPhone) {
      findings.push({
        code: "NO_CONTACT_METHOD",
        severity: "high",
        references: [ref],
        detail: `${lead.name || "Lead"} has neither email nor phone — cannot be contacted.`,
      });
    }

    // Malformed email (present but doesn't look like an email)
    if (hasEmail && !EMAIL_RE.test(lead.email.trim())) {
      findings.push({
        code: "MALFORMED_EMAIL",
        severity: "warning",
        references: [ref],
        detail: `${lead.name || "Lead"} has a malformed email: ${lead.email}.`,
      });
    }

    // Malformed phone (present but doesn't look like a phone)
    if (hasPhone && !PHONE_RE.test(lead.phone.trim())) {
      findings.push({
        code: "MALFORMED_PHONE",
        severity: "warning",
        references: [ref],
        detail: `${lead.name || "Lead"} has a malformed phone: ${lead.phone}.`,
      });
    }

    // Missing name
    if (!lead.name || !lead.name.trim()) {
      findings.push({
        code: "MISSING_NAME",
        severity: "warning",
        references: [ref],
        detail: `Lead ${ref} has no name.`,
      });
    }

    // Invalid status (not one of the allowed values)
    if (lead.status && !ALLOWED_STATUSES.includes(lead.status)) {
      findings.push({
        code: "INVALID_STATUS",
        severity: "warning",
        references: [ref],
        detail: `${lead.name || "Lead"} has an unrecognised status: "${lead.status}".`,
      });
    }

    // Stale: still New/Contacted and older than 7 days = neglected
    if (
      (lead.status === "New" || lead.status === "Contacted") &&
      typeof lead.daysOld === "number" &&
      lead.daysOld > 7
    ) {
      findings.push({
        code: "STALE_LEAD",
        severity: "high",
        references: [ref],
        detail: `${lead.name || "Lead"} has been "${lead.status}" for ${lead.daysOld} days without progress.`,
      });
    }
  }

  return findings;
}

export const crmHygieneTool = tool(
  async () => {
    const leads = listLeads();
    const findings = runHygieneChecks(leads);

    const counts = {
      total: findings.length,
      high: findings.filter((f) => f.severity === "high").length,
      warning: findings.filter((f) => f.severity === "warning").length,
    };

    if (findings.length === 0) {
      return JSON.stringify({
        success: true,
        counts,
        findings,
        summary: `CRM hygiene check passed: no issues found across ${leads.length} leads.`,
      });
    }

    const HYGIENE_PROMPT = `You summarise CRM data-quality findings for Inkanyezi Technologies.

You are given a list of EXACT findings detected in the CRM. Do not invent, recalculate, or omit findings — summarise the ones provided. Write 2-4 sentences: state how many issues were found and their severity, call out the most important ones (high severity first, especially duplicates and uncontactable/stale leads), and suggest what to address first. Plain prose, no markdown headers or bullets. Do not propose destructive actions — this is a report for the operator to act on.`;

    let summary;
    try {
      const response = await brain.invoke([
        new SystemMessage(HYGIENE_PROMPT),
        new HumanMessage(`Findings (JSON):\n${JSON.stringify({ counts, findings }, null, 2)}`),
      ]);
      summary =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
          ? response.content.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("")
          : "";
      summary = summary.trim();
    } catch (err) {
      console.error("check_hygiene summary call failed:", err);
      return JSON.stringify({
        success: true,
        counts,
        findings,
        summary: "(Summary unavailable — the model call did not complete. The findings above are accurate.)",
      });
    }

    if (!summary) summary = "(Summary unavailable. The findings above are accurate.)";

    return JSON.stringify({ success: true, counts, findings, summary });
  },
  {
    name: "check_hygiene",
    description:
      "Scan the CRM for data-quality problems: duplicate leads (same email or phone), leads with no contact method, malformed emails/phones, missing names, invalid statuses, and stale leads. Returns structured findings plus a summary. This tool only REPORTS issues — it does not fix them. Use when asked to check data quality, find duplicates, or clean up the CRM.",
    schema: z.object({}),
  }
);
