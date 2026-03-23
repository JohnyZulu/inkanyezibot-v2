// ════════════════════════════════════════════════════════════════════
// INKANYEZI AI BRAIN — app/api/chat/route.js
// SDK:     @google/genai  (new unified SDK — required for gemini 2.5+)
// Model:   gemini-2.5-flash  (current stable production model)
// Tokens:  2048 output — fixes truncation
// Temp:    0.4 — grounded, anti-hallucination
// ════════════════════════════════════════════════════════════════════

import { GoogleGenAI } from '@google/genai';

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
  if (context?.demo_booked)   known.push(`Demo booked: YES`);

  const leadBlock = known.length > 0
    ? `LEAD PROFILE (captured — do NOT ask again):\n${known.map(f=>`  • ${f}`).join('\n')}`
    : `LEAD PROFILE: Nothing yet. Begin qualification naturally.`;

  const nextTarget =
    !context?.name        ? 'their name and business description' :
    !context?.pain_point  ? 'their biggest operational challenge' :
    !context?.staff_count ? 'team size' :
    (!context?.email && !context?.whatsapp) ? 'WhatsApp or email for follow-up' :
    !context?.demo_booked ? 'free 30-min discovery call with Sanele' :
                            'deepen rapport and answer questions';

  return `You are InkanyeziBot — AI sales assistant for Inkanyezi Technologies, a Durban-based AI automation consultancy serving South African SMEs.

SA TIME: ${saTime}
SESSION: ${sessionId} | REF: ${ref}

${leadBlock}
NEXT TARGET: ${nextTarget}

═══════════════════════════════════════
COMPANY FACTS — USE ONLY THESE. NEVER INVENT.
═══════════════════════════════════════
Company: Inkanyezi Technologies
Founder: Sanele (24h follow-up, Durban KZN)
Tagline: "We are the signal in the noise"
WhatsApp: +27 65 880 4122
Email: sishangesanele@gmail.com

3 SERVICES (only these — never invent others):
1. AUTOMATE — WhatsApp AI agents, chatbots, Make.com workflows, Google Sheets CRM, auto notifications.
2. LEARN — AI workshops for SA SME staff. In-person Durban + remote.
3. GROW — AI strategy, roadmapping, ROI analysis.

PRICING: Custom quotes. Typical R8k–R45k once-off + optional R1.5k–R6k/month retainer. Free 30-min discovery call. POPIA-compliant.

WE DON'T DO: mobile apps, general web design, IT support outside our stack.

CASE STUDY: Plumbkor PTY LTD (plumbing supply, Durban) — WhatsApp AI agent in progress.

═══════════════════════════════════════
ANTI-HALLUCINATION RULES
═══════════════════════════════════════
1. Never invent case studies or results beyond Plumbkor above.
2. Never quote ROI % unless user gives you their own numbers first.
3. Never claim certifications, awards, or partners not listed.
4. Never invent pricing outside the ranges given.
5. If unsure: "Let me have Sanele confirm — he'll reach out within 24h."
6. Never claim to book meetings yourself — collect details, Sanele follows up.
7. Never identify your AI model unless directly asked.

═══════════════════════════════════════
BEHAVIOUR
═══════════════════════════════════════
Every message: THINK → EXTRACT new info → RESPOND.

RESPONSE LENGTH — CRITICAL:
- Maximum 3 sentences total per response. Not paragraphs — sentences.
- One sharp insight. One clear next step. One question.
- If you feel like writing more, cut it in half again.
- SA business owners are busy. Respect their time. Short = smart.

Style: Warm, direct, confident SA tech partner. "Sharp", "lekker" used once max per conversation. ONE question per response. Never stack questions.

EARLY FORM STRATEGY:
- After the user's FIRST message, the frontend will show a contact form.
- Your job from message 2 onwards is to have a warm conversation that REFERENCES what they put in the form.
- Do NOT ask for name, email, phone — the form captured that.
- DO ask about their pain point, tools, team size — things the form didn't capture.
- The form and conversation work together. You pick up where the form left off.

ROI (use with user's own numbers only):
- WhatsApp: bot handles 80% automatically, 24/7, no extra staff
- Data entry: saves 10-15h/week per person
- Lead speed: 9x more conversions responding in 3s vs 1 hour

═══════════════════════════════════════
RESPONSE FORMAT — ALWAYS BOTH BLOCKS
═══════════════════════════════════════
<response>
[MAX 3 SENTENCES. One insight. One next step or value statement. One question. No padding, no filler.]
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

Fill what you know, null for unknowns. Never guess.
qualification_stage: new|exploring|interested|ready|objecting
industry: plumbing|electrical|construction|healthcare|property|retail|transport|hospitality|professional|education|technology|other
budget_signal: high|medium|low|null (infer, never ask)
service_interest: automate|learn|grow|multiple|null
demo_booked: true only if user explicitly agreed
referenceNumber: always "${ref}"`;
}

// ════════════════════════════════════════════════════════════════════
// PARSER
// ════════════════════════════════════════════════════════════════════
function parseAIResponse(rawText) {
  let message = rawText;
  let context  = null;
  try {
    const rm = rawText.match(/<response>([\s\S]*?)<\/response>/i);
    if (rm) message = rm[1].trim();
    const cm = rawText.match(/<context>([\s\S]*?)<\/context>/i);
    if (cm) context = JSON.parse(cm[1].trim());
  } catch (e) {
    console.error('[InkanyeziBot] Parse error:', e.message);
    message = rawText.replace(/<response>|<\/response>/gi,'').replace(/<context>[\s\S]*?<\/context>/gi,'').trim();
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
    catch { return new Response(JSON.stringify({message:'Invalid request.',context:null}),{status:400,headers:{'Content-Type':'application/json',...CORS}}); }

    const { messages=[], sessionId=`s_${Date.now()}`, context:incoming=null } = body;

    if (!messages?.length) return new Response(JSON.stringify({message:'No messages.',context:null}),{status:400,headers:{'Content-Type':'application/json',...CORS}});

    const userText = messages[messages.length-1]?.content?.trim()||'';
    if (!userText) return new Response(JSON.stringify({message:'Empty.',context:incoming}),{status:400,headers:{'Content-Type':'application/json',...CORS}});

    if (!process.env.GEMINI_API_KEY) {
      console.error('[InkanyeziBot] GEMINI_API_KEY not set');
      return new Response(JSON.stringify({message:'Configuration error. WhatsApp us: +27 65 880 4122.',context:null}),{status:500,headers:{'Content-Type':'application/json',...CORS}});
    }

    // ── NEW SDK INIT ──────────────────────────────────────────────
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemPrompt = buildSystemPrompt(incoming, sessionId);

    const formShown = !!(incoming?.name || incoming?.email);
    const thinkingPrefix = `[THINK] Known: ${incoming?`name=${incoming.name||'?'},stage=${incoming.qualification_stage||'new'},pain=${incoming.pain_point?'yes':'no'}`:'nothing yet'}. Form captured contact: ${formShown?'YES — never ask for name/email/phone again':'NO — first message, be warm, form shows after this'}. My job: ${!incoming?.name?'Acknowledge warmly in 2 sentences max, the form will capture contact details':'Ask about '+(!incoming?.pain_point?'their specific pain point':!incoming?.staff_count?'team size':'next steps')+' in ONE focused sentence'}. MAX 3 SENTENCES TOTAL. [/THINK]\n\nUser: ${userText}`;

    // Build history — last 20 messages excluding current
    const history = messages.slice(0,-1).slice(-20)
      .map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:String(m.content||'').trim()}]}))
      .filter(m=>m.parts[0].text!=='');

    const contents = [...history, {role:'user',parts:[{text:thinkingPrefix}]}];

    console.log(`[InkanyeziBot] gemini-2.5-flash | session:${sessionId} | stage:${incoming?.qualification_stage||'new'} | history:${history.length}`);

    // ── API CALL using new @google/genai SDK ──────────────────────
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature:       0.4,
        topP:              0.85,
        topK:              40,
        maxOutputTokens:   2048,
      },
    });

    const raw = response.text;
    console.log(`[InkanyeziBot] Done in ${Date.now()-t0}ms | ${raw?.length||0} chars`);

    const { message, context: extracted } = parseAIResponse(raw||'');

    // Merge — never lose captured data
    const merged = {
      ...(incoming||{}), ...(extracted||{}),
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

    const final = message?.trim() || "Sawubona! 👋 I'm InkanyeziBot. What does your business do, and what's the biggest challenge slowing you down right now?";

    return new Response(JSON.stringify({message:final,context:merged,sessionId}),{status:200,headers:{'Content-Type':'application/json',...CORS}});

  } catch (error) {
    console.error(`[InkanyeziBot] Error (${Date.now()-t0}ms):`, error?.message);
    console.error('[InkanyeziBot] Stack:', error?.stack?.slice(0,500));

    let msg = 'Something went wrong. Please try again or WhatsApp: +27 65 880 4122.';
    if (error?.message) {
      const e = error.message.toLowerCase();
      if (e.includes('401')||e.includes('api_key')||e.includes('unauthenticated'))
        msg = 'API key issue. Contact us: +27 65 880 4122.';
      else if (e.includes('429')||e.includes('quota'))
        msg = 'Very busy right now — please try again in a moment or WhatsApp: +27 65 880 4122.';
      else if (e.includes('404')||e.includes('not found')||e.includes('model'))
        msg = 'AI model issue. Contact us: +27 65 880 4122.';
    }

    return new Response(JSON.stringify({message:msg,context:null}),{status:500,headers:{'Content-Type':'application/json',...CORS}});
  }
}
