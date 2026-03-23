// ════════════════════════════════════════════════════════════════════
// INKANYEZI AI BRAIN — app/api/chat/route.js
// ════════════════════════════════════════════════════════════════════
// Model:       gemini-2.5-flash  ← current stable production model
//              (Gemini 1.5 = retired/404, Gemini 2.0 = retiring June 2026)
// maxTokens:   2048  — fixes response truncation
// temperature: 0.4   — grounded, reduced hallucination
// Agentic:     THINK → QUALIFY → RESPOND loop
// Lead engine: structured JSON context extracted every message
// Anti-halluc: grounded facts block + strict prohibition rules
// POPIA:       compliant — no sensitive data stored server-side
// ════════════════════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── CORS ─────────────────────────────────────────────────────────────
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
// SYSTEM PROMPT — THE BRAIN
// ════════════════════════════════════════════════════════════════════
function buildSystemPrompt(context, sessionId) {
  const saTime = getSATime();
  const ref    = context?.referenceNumber || generateRef(context?.industry);

  // Build lead profile block from known context
  const known = [];
  if (context?.name)          known.push(`Name: ${context.name}`);
  if (context?.business)      known.push(`Business: ${context.business}`);
  if (context?.industry)      known.push(`Industry: ${context.industry}`);
  if (context?.staff_count)   known.push(`Staff: ${context.staff_count}`);
  if (context?.pain_point)    known.push(`Pain point: ${context.pain_point}`);
  if (context?.current_tools) known.push(`Current tools: ${context.current_tools}`);
  if (context?.email)         known.push(`Email: ${context.email}`);
  if (context?.whatsapp)      known.push(`WhatsApp: ${context.whatsapp}`);
  if (context?.budget_signal) known.push(`Budget: ${context.budget_signal}`);
  if (context?.demo_booked)   known.push(`Demo booked: YES`);

  const leadBlock = known.length > 0
    ? `LEAD PROFILE (already captured — DO NOT ask for these again):\n${known.map(f => `  • ${f}`).join('\n')}`
    : `LEAD PROFILE: Nothing captured yet. Begin qualification naturally.`;

  const nextTarget =
    !context?.name        ? 'their name and what their business does' :
    !context?.pain_point  ? 'their biggest operational challenge' :
    !context?.staff_count ? 'their team size' :
    (!context?.email && !context?.whatsapp) ? 'their WhatsApp number or email so Sanele can follow up' :
    !context?.demo_booked ? 'booking the free 30-min discovery call with Sanele' :
                            'answering any remaining questions and deepening rapport';

  return `You are InkanyeziBot — the intelligent AI sales assistant for Inkanyezi Technologies, a Durban-based AI automation consultancy serving South African SMEs.

CURRENT SA TIME: ${saTime}
SESSION: ${sessionId} | REFERENCE: ${ref}

${leadBlock}
NEXT QUALIFICATION TARGET: ${nextTarget}

═══════════════════════════════════════════════════
COMPANY FACTS — USE ONLY THESE. NEVER INVENT.
═══════════════════════════════════════════════════
Company: Inkanyezi Technologies
Founder: Sanele (personal follow-up within 24h, based in Durban, KZN)
Tagline: "We are the signal in the noise"
WhatsApp: +27 65 880 4122
Email: sishangesanele@gmail.com
Website: inkanyezi-tech.lovable.app

OUR 3 SERVICES (these are the ONLY services we offer — never invent others):

1. Inkanyezi AUTOMATE
   What: WhatsApp AI agents, website chatbots, workflow automation (Make.com),
         Google Sheets CRM, automated email/WhatsApp notification pipelines.
   Who:  Businesses losing time to manual, repetitive tasks.
   Pain: Quoting, follow-ups, lead capture, appointment bookings done manually.

2. Inkanyezi LEARN
   What: AI training workshops for SA SME teams.
   Who:  Business owners and staff who want to use AI tools productively.
   Format: In-person Durban sessions + remote delivery SA-wide.

3. Inkanyezi GROW
   What: AI strategy consulting — roadmapping, opportunity identification, ROI analysis.
   Who:  Businesses wanting a full AI transformation plan before implementation.

PRICING (be honest — we do not publish fixed prices):
- Custom quotes based on scope, business size, and complexity.
- Typical automation projects: R8,000–R45,000 once-off setup.
- Optional monthly retainer: R1,500–R6,000/month for ongoing support.
- Free 30-minute discovery call — no obligation, no cost.
- POPIA-compliant data handling included in all projects.

WHAT WE DO NOT DO (say no clearly):
- No custom mobile app development.
- No general web design services.
- No IT support or managed hosting unrelated to our automation stack.
- No offices outside Durban — remote delivery available SA-wide.

ACTIVE CASE STUDY:
- Plumbkor PTY LTD (plumbing supply, Umgeni Business Park, Durban) — demo client.
  Currently building: WhatsApp AI agent + automated lead qualification pipeline.
  Results: in progress (not yet published).

═══════════════════════════════════════════════════
ANTI-HALLUCINATION RULES — STRICTLY ENFORCE
═══════════════════════════════════════════════════
1. NEVER invent case studies, client names, or results beyond the Plumbkor case above.
2. NEVER quote specific ROI percentages or time-savings unless the user provides their own numbers first — then you may use their numbers in a calculation.
3. NEVER claim certifications, partnerships, or awards not listed here.
4. NEVER invent pricing outside the honest ranges given above.
5. If unsure about anything: say "That's a great one — let me have Sanele confirm the details for you. He'll reach out within 24 hours."
6. NEVER claim to be able to book or schedule meetings yourself — collect their details, Sanele follows up personally.
7. NEVER identify yourself as a specific AI model unless the user asks directly.

═══════════════════════════════════════════════════
AGENTIC BEHAVIOUR — HOW TO OPERATE
═══════════════════════════════════════════════════
On every single message you receive, follow this loop:

STEP 1 — THINK:
  What do I already know about this lead?
  What is the single most valuable piece of information I am still missing?
  Is there a better way to deliver value in this response?

STEP 2 — EXTRACT:
  Pull any new information from the user's message and include it in <context>.
  Even partial information counts — a mention of "we use spreadsheets" tells you their current_tools.

STEP 3 — RESPOND:
  Give a genuinely helpful, warm response first.
  Then ask exactly ONE focused question to advance the qualification.
  Never stack multiple questions. Never interrogate. Feel like a trusted advisor.

QUALIFICATION PIPELINE — work through these naturally, in order:
[ ] Business name and what they do
[ ] Industry / sector
[ ] Biggest operational pain point (what manual task is costing them the most time/money)
[ ] Team size (helps scope the solution)
[ ] Current tools in use (spreadsheets? WhatsApp groups? paper? accounting software?)
[ ] Budget awareness (infer from context — high/medium/low — don't ask directly)
[ ] Contact details — WhatsApp number or email for Sanele to follow up
[ ] Discovery call — offer the free 30-minute session with Sanele

CONVERSATION STYLE:
- Warm, direct, knowledgeable — like a trusted SA tech partner, not a scripted bot.
- Light SA warmth: use "Sawubona", "sharp", "lekker" naturally and sparingly.
- ONE question per response, always at the end.
- Provide genuine insight about automation before asking for commitment.
- When you have name + pain point + contact info, confirm their reference number and tell them Sanele will be in touch within 24 hours.

ROI CALCULATION FRAMEWORKS (use these when the user gives you their own numbers):
- Manual WhatsApp replies: "If your team spends [X] hours/day on WhatsApp replies, a bot handles 80% of that automatically, 24/7, without extra staff."
- Data entry: "Automation typically saves 10-15 hours/week per staff member on manual data capture."
- Missed leads: "Businesses that respond within 5 minutes convert 9x more leads than those that take an hour — our bots respond in 3 seconds."
- Quoting: "If you could get quotes out 3x faster, how many more jobs could you win per month?"

═══════════════════════════════════════════════════
RESPONSE FORMAT — ALWAYS USE THIS EXACT STRUCTURE
═══════════════════════════════════════════════════
Every single response MUST contain both <response> and <context> blocks.
Missing either block will break the lead capture pipeline.

<response>
[Your conversational reply — warm, genuinely helpful, 2-4 short paragraphs.
 End with exactly ONE question. Never use bullet points in the response itself —
 write naturally like a person, not a list.]
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

CONTEXT FIELD RULES:
- Fill every field you can extract from the full conversation so far.
- Use null for anything not yet known — never guess or invent values.
- qualification_stage: one of new | exploring | interested | ready | objecting
- industry: one of plumbing | electrical | construction | healthcare | property | retail | transport | hospitality | professional | education | technology | other
- budget_signal: one of high | medium | low | null (infer from language, never ask)
- service_interest: one of automate | learn | grow | multiple | null
- demo_booked: true ONLY if user has explicitly agreed to a call
- referenceNumber: always "${ref}" — never change this value
- notes: any detail useful for Sanele's follow-up that doesn't fit other fields`;
}

// ════════════════════════════════════════════════════════════════════
// RESPONSE PARSER — extracts message + context from AI output
// ════════════════════════════════════════════════════════════════════
function parseAIResponse(rawText) {
  let message = rawText;
  let context  = null;

  try {
    const responseMatch = rawText.match(/<response>([\s\S]*?)<\/response>/i);
    if (responseMatch) {
      message = responseMatch[1].trim();
    }

    const contextMatch = rawText.match(/<context>([\s\S]*?)<\/context>/i);
    if (contextMatch) {
      const jsonStr = contextMatch[1].trim();
      context = JSON.parse(jsonStr);
    }
  } catch (parseErr) {
    console.error('[InkanyeziBot] Parse error:', parseErr.message);
    // Strip tags gracefully — never crash
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
  const startTime = Date.now();

  try {
    // ── PARSE REQUEST ────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ message: 'Invalid request format.', context: null }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const {
      messages          = [],
      sessionId         = `session_${Date.now()}`,
      context: incoming = null,
    } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No messages provided.', context: null }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    const lastMessage = messages[messages.length - 1];
    const userText    = lastMessage?.content?.trim() || '';

    if (!userText) {
      return new Response(
        JSON.stringify({ message: 'Empty message.', context: incoming }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // ── API KEY CHECK ─────────────────────────────────────────────
    if (!process.env.GEMINI_API_KEY) {
      console.error('[InkanyeziBot] CRITICAL: GEMINI_API_KEY env variable is not set');
      return new Response(
        JSON.stringify({
          message: 'Configuration issue on our end. Please reach Sanele directly on WhatsApp: +27 65 880 4122.',
          context: null,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // ── BUILD SYSTEM PROMPT ───────────────────────────────────────
    const systemPrompt = buildSystemPrompt(incoming, sessionId);

    // ── AGENTIC THINKING PREFIX ───────────────────────────────────
    // This injected reasoning step guides the model to think before
    // responding — significantly reduces hallucination and keeps the
    // conversation on track for lead qualification.
    const thinkingPrefix = `[AGENT THINK — internal reasoning, not shown to user]
What I know so far: ${
  incoming
    ? `name=${incoming.name || 'unknown'}, industry=${incoming.industry || 'unknown'}, stage=${incoming.qualification_stage || 'new'}, hasEmail=${!!incoming.email}, hasWhatsApp=${!!incoming.whatsapp}, painPoint=${incoming.pain_point ? 'captured' : 'missing'}`
    : 'nothing yet — first message'
}
My next goal: ${
  !incoming?.name        ? 'Learn their name and what their business does' :
  !incoming?.pain_point  ? 'Understand their biggest operational pain point' :
  !incoming?.staff_count ? 'Learn their team size to scope the solution' :
  (!incoming?.email && !incoming?.whatsapp) ? 'Get their contact details (WhatsApp or email)' :
  !incoming?.demo_booked ? 'Offer and confirm the free 30-min discovery call with Sanele' :
                           'Deepen rapport and answer any remaining questions'
}
Quality check: Am I about to invent any facts, case studies, or numbers not in my brief? If yes, I will NOT say them.
[END THINK]

User message: ${userText}`;

    // ── CONVERSATION HISTORY ──────────────────────────────────────
    // Keep last 20 messages (10 turns) — good context without token waste
    const history = messages
      .slice(0, -1)   // exclude the current message
      .slice(-20)     // cap at 20 for efficiency
      .map(msg => ({
        role:  msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(msg.content || '').trim() }],
      }))
      .filter(msg => msg.parts[0].text !== '');

    // ── MODEL: gemini-2.5-flash ───────────────────────────────────
    // The current stable production model as of March 2026.
    // Gemini 1.5 = retired (404). Gemini 2.0 = retiring June 2026.
    // Gemini 2.5 Flash = best price-performance, stable, production-ready.
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature:     0.4,    // Low = grounded, reduced hallucination
        topP:            0.85,
        topK:            40,
        maxOutputTokens: 2048,   // Fixes truncation — was likely 256 before
        candidateCount:  1,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    });

    console.log(`[InkanyeziBot] gemini-2.5-flash call — session: ${sessionId}, stage: ${incoming?.qualification_stage || 'new'}, history: ${history.length} msgs`);

    // ── SEND MESSAGE ──────────────────────────────────────────────
    const chat   = model.startChat({ history });
    const result = await chat.sendMessage(thinkingPrefix);
    const raw    = result.response.text();

    console.log(`[InkanyeziBot] Response in ${Date.now() - startTime}ms, ${raw.length} chars`);

    // ── PARSE RESPONSE + CONTEXT ──────────────────────────────────
    const { message, context: extracted } = parseAIResponse(raw);

    // ── MERGE CONTEXTS ────────────────────────────────────────────
    // Never overwrite a captured value with null — accumulate knowledge
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
      "Sawubona! 👋 I'm InkanyeziBot — your guide to AI automation for South African businesses. What does your business do, and what's the biggest challenge slowing you down right now?";

    return new Response(
      JSON.stringify({ message: finalMessage, context: merged, sessionId }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    );

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[InkanyeziBot] Error after ${elapsed}ms:`, error?.message || error);
    console.error('[InkanyeziBot] Stack:', error?.stack?.slice(0, 800));

    // Categorised error messages — never expose internals to the user
    let userMsg = 'Something went wrong on our end. Please try again, or reach Sanele directly: wa.me/27658804122';

    if (error?.message) {
      const msg = error.message.toLowerCase();
      if (msg.includes('api_key') || msg.includes('401') || msg.includes('unauthenticated')) {
        userMsg = 'API authentication issue. Please contact Inkanyezi Technologies: +27 65 880 4122.';
        console.error('[InkanyeziBot] ← CHECK GEMINI_API_KEY ENV VARIABLE IN VERCEL SETTINGS');
      } else if (msg.includes('quota') || msg.includes('429') || msg.includes('rate limit')) {
        userMsg = 'I\'m handling a lot of conversations right now! Please try again in a moment, or WhatsApp us: +27 65 880 4122.';
      } else if (msg.includes('model') || msg.includes('not found') || msg.includes('404')) {
        userMsg = 'AI model issue on our end. Please contact Inkanyezi Technologies: +27 65 880 4122.';
        console.error('[InkanyeziBot] ← MODEL NOT FOUND — verify gemini-2.5-flash is available on this API key');
      } else if (msg.includes('safety') || msg.includes('blocked')) {
        userMsg = 'I wasn\'t able to process that message. Could you rephrase it? Or reach us on WhatsApp: +27 65 880 4122.';
      } else if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch')) {
        userMsg = 'Network timeout. Please try again in a moment.';
      }
    }

    return new Response(
      JSON.stringify({ message: userMsg, context: null }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    );
  }
}
