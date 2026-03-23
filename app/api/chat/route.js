// ════════════════════════════════════════════════════════════════════
// INKANYEZI AI BRAIN — app/api/chat/route.js
// ════════════════════════════════════════════════════════════════════
// Calls Gemini REST API directly via fetch — zero SDK dependency.
// This eliminates all @google/generative-ai version conflicts.
// Model: gemini-2.5-flash (stable production, Mar 2026)
// ════════════════════════════════════════════════════════════════════

const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// ── HELPERS ───────────────────────────────────────────────────────────
const INDUSTRY_CODES = {
  plumbing:'PLB', electrical:'ELC', construction:'CON',
  healthcare:'HLT', property:'PRP', retail:'RTL',
  transport:'TRP', hospitality:'HSP', professional:'PRF',
  education:'EDU', technology:'TEC', other:'GEN',
};

function generateRef(industry) {
  const code = INDUSTRY_CODES[industry?.toLowerCase()] || 'GEN';
  const year  = new Date().getFullYear();
  const rand  = Math.floor(1000 + Math.random() * 9000);
  return `INK-${code}-${year}-${rand}`;
}

function getSATime() {
  return new Date().toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ════════════════════════════════════════════════════════════════════
function buildSystemPrompt(context, sessionId) {
  const saTime = getSATime();
  const ref    = context?.referenceNumber || generateRef(context?.industry);

  const known = [];
  if (context?.name)          known.push(`Name: ${context.name}`);
  if (context?.business)      known.push(`Business: ${context.business}`);
  if (context?.industry)      known.push(`Industry: ${context.industry}`);
  if (context?.staff_count)   known.push(`Staff: ${context.staff_count}`);
  if (context?.pain_point)    known.push(`Pain point: ${context.pain_point}`);
  if (context?.current_tools) known.push(`Tools: ${context.current_tools}`);
  if (context?.email)         known.push(`Email: ${context.email}`);
  if (context?.whatsapp)      known.push(`WhatsApp: ${context.whatsapp}`);
  if (context?.budget_signal) known.push(`Budget: ${context.budget_signal}`);
  if (context?.demo_booked)   known.push(`Demo: BOOKED`);

  const leadBlock = known.length > 0
    ? `LEAD PROFILE (already captured — do NOT ask again):\n${known.map(f => `  • ${f}`).join('\n')}`
    : `LEAD PROFILE: Nothing yet. Begin qualification naturally.`;

  const nextTarget =
    !context?.name        ? 'their name and what their business does' :
    !context?.pain_point  ? 'their biggest operational challenge' :
    !context?.staff_count ? 'their team size' :
    (!context?.email && !context?.whatsapp) ? 'their WhatsApp or email for follow-up' :
    !context?.demo_booked ? 'booking the free 30-min discovery call with Sanele' :
                            'answering remaining questions and building rapport';

  return `You are InkanyeziBot — the intelligent AI sales assistant for Inkanyezi Technologies, a Durban-based AI automation consultancy for South African SMEs.

CURRENT SA TIME: ${saTime}
SESSION: ${sessionId} | REF: ${ref}

${leadBlock}
NEXT TARGET: ${nextTarget}

COMPANY FACTS — ONLY USE THESE. NEVER INVENT.
Company: Inkanyezi Technologies
Founder: Sanele (personal follow-up within 24h, Durban KZN)
Tagline: "We are the signal in the noise"
WhatsApp: +27 65 880 4122
Email: sishangesanele@gmail.com
Website: inkanyezi-tech.lovable.app

OUR 3 SERVICES (only these — never invent others):
1. Inkanyezi AUTOMATE — WhatsApp AI agents, website chatbots, workflow automation (Make.com), Google Sheets CRM, automated notifications. For businesses losing time to manual tasks.
2. Inkanyezi LEARN — AI training workshops for SA SME teams. In-person Durban + remote.
3. Inkanyezi GROW — AI strategy consulting, roadmapping, ROI analysis.

PRICING (honest — custom quotes only):
- Typical automation: R8,000–R45,000 once-off + optional R1,500–R6,000/month retainer
- FREE 30-min discovery call — no obligation
- POPIA-compliant data handling included

WHAT WE DO NOT DO: No mobile apps, no web design, no IT hosting.
CASE STUDY: Plumbkor PTY LTD (plumbing supply, Umgeni Business Park, Durban) — WhatsApp AI agent in progress.

ANTI-HALLUCINATION RULES:
1. NEVER invent case studies beyond Plumbkor
2. NEVER quote ROI numbers unless user provides their figures first
3. NEVER claim certifications or partnerships not listed
4. NEVER invent pricing outside the ranges given
5. If unsure: "Let me have Sanele confirm — he will reach out within 24 hours"
6. NEVER claim you can book meetings — collect details, Sanele follows up
7. NEVER name your AI model unless directly asked

AGENTIC BEHAVIOUR (every message):
THINK: What do I know? What is the single most valuable missing piece?
EXTRACT: Pull any new info from the user message into context.
RESPOND: Give genuine value first, then ask ONE focused question.

QUALIFICATION ORDER (natural conversation, not interrogation):
1. Business name + what they do
2. Industry/sector
3. Biggest pain point — what manual task costs them most time/money
4. Team size
5. Current tools (spreadsheets? WhatsApp groups? paper?)
6. Contact: WhatsApp or email
7. Offer free 30-min discovery call with Sanele

STYLE: Warm, direct, knowledgeable. Light SA warmth ("Sawubona", "sharp") naturally. ONE question per reply at the end. Natural paragraphs — not bullet lists.

ROI FRAMEWORKS (use with user's own numbers):
- Manual WhatsApp: "If your team spends X hours/day on replies, a bot handles 80% automatically 24/7"
- Data entry: "Automation saves 10-15 hours/week per staff member on manual capture"
- Lead response: "Responding within 5 minutes converts 9x more leads — our bots reply in 3 seconds"

RESPONSE FORMAT — ALWAYS USE THIS EXACT STRUCTURE:

<response>
[Your reply — warm, helpful, 2-4 short paragraphs. ONE question at the end.]
</response>
<context>
{
  "name": null,
  "business": null,
  "industry": null,
  "staff_count": null,
  "pain_point": null,
  "current_tools": null,
  "email": null,
  "whatsapp": null,
  "budget_signal": null,
  "qualification_stage": "new",
  "demo_booked": false,
  "referenceNumber": "${ref}",
  "service_interest": null,
  "notes": null
}
</context>

CONTEXT RULES:
- Fill any field extractable from the conversation. null for unknown.
- qualification_stage: new|exploring|interested|ready|objecting
- industry: plumbing|electrical|construction|healthcare|property|retail|transport|hospitality|professional|education|technology|other
- budget_signal: high|medium|low|null (infer, never ask)
- service_interest: automate|learn|grow|multiple|null
- demo_booked: true only if user explicitly agreed to a call
- referenceNumber: always "${ref}"`;
}

// ════════════════════════════════════════════════════════════════════
// RESPONSE PARSER
// ════════════════════════════════════════════════════════════════════
function parseResponse(rawText) {
  let message = rawText;
  let context  = null;
  try {
    const rMatch = rawText.match(/<response>([\s\S]*?)<\/response>/i);
    if (rMatch) message = rMatch[1].trim();
    const cMatch = rawText.match(/<context>([\s\S]*?)<\/context>/i);
    if (cMatch) context = JSON.parse(cMatch[1].trim());
  } catch {
    message = rawText
      .replace(/<response>|<\/response>/gi, '')
      .replace(/<context>[\s\S]*?<\/context>/gi, '')
      .trim();
  }
  return { message, context };
}

// ════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════
export async function POST(request) {
  const t0 = Date.now();

  try {
    let body;
    try { body = await request.json(); }
    catch {
      return new Response(
        JSON.stringify({ message: 'Invalid request.', context: null }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const { messages = [], sessionId = `s_${Date.now()}`, context: incoming = null } = body;

    if (!messages.length) {
      return new Response(
        JSON.stringify({ message: 'No messages.', context: null }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const userText = messages[messages.length - 1]?.content?.trim() || '';
    if (!userText) {
      return new Response(
        JSON.stringify({ message: 'Empty message.', context: incoming }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[InkanyeziBot] GEMINI_API_KEY not set in environment');
      return new Response(
        JSON.stringify({ message: 'Configuration error. Please contact us: +27 65 880 4122.', context: null }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // ── Build system prompt ───────────────────────────────────────
    const systemPrompt = buildSystemPrompt(incoming, sessionId);

    // ── Agentic thinking note injected into user message ──────────
    const thinkNote = `[THINK: known=${
      incoming
        ? `name=${incoming.name||'?'}, stage=${incoming.qualification_stage||'new'}, hasContact=${!!(incoming.email||incoming.whatsapp)}, painPoint=${incoming.pain_point?'yes':'no'}`
        : 'nothing yet'
    }, nextGoal=${
      !incoming?.name        ? 'learn name+business' :
      !incoming?.pain_point  ? 'understand pain point' :
      !incoming?.staff_count ? 'learn team size' :
      (!incoming?.email&&!incoming?.whatsapp) ? 'get contact details' :
      'confirm discovery call'
    }] `;

    // ── Build contents (conversation history + current message) ───
    const historyMsgs = messages.slice(0, -1).slice(-20);
    const contents = historyMsgs
      .filter(m => m.content?.trim())
      .map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.trim() }],
      }));

    // Current user message with thinking note prepended
    contents.push({
      role:  'user',
      parts: [{ text: thinkNote + userText }],
    });

    // ── Gemini REST request body ──────────────────────────────────
    const reqBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        temperature:     0.4,
        topP:            0.85,
        topK:            40,
        maxOutputTokens: 2048,
        candidateCount:  1,
        // Disable thinking for speed — chatbot does not need deep reasoning
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };

    // ── Call Gemini REST API ──────────────────────────────────────
    console.log(`[InkanyeziBot] ${GEMINI_MODEL} — session:${sessionId} msgs:${contents.length}`);
    const gemRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(reqBody),
    });

    if (!gemRes.ok) {
      const errText = await gemRes.text();
      console.error(`[InkanyeziBot] HTTP ${gemRes.status}:`, errText.slice(0, 600));

      const statusMsgs = {
        400: 'Invalid request. Please try rephrasing.',
        401: 'API key rejected. Contact us: +27 65 880 4122.',
        403: 'API access denied. Contact us: +27 65 880 4122.',
        404: 'AI model not found. Contact us: +27 65 880 4122.',
        429: 'Too many requests. Please try again in a moment.',
      };
      const userMsg = statusMsgs[gemRes.status] || 'Gemini service issue. Please try again shortly.';

      return new Response(
        JSON.stringify({ message: userMsg, context: null }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const data    = await gemRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      console.error('[InkanyeziBot] Empty response, finishReason:', finishReason, JSON.stringify(data).slice(0,300));
      const userMsg = finishReason === 'SAFETY'
        ? "I wasn't able to respond to that. Could you rephrase it?"
        : "I didn't get a response. Please try again.";
      return new Response(
        JSON.stringify({ message: userMsg, context: incoming }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    console.log(`[InkanyeziBot] OK in ${Date.now()-t0}ms, ${rawText.length} chars`);

    // ── Parse and merge context ───────────────────────────────────
    const { message, context: extracted } = parseResponse(rawText);

    const merged = {
      ...(incoming  || {}),
      ...(extracted || {}),
      name:           extracted?.name           || incoming?.name           || null,
      business:       extracted?.business       || incoming?.business       || null,
      industry:       extracted?.industry       || incoming?.industry       || null,
      staff_count:    extracted?.staff_count    || incoming?.staff_count    || null,
      pain_point:     extracted?.pain_point     || incoming?.pain_point     || null,
      current_tools:  extracted?.current_tools  || incoming?.current_tools  || null,
      email:          extracted?.email          || incoming?.email          || null,
      whatsapp:       extracted?.whatsapp       || incoming?.whatsapp       || null,
      budget_signal:  extracted?.budget_signal  || incoming?.budget_signal  || null,
      referenceNumber: incoming?.referenceNumber || extracted?.referenceNumber,
      sessionId,
      lastUpdated: new Date().toISOString(),
    };

    const finalMessage = message?.trim() ||
      "Sawubona! 👋 I'm InkanyeziBot. What does your business do, and what's the biggest challenge slowing you down right now?";

    return new Response(
      JSON.stringify({ message: finalMessage, context: merged, sessionId }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );

  } catch (err) {
    console.error(`[InkanyeziBot] Unhandled error after ${Date.now()-t0}ms:`, err?.message);
    console.error('[InkanyeziBot] Stack:', err?.stack?.slice(0,500));
    return new Response(
      JSON.stringify({
        message: 'Something went wrong. Please try again, or reach Sanele: wa.me/27658804122',
        context: null,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
}
