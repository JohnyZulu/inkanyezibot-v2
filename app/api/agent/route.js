// app/api/agent/route.js — authenticated.
// POST requires EITHER a signed-in dashboard session OR the machine bearer token.

import { auth } from "@/auth";
import { runAgentWithTools } from "@/lib/agent/brain";
import { crmReaderTool } from "@/lib/agent/tools/crm-reader";
import { crmWriterTool } from "@/lib/agent/tools/crm-writer";
import { leadScorerTool } from "@/lib/agent/tools/lead-scorer";
import { reportGeneratorTool } from "@/lib/agent/tools/report-generator";
import { crmHygieneTool } from "@/lib/agent/tools/crm-hygiene";

const TOOLS = [crmReaderTool, crmWriterTool, leadScorerTool, reportGeneratorTool, crmHygieneTool];

function hasValidBearer(request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length === secret.length && token === secret;
}

export async function POST(request) {
  // Gate: signed-in dashboard user, or a machine caller with the bearer token.
  const session = await auth();
  const authorized = Boolean(session?.user?.email) || hasValidBearer(request);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

// Health check — safe to leave open.
export async function GET() {
  return Response.json({ status: "Inkanyezi agent endpoint is alive" });
}
