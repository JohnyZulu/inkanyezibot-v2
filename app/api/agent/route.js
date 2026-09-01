// app/api/agent/route.js
//
// Entry point Vercel Cron (and later, WhatsApp/Make.com) calls to run the
// agent. Keeps brain.js free of any HTTP-specific concerns.

import { runAgentTask } from "@/lib/agent/brain";

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
    const result = await runAgentTask(task);
    return Response.json({ result });
  } catch (err) {
    console.error("Agent task failed:", err);
    return Response.json({ error: "Agent failed to process the task" }, { status: 500 });
  }
}

// Simple health check — hit this in a browser once deployed to confirm
// the route is live before wiring up cron.
export async function GET() {
  return Response.json({ status: "Inkanyezi agent endpoint is alive" });
}
