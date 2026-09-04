// app/api/agent/route.js
//
// Entry point Vercel Cron (and later, WhatsApp/Make.com) calls to run the
// agent. Keeps brain.js free of HTTP concerns.
//
// The agent now runs WITH its tool registry. The model decides for itself
// whether a given task needs a tool — a plain "introduce yourself" task
// won't trigger one; "how many new leads do we have?" will call read_crm.
// As we build more tools, add them to the TOOLS array below — nothing else
// in this file changes.

import { runAgentWithTools } from "@/lib/agent/brain";
import { crmReaderTool } from "@/lib/agent/tools/crm-reader";
import { crmWriterTool } from "@/lib/agent/tools/crm-writer";
import { leadScorerTool } from "@/lib/agent/tools/lead-scorer";

const TOOLS = [crmReaderTool, crmWriterTool, leadScorerTool];

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { task } = body;
  if (!task || typeof task !== "string") {
    return Response.json({ error: "Missing required 'task' string in request body" }, { status: 400 });
  }

  try {
    const result = await runAgentWithTools(task, TOOLS);
    return Response.json({ result });
  } catch (err) {
    console.error("Agent task failed:", err);
    return Response.json({ error: "Agent failed to process the task" }, { status: 500 });
  }
}

// Health check — visit /api/agent in a browser to confirm the route is live.
export async function GET() {
  return Response.json({ status: "Inkanyezi agent endpoint is alive" });
}
