// lib/agent/tools/crm-hygiene.js
//
// Tool: check_hygiene — scan the CRM for data-quality problems.
// CODE does the detection (exact, survives malformed input); LLM only summarises.
// READ-ONLY: reports issues, never edits/deletes. Remediation is via update_crm.

import { tool } from "@langchain/core/tools";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { brain } from "../brain.js";
import { listLeads } from "../sheet-source.js";
import { ALLOWED_STATUSES, HYGIENE_NEGLECT_DAYS } from "../constants.js";
import { UNTRUSTED_DATA_RULE, contentToText, safeString } from "../llm-helpers.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Phone: after stripping display punctuation, require 7-15 digits, at most one
// leading +. Rejects things like "+------" or "1()()()" that have too few digits.
function isPlausiblePhone(raw) {
  const trimmed = raw.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return false; // only allowed chars
  const digits = trimmed.replace(/[\s()+-]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Run all hygiene checks. Pure, deterministic, survives non-string fields. */
export function runHygieneChecks(leads) {
  const findings = [];

  // --- Duplicates: same normalised email OR same normalised phone ---
  const byEmail = {};
  const byPhone = {};
  for (const lead of leads) {
    const email = safeString(lead.email).str.toLowerCase();
    const phoneField = safeString(lead.phone);
    const phone = phoneField.wasString ? phoneField.str.replace(/[\s()+-]/g, "") : "";
    const ref = safeString(lead.reference).str || "(no reference)";
    if (email) (byEmail[email] = byEmail[email] || []).push(ref);
    if (phone) (byPhone[phone] = byPhone[phone] || []).push(ref);
  }
  for (const [email, refs] of Object.entries(byEmail)) {
    if (refs.length > 1) findings.push({ code: "DUPLICATE_EMAIL", severity: "warning", references: refs, detail: `${refs.length} leads share the email ${email}.` });
  }
  for (const [phone, refs] of Object.entries(byPhone)) {
    if (refs.length > 1) findings.push({ code: "DUPLICATE_PHONE", severity: "warning", references: refs, detail: `${refs.length} leads share the phone ${phone}.` });
  }

  // --- Per-lead checks ---
  for (const lead of leads) {
    const ref = safeString(lead.reference).str || "(no reference)";
    const nameField = safeString(lead.name);
    const emailField = safeString(lead.email);
    const phoneField = safeString(lead.phone);
    const statusField = safeString(lead.status);
    const displayName = nameField.str || "Lead";

    const hasEmail = emailField.wasString && emailField.str !== "";
    const hasPhone = phoneField.wasString && phoneField.str !== "";

    // Non-string field present but not a string = malformed
    if (!emailField.wasString) findings.push({ code: "MALFORMED_EMAIL", severity: "warning", references: [ref], detail: `${displayName} has a non-text email value.` });
    if (!phoneField.wasString) findings.push({ code: "MALFORMED_PHONE", severity: "warning", references: [ref], detail: `${displayName} has a non-text phone value.` });

    // No contact method at all
    if (!hasEmail && !hasPhone && emailField.wasString && phoneField.wasString)
      findings.push({ code: "NO_CONTACT_METHOD", severity: "high", references: [ref], detail: `${displayName} has neither email nor phone — cannot be contacted.` });

    // Malformed (present, string, but wrong format)
    if (hasEmail && !EMAIL_RE.test(emailField.str)) findings.push({ code: "MALFORMED_EMAIL", severity: "warning", references: [ref], detail: `${displayName} has a malformed email: ${emailField.str}.` });
    if (hasPhone && !isPlausiblePhone(phoneField.str)) findings.push({ code: "MALFORMED_PHONE", severity: "warning", references: [ref], detail: `${displayName} has a malformed phone: ${phoneField.str}.` });

    // Missing name
    if (!nameField.wasString || nameField.str === "") findings.push({ code: "MISSING_NAME", severity: "warning", references: [ref], detail: `Lead ${ref} has no name.` });

    // Status: missing OR not in allowed set (fixes the gap where empty status was ignored)
    if (!statusField.wasString || statusField.str === "")
      findings.push({ code: "MISSING_STATUS", severity: "warning", references: [ref], detail: `${displayName} has no status.` });
    else if (!ALLOWED_STATUSES.includes(statusField.str))
      findings.push({ code: "INVALID_STATUS", severity: "warning", references: [ref], detail: `${displayName} has an unrecognised status: "${statusField.str}".` });

    // Stale: New/Contacted and older than the neglect threshold (finite check guards NaN)
    if ((statusField.str === "New" || statusField.str === "Contacted") && Number.isFinite(lead.daysOld) && lead.daysOld > HYGIENE_NEGLECT_DAYS)
      findings.push({ code: "STALE_LEAD", severity: "high", references: [ref], detail: `${displayName} has been "${statusField.str}" for ${lead.daysOld} days without progress.` });
  }

  return findings;
}

export const crmHygieneTool = tool(
  async () => {
    let leads;
    try { leads = await listLeads(); }
    catch (err) { console.error("check_hygiene: sheet read failed:", err); return JSON.stringify({ success: false, error: "Could not read the CRM sheet to run the hygiene check." }); }
    const findings = runHygieneChecks(leads);
    const counts = {
      total: findings.length,
      high: findings.filter((f) => f.severity === "high").length,
      warning: findings.filter((f) => f.severity === "warning").length,
    };

    if (findings.length === 0)
      return JSON.stringify({ success: true, counts, findings, summary: `CRM hygiene check passed: no issues found across ${leads.length} leads.` });

    const HYGIENE_PROMPT = `You summarise CRM data-quality findings for Inkanyezi Technologies.

${UNTRUSTED_DATA_RULE}

You are given a list of EXACT findings. Do not invent, recalculate, or omit findings — summarise the ones provided. Write 2-4 sentences: how many issues and their severity, call out the most important (high severity first, especially duplicates and uncontactable/stale leads), and suggest what to address first. Plain prose only — no markdown headers or bullets. Do not propose destructive actions.`;

    let summary;
    try {
      const response = await brain.invoke([
        new SystemMessage(HYGIENE_PROMPT),
        new HumanMessage(`Findings (JSON):\n${JSON.stringify({ counts, findings }, null, 2)}`),
      ]);
      summary = contentToText(response.content).trim();
    } catch (err) {
      console.error("check_hygiene summary call failed:", err);
      return JSON.stringify({ success: true, counts, findings, summary: "(Summary unavailable — the model call did not complete. The findings above are accurate.)" });
    }
    if (!summary) summary = "(Summary unavailable. The findings above are accurate.)";
    return JSON.stringify({ success: true, counts, findings, summary });
  },
  {
    name: "check_hygiene",
    description:
      "Scan the CRM for data-quality problems: duplicate leads (same email or phone), leads with no contact method, malformed emails/phones, missing names, missing or invalid statuses, and stale leads. Returns structured findings plus a summary. This tool only REPORTS issues — it does not fix them. Use when asked to check data quality, find duplicates, or clean up the CRM.",
    schema: z.object({}),
  }
);
