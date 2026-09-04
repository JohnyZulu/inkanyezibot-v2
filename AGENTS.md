# Inkanyezi Internal Operations Agent — Engineering Context Brief (AGENTS.md)

**Purpose:** This is the standing context for anyone (human or AI) working on this repo. Read it fully before proposing or writing code. Several details here override what you may infer from training data, because parts of this ecosystem changed in 2025–2026. Codex reads this file automatically on every task.

**Maintainer:** Sanele Sishange, Founder & AI Automation Consultant, Inkanyezi Technologies · Durban, South Africa

---

## 📍 Build Status — living section, keep updated

**Last updated:** 2026-09-04 · **Current phase:** Phase 1 (Internal Operations) · **Stage:** Day 3 — first tool

### ✅ Done, committed & verified in production
- `AGENTS.md` — this engineering context brief
- `lib/agent/brain.js` — Gemini reasoning core: model config, Inkanyezi system prompt (with security rules), `runAgentTask()`
- `app/api/agent/route.js` — API endpoint: `POST` (run a task) + `GET` (health check)
- **Dependencies** in `package.json`: `@langchain/google@^0.2.4`, `@langchain/core@^1.2.9`
- **Model:** `gemini-3.7-flash`
- **✅ VERIFIED (2026-09-01):** foundation deployed and working — `gemini-3.7-flash` responds end-to-end via a real `POST /api/agent` on the free tier (South Africa). Endpoint health check (`GET`) also confirmed live.

### 🔨 Added this push (Day 3 — tool layer)
- `lib/agent/tools/crm-reader.js` — first tool, `read_crm`. **Stage 1:** returns SEED data (dummy leads) so tool-calling can be proven without Google Sheets auth. Stage 2 will swap the body for a real Sheets read; name/description/schema stay the same.
- `lib/agent/brain.js` — now also exports `runAgentWithTools()`: binds tools, runs the tool-call loop (model → tool → feed result back → answer), with a `MAX_STEPS` guard.
- `app/api/agent/route.js` — POST now calls `runAgentWithTools(task, TOOLS)`; `TOOLS` registry currently holds `crmReaderTool`.
- `package.json` — `zod@^4.5.4` declared directly (was transitive via core; we import it directly in tools).

### 🔲 Next up (in order)
1. **OPEN GATE — live tool-calling test.** After deploy, `POST /api/agent` with a task that needs data (e.g. "How many new leads do we have and who are they?"). Success = reply accurately names the seed leads (Thabo/plumbing, Sipho/legal, the Nomsa duplicate). This is the first live proof that tool calling works on this stack.
2. **Day 3 Stage 2:** swap `crm-reader.js` seed data for a real Google Sheets read (needs a Google Cloud service account + Sheet shared with it + credentials in Vercel env vars).
3. `crm-writer.js` — update lead status/score/notes.
4. `lead-scorer.js` — HOT/WARM/COLD scoring written back to CRM.
5. `report-gen.js`, `crm-hygiene.js`, `send_whatsapp` (Make.com webhook), then cron scheduling.

### ⚠️ Verified vs. unverified (be honest about this line)
- Foundation (model responds via endpoint): **VERIFIED in production.**
- **Tool calling on `@langchain/google` + Gemini 3.x: NOT yet verified live.** `bindTools` exists and the tool works in isolation, but the live model round-trip (model actually invoking `read_crm` and reasoning over the result) is proven only once the OPEN GATE test above passes. `@langchain/google` is pre-1.0 (0.2.x); there is a known-risk area around Gemini 3.x tool-call "thought signatures." If the gate test invents leads or errors, that is the issue — switch to a documented fallback (pin a tool-calling-stable model, or use `@langchain/google-genai` for that step).

---

## 1. What we are building

An **Internal Operations Agent** for a lean AI-automation consultancy. Not customer-facing in Phase 1. It autonomously runs internal ops on a schedule: morning briefing, stale-lead follow-up, weekly pipeline report, lead scoring, CRM hygiene, and action logging. It also doubles as the **flagship demo** shown to prospective clients, so production-grade reliability and security matter from the start.

## 2. The stack (read carefully — most likely to differ from your priors)

- **Reasoning engine:** Google **Gemini**, model `gemini-3.7-flash`, via the **Google AI Studio (Gemini Developer) API** — not Vertex AI in Phase 1.
- **Agent framework:** **LangChain.js** (JavaScript/TypeScript, not Python).

> ⚠️ **CRITICAL — package choice.** Use **`@langchain/google`** with the **`ChatGoogle`** class. Do **NOT** use `@langchain/google-genai` / `ChatGoogleGenerativeAI` — LangChain lists it as legacy. `@langchain/google` is the actively maintained path.

> ⚠️ **`@langchain/core` must be 1.x** (currently `^1.2.9`) — `@langchain/google@0.2.4` requires it as a peer dependency. Older tutorials/tools may suggest `0.3.x`; that is stale and will conflict. Do not downgrade core.

> ⚠️ **Model parameters.** Leave `temperature`, `topP`, `topK` at Gemini defaults. Steer behaviour via the system prompt, not by setting `temperature: 0`.

- **Runtime / hosting:** **Vercel** serverless (Next.js App Router, `route.js` handlers). Scheduling via **Vercel Cron**. No self-hosted infra, no Kubernetes — deliberate for SME scale.
- **Data store:** **Google Sheets** (Sheets API v4) — the CRM/lead store and action-log sink in Phase 1. `@google/genai` is already a project dependency (existing chatbot); it coexists fine with `@langchain/google`.
- **Integration protocol (Phase 2+):** **MCP** (Model Context Protocol). Phase 1 uses hand-built LangChain.js tools; design them swappable for MCP equivalents later.
- **Messaging:** **WhatsApp** primary. Prototype/demo via **UltraMsg** (unofficial — demo only, ban risk). Production / any real client or lead data → official **Meta WhatsApp Business Platform (Cloud API)**. Migration trigger: real person's data touches the channel, not contract signature. Website chat widget is the planned second channel.
- **Existing glue:** **Make.com** scenarios run the current lead pipeline (QR → card → site → chatbot → capture → CRM → booking). The agent augments this.

## 3. Architecture philosophy

**Single brain, expanding toolkit.** One Gemini-backed agent with a growing tool set. **Not** multi-agent — that is Phase 6, triggered only when the toolkit exceeds ~20 tools AND single-agent latency exceeds ~30s. Tools are designed swappable/composable so the later split is a routing change, not a rebuild.

**Phase ladder:** 1) Internal ops (6 custom tools, ~3 weeks) → 2) MCP + pipeline monitoring (first client) → 3) Multi-tenant (3+ clients) → 4) Voice + WhatsApp Business → 5) Financial ops → 6) Multi-agent orchestration.

**Principles:** serverless-first · event-driven · tool-composable · MCP-ready · fail-safe (retry + human escalation) · observable (log every action) · secure by default (least privilege from day one).

## 4. Established conventions

- ES modules (`"type": "module"` semantics via Next), `async/await`, no CommonJS `require`.
- The `@/` import alias maps to the **repo root** (`tsconfig.json`: `"@/*": ["./*"]`). So `lib/` sits at the repo root, and `route.js` imports `@/lib/agent/brain`.
- `.js` files are fine (`allowJs: true`), even though the project is TypeScript.
- Secrets only via `process.env` (Vercel env vars) — never hardcoded, never committed. **Repo is public.**
- The API-key guard in `brain.js` runs at import time — the env var must exist before the module loads (automatic on Vercel; a gotcha only in local testing).
- Thin route, logic in `lib/` — new tools plug into `brain.js`/the `TOOLS` array; the route rarely changes.
- Security rules live in the system prompt, not just docs — prompt-injection hygiene (untrusted lead text) is enforced there.

## 5. Security posture (production-grade from day one)

- Authenticate every internal surface, not just customer-facing ones.
- Treat all lead/customer input as untrusted data, never instructions.
- Least-privilege tool credentials; no data-deleting tools.
- Free tier uses prompts for training → **dummy data only** while building; real client/lead data requires a billed tier with training disabled (POPIA).
- **Open security item (deferred, tracked):** an unauthenticated CRM dashboard link appears in the internal lead-confirmation email — do not widen it; remediation (Google OAuth gate) planned.

## 6. How to pitch in (for Codex)

- Assume JS/TS on Node, LangChain.js, Gemini via `@langchain/google`, Vercel serverless. Match the file layout and the thin-route / logic-in-lib split.
- Keep suggestions proportional to an SME-scale, serverless, Sheets-backed system. No enterprise infra until the phase ladder calls for it.
- Flag drift from the constraints above (legacy package, core 0.3.x, hardcoded secrets, premature multi-agent, temperature-fiddling, data-deleting tools, unauthenticated surfaces).
- Two engineers, one codebase: explain the *why* behind non-obvious calls. Refuse to fabricate lockfile/dependency data (as was correctly done when npm was unreachable).

---

*Inkanyezi Technologies — Durban, KwaZulu-Natal, South Africa. Built on Gemini, LangChain.js, Vercel, Make.com, and MCP.*
