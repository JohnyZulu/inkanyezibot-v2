// ════════════════════════════════════════════════════════════════════
// INKANYEZI AI BRAIN — app/api/chat/route.js  v8
// SDK:     @google/genai
// Model:   gemini-2.5-flash
// Changes: Stable ref generation, guaranteed webhook payload,
//          name captured from first user message as fallback
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

// ── HELPERS ──────────────────────────────────────────────────────────
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

// ── EXTRACT REAL NAME from message history ───────────────────────────
// Looks for "I am X", "my name is X", "this is X" patterns
// Falls back to first word of first user message
function extractNameFromMessages(messages) {
  const namePatterns = [
    /(?:i(?:'?m| am)|my name is|this is|call me)\s+([A-Z][a-z]+)/i,
    /^([A-Z][a-z]+)\s+(?:here|speaking)/i,
  ];
  for (const msg of messages.filter(m => m.role === 'user')) {
    for (const pattern of namePatterns) {
      const match = msg.content?.match(pattern);
      if (match && match[1] && match[1].length > 2) return match[1];
    }
  }
  // Final fallback: first word of first user message if it looks like a name
  const firstWord = messages.find(m => m.role === 'user')?.content?.trim()?.split(/\s+/)[0] || '';
  return firstWord.length > 2 && /^[A-Za-z]+$/.test(firstWord) ? firstWord : 'there';
}

// ════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ════════════════════════════════════════════════════════════════════
function buildSystemPrompt(context, sessionId, messageCount, stableRef) {
  const saTime = getSATime();

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

  const hasPain    = !!context?.pain_point;
  const isComplete = context?.conversation_complete === true;

  let stage, stageInstruction;

  if (isComplete) {
    stage = 'COMPLETE';
    stageInstruction = `Lead fully qualified. ONLY answer remaining questions. Do NOT ask qualification questions. Say a warm goodbye if they have nothing else.`;
  } else if (!hasPain) {
    stage = 'STAGE 1 — PAIN DISCOVERY';
    stageInstruction = `${context?.name ? `You know their name is ${context.name}.` : ''} Ask ONE focused question: what is the single biggest manual task or process costing their business the most time or money right now? Do NOT ask for name, email, or phone.`;
  } else {
    stage = 'STAGE 2 — SOLUTION MATCH & CLOSE';
    stageInstruction = `You know their pain point. In ONE sentence tell them which of our 3 services fits their situation and exactly why. Then say: "Your reference is ${stableRef} — Sanele will personally reach out within 24 hours." Set conversation_complete = true and set service_interest. Do NOT ask any further questions.`;
  }

  return `You are InkanyeziBot — AI sales assistant for Inkanyezi Technologies, a Durban-based AI automation consultancy for South African SMEs.

SA TIME: ${saTime}
SESSION: ${sessionId} | REF: ${stableRef}
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
5. If the user goes off-topic, answer briefly then steer back with ONE question.
6. If the user asks to stop or says goodbye, confirm Sanele will follow up and end.
7. Maximum 3 sentences per response. No exceptions.

═══════════════════════════════════════
COMPANY FACTS — USE ONLY THESE
═══════════════════════════════════════
Company: Inkanyezi Technologies
Founder: Sanele (24h personal follow-up, Durban KZN)
WhatsApp: +27 65 880 4122 | Email: inkanyeziaisolutions3@gmail.com
Tagline: "We are the signal in the noise"

SERVICES (only these 3):
1. AUTOMATE — WhatsApp AI agents, chatbots, Make.com workflows, Google Sheets CRM, auto-notifications.
2. LEARN — AI training workshops for SA SME staff (Durban in-person + remote).
3. GROW — AI strategy consulting, roadmapping, ROI analysis.

PRICING: Custom quotes. Typical R8k–R45k once-off + optional R1.5k–R6k/month retainer. Free 30-min discovery call. POPIA-compliant.
NOT offered: mobile apps, general web design, unrelated IT support.
CASE STUDY: Plumbkor PTY LTD (plumbing supply, Durban) — WhatsApp AI agent, in progress.

ANTI-HALLUCINATION: Never invent results, case studies, ROI %, certifications, or pricing outside the ranges above.
If unsure: "Let me have Sanele confirm that — he will be in touch within 24 hours."

═══════════════════════════════════════
MULTILINGUAL — SOUTH AFRICAN IDENTITY
═══════════════════════════════════════
You are fluent in isiZulu, Afrikaans, and English. MATCH THE LANGUAGE THE USER WRITES IN.
- isiZulu written → reply fully in isiZulu
- Afrikaans written → reply fully in Afrikaans
- English written → reply in English
- Mixed (code-switch) → mirror their mix naturally
- Always greet NEW conversations with "Sawubona!"

KEY ZULU PHRASES: Sawubona (hello), Ngiyabonga (thank you), Kulungile (OK),
Ngiyakuzwa (I understand), Hamba kahle (go well), Sharp sharp (great/understood), Eish (surprise/concern).

KEY AFRIKAANS PHRASES: Goeie dag (hello), Baie dankie (thank you), Totsiens (goodbye), Lekker (great).

SA CULTURAL CONTEXT: Understand load shedding, township economy, Ubuntu philosophy, Durban/KZN context.
Most SA SMEs run lean with 1-20 staff.

ROI FRAMEWORKS (only use with user's own numbers):
- WhatsApp: "A bot handles 80% of queries automatically, 24/7, no extra staff needed."
- Data entry: "Automation typically saves 10-15 hours/week per person on manual capture."
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
  "referenceNumber": "${stableRef}",
  "service_interest": null,
  "notes": null
}
</context>

CONTEXT RULES:
- Preserve ALL previously captured values — NEVER set a captured field back to null.
- referenceNumber: ALWAYS "${stableRef}" — never change, never generate a new one.
- qualification_stage: new | exploring | interested | ready | complete
- industry: plumbing | electrical | construction | healthcare | property | retail | transport | hospitality | professional | education | technology | other
- budget_signal: high | medium | low | null — infer from language, never ask directly
- service_interest: automate | learn | grow | multiple | null
- conversation_complete: set to true ONLY when you have given them the ref number and confirmed Sanele will follow up`;
}

// ── PARSER ────────────────────────────────────────────────────────────
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

    // ── STABLE REF — generated ONCE per session, never changes ───────
    // Use existing ref from context, else generate a new one for this session
    const stableRef = incoming?.referenceNumber || generateRef(incoming?.industry);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const msgCount     = messages.length;
    const systemPrompt = buildSystemPrompt(incoming, sessionId, msgCount, stableRef);

    const formShown = !!(incoming?.name || incoming?.email);
    const thinkingPrefix = `[THINK] Known: name=${incoming?.name||'?'}, pain=${incoming?.pain_point?'yes':'no'}, stage=${incoming?.qualification_stage||'new'}. Form captured contact: ${formShown?'YES':'NO'}. MAX 3 SENTENCES. [/THINK]\n\nUser: ${userText}`;

    const history = messages.slice(0,-1).slice(-20)
      .map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:String(m.content||'').trim()}]}))
      .filter(m=>m.parts[0].text!=='');

    const contents = [...history, {role:'user',parts:[{text:thinkingPrefix}]}];

    console.log(`[InkanyeziBot] gemini-2.5-flash | session:${sessionId} | ref:${stableRef} | stage:${incoming?.qualification_stage||'new'} | msgs:${msgCount}`);

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

    // ── MERGE — never lose captured data, always keep stableRef ─────
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
      conversation_complete: extracted?.conversation_complete || incoming?.conversation_complete || false,
      referenceNumber: stableRef, // always use the stable ref, never extracted one
      sessionId,
      lastUpdated: new Date().toISOString(),
    };

    const final = message?.trim() || "Good to hear from you — what operational challenge can I help you solve today?";

    // ── FIRE MAKE WEBHOOK — once when conversation first completes ───
    const justCompleted = merged.conversation_complete === true
                       && incoming?.conversation_complete !== true;

    if (justCompleted && process.env.MAKE_WEBHOOK_URL) {
      // Resolve name: context > pattern match > fallback
      const resolvedName = merged.name || extractNameFromMessages(messages) || 'Unknown';

      const webhookPayload = {
        name:                 resolvedName,
        email:                merged.email            || '',
        phone:                merged.whatsapp         || '',
        company:              merged.business         || '',
        industry:             merged.industry         || '',
        service_interest:     merged.service_interest || '',
        pain_point:           merged.pain_point       || '',
        message:              merged.pain_point       || '',
        reference_number:     stableRef,
        qualification_stage:  'complete',
        budget_signal:        merged.budget_signal    || '',
        conversation_summary: messages.slice(-10)
          .map(m => (m.role === 'user' ? 'Customer' : 'Bot') + ': ' + (m.content||'').replace(/\n/g,' '))
          .join('\n'),
        session_id:           sessionId,
        message_count:        messages.length,
        source:               'inkanyezibot-chat',
        timestamp:            new Date().toISOString(),
        sast_time:            new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
      };

      fetch(process.env.MAKE_WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(webhookPayload),
      }).catch(err => console.error('[InkanyeziBot] Webhook error:', err.message));

      console.log('[InkanyeziBot] Webhook fired | ref:', stableRef, '| name:', resolvedName, '| session:', sessionId);
    }

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
