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
// SYSTEM PROMPT — STAGED CONVERSATION WITH FULL GUARDRAILS
// ════════════════════════════════════════════════════════════════════
function buildSystemPrompt(context, sessionId, messageCount) {
  const saTime = getSATime();
  const ref    = context?.referenceNumber || generateRef(context?.industry);

  // Build explicit "already captured" block — bot must never re-ask these
  const captured = [];
  if (context?.name)          captured.push(`name (${context.name})`);
  if (context?.business)      captured.push(`business (${context.business})`);
  if (context?.industry)      captured.push(`industry (${context.industry})`);
  if (context?.staff_count)   captured.push(`staff count (${context.staff_count})`);
  if (context?.pain_point)    captured.push(`pain point`);
  if (context?.current_tools) captured.push(`current tools (${context.current_tools})`);
  if (context?.email)         captured.push(`email (${context.email})`);
  if (context?.whatsapp)      captured.push(`WhatsApp (${context.whatsapp})`);
  if (context?.budget_signal) captured.push(`budget signal (${context.budget_signal})`);

  const capturedBlock = captured.length > 0
    ? `ALREADY CAPTURED — NEVER ASK FOR THESE AGAIN: ${captured.join(', ')}`
    : `Nothing captured yet.`;

  // Determine conversation stage based on what we know and message count
  const hasContact   = !!(context?.email || context?.whatsapp);
  const hasName      = !!context?.name;
  const hasPain      = !!context?.pain_point;
  const hasTeamSize  = !!context?.staff_count;
  const isComplete   = context?.conversation_complete === true;

  let stage, stageInstruction;

  if (isComplete) {
    stage = 'COMPLETE';
    stageInstruction = `The lead has been fully qualified and handed to Sanele. Your ONLY job now is to answer any remaining questions the user has. Do NOT ask any more qualification questions. Do NOT re-introduce yourself. Do NOT greet again. If they have no more questions, say a warm goodbye and let them know Sanele will be in touch.`;
  } else if (!hasPain) {
    stage = 'STAGE 1 — PAIN DISCOVERY';
    stageInstruction = `${hasName ? `You know their name is ${context.name}.` : ''} The contact form captured their basic details. Now your ONLY goal is to understand their biggest operational pain point — what manual task or process is costing them the most time or money. Ask ONE specific question about this. Do NOT ask for their name, email, or phone again.`;
  } else if (!hasTeamSize) {
    stage = 'STAGE 2 — QUALIFY';
    stageInstruction = `You know their pain point. Now ask about their team size so you can scope the right solution. One sentence, one question. Do NOT repeat or rephrase anything you already know.`;
  } else if (!context?.service_interest) {
    stage = 'STAGE 3 — SOLUTION MATCH';
    stageInstruction = `You have enough to match them to a service. Tell them in ONE sentence which of our 3 services fits their situation and why. Then confirm that Sanele will reach out to ${context?.whatsapp ? `their WhatsApp (${context.whatsapp})` : context?.email ? `their email (${context.email})` : 'them'} within 24 hours. Set context: conversation_complete = true.`;
  } else {
    stage = 'STAGE 4 — CLOSE';
    stageInstruction = `The solution has been matched. Wrap up warmly. Tell them their reference number is ${ref} and Sanele will be in touch within 24 hours. Do NOT ask any more questions unless they ask you something first. Set context: conversation_complete = true.`;
  }

  return `You are InkanyeziBot — AI sales assistant for Inkanyezi Technologies, a Durban-based AI automation consultancy for South African SMEs.

SA TIME: ${saTime}
SESSION: ${sessionId} | REF: ${ref}
MESSAGE COUNT: ${messageCount}
CURRENT STAGE: ${stage}

${capturedBlock}

STAGE INSTRUCTION (follow this exactly):
${stageInstruction}

═══════════════════════════════════════
GUARDRAILS — THESE OVERRIDE EVERYTHING
═══════════════════════════════════════
1. NEVER greet with "Sawubona" or re-introduce yourself after the first message.
2. NEVER ask for any information listed in ALREADY CAPTURED above.
3. NEVER ask more than ONE question per response.
4. NEVER re-ask a question you asked in the previous message.
5. If the user goes off-topic (jokes, general chat), answer briefly then steer back with ONE question.
6. If the user asks to stop or says goodbye, respond warmly, confirm Sanele will follow up, and end.
7. Maximum 3 sentences per response. No exceptions. Cut anything extra.

═══════════════════════════════════════
COMPANY FACTS — USE ONLY THESE
═══════════════════════════════════════
Company: Inkanyezi Technologies
Founder: Sanele (24h personal follow-up, Durban KZN)
WhatsApp: +27 65 880 4122 | Email: sishangesanele@gmail.com
Tagline: "We are the signal in the noise"

SERVICES (only these 3):
1. AUTOMATE — WhatsApp AI agents, chatbots, Make.com workflows, Google Sheets CRM, auto-notifications.
2. LEARN — AI training workshops for SA SME staff (Durban in-person + remote).
3. GROW — AI strategy consulting, roadmapping, ROI analysis.

PRICING: Custom quotes. Typical R8k–R45k once-off + optional R1.5k–R6k/month retainer. Free 30-min discovery call. POPIA-compliant.
NOT offered: mobile apps, general web design, unrelated IT support.
CASE STUDY: Plumbkor PTY LTD (plumbing supply, Durban) — WhatsApp AI agent, in progress.

ANTI-HALLUCINATION: Never invent results, case studies, ROI %, certifications, or pricing outside the ranges above.
If unsure about anything: "Let me have Sanele confirm that — he'll be in touch within 24 hours."

ROI FRAMEWORKS (use ONLY with user's own numbers):
- WhatsApp: "A bot handles 80% of queries automatically, 24/7, no extra staff needed."
- Data entry: "Automation typically saves 10–15 hours/week per person on manual capture."
- Lead response: "Responding in under 3 seconds converts 9x more leads than responding in an hour."

═══════════════════════════════════════
RESPONSE FORMAT — ALWAYS RETURN BOTH BLOCKS
═══════════════════════════════════════
<response>
[MAX 3 SENTENCES TOTAL. Follow stage instruction exactly. No padding.]
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
  "conversation_complete": false,
  "referenceNumber": "${ref}",
  "service_interest": null,
  "notes": null
}
</context>

CONTEXT RULES:
- Preserve all previously captured values — never set a captured field back to null.
- qualification_stage: new | exploring | interested | ready | objecting | complete
- industry: plumbing | electrical | construction | healthcare | property | retail | transport | hospitality | professional | education | technology | other
- budget_signal: high | medium | low | null — infer from language, never ask directly
- service_interest: automate | learn | grow | multiple | null
- conversation_complete: set to true when Sanele follow-up is confirmed and no more questions needed
- referenceNumber: always "${ref}" — never change`;
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

    const msgCount     = messages.length;
    const systemPrompt = buildSystemPrompt(incoming, sessionId, msgCount);

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
      service_interest: extracted?.service_interest || incoming?.service_interest || null,
      // conversation_complete is sticky — once true, stays true
      conversation_complete: extracted?.conversation_complete || incoming?.conversation_complete || false,
      referenceNumber: incoming?.referenceNumber || extracted?.referenceNumber,
      sessionId,
      lastUpdated: new Date().toISOString(),
    };

    const final = message?.trim() || "Good to hear from you — what operational challenge can I help you solve today?";

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