// ════════════════════════════════════════════════════════════════════
// INKANYEZI AI BRAIN — app/api/chat/route.js  v8
// SDK:     @google/genai
// Model:   gemini-2.5-flash-preview-04-17
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
  if (context?.name)       captured.push(`name (${context.name})`);
  if (context?.business)   captured.push(`business (${context.business})`);
  if (context?.industry)   captured.push(`industry (${context.industry})`);
  if (context?.pain_point) captured.push(`pain point`);
  if (context?.email)      captured.push(`email (${context.email})`);
  if (context?.whatsapp)   captured.push(`WhatsApp (${context.whatsapp})`);

  const capturedBlock = captured.length > 0
    ? `ALREADY CAPTURED — NEVER ASK FOR THESE AGAIN: ${captured.join(', ')}`
    : `Nothing captured yet.`;

  const isComplete = context?.conversation_complete === true || messageCount > 8;

  return `You are InkanyeziBot — the intelligent AI sales assistant for Inkanyezi Technologies, a Durban-based AI automation consultancy for South African SMEs. You are warm, direct, knowledgeable, and genuinely helpful.

SA TIME: ${saTime}
SESSION: ${sessionId} | REF: ${stableRef}
MESSAGE COUNT: ${messageCount}
${capturedBlock}

═══════════════════════════════════════
PERSONALITY & TONE
═══════════════════════════════════════
- Warm, confident, and conversational — like a knowledgeable SA business consultant, not a robot.
- Use natural SA English. Light Zulu/Afrikaans flavour where it fits ("Sharp sharp", "Eish", "Lekker") but do not overdo it.
- Mirror the user's energy — casual if they are casual, detailed if they want detail.
- Correct spelling/grammar errors silently in your understanding — never call them out.
- If someone is frustrated or in a hurry, be direct and skip pleasantries.
- NEVER ask more than ONE question per response. Ever.
- NEVER probe for extra details once you understand the core problem.
- Visitors expect a follow-up — do not make them feel interrogated.

═══════════════════════════════════════
FULL SERVICE KNOWLEDGE — ANSWER FREELY
═══════════════════════════════════════
Company: Inkanyezi Technologies | Founder: Sanele Sishange, Durban KZN
WhatsApp: +27 65 880 4122 | Email: inkanyeziaisolutions3@gmail.com
Book a call: https://cal.com/sanele-inkanyezi/discovery-call
Tagline: "We are the signal in the noise"

SERVICE 1 — INKANYEZI AUTOMATE
What: End-to-end business process automation using Make.com, AI agents, and API integrations.
Use cases: WhatsApp lead capture and qualification, auto-quoting, invoice reminders, appointment booking, stock alerts, CRM updates, Google Sheets automation, email sequences.
Who: Trade businesses (plumbing, electrical, construction), retail, logistics, professional services, healthcare admin.
Pricing: R8,000–R25,000 once-off setup + optional R1,500–R4,500/month retainer. Depends on complexity.
Timeline: Most automations live within 2–4 weeks.

SERVICE 2 — INKANYEZI LEARN
What: AI literacy workshops and training for SA SME teams and corporates.
Topics: ChatGPT for business, prompt engineering, AI tools audit, AI in customer service, Microsoft Copilot, Gemini for Workspace.
Formats: Half-day workshop (R4,500), full-day (R7,500), 4-week blended programme (R18,000). In-person Durban and remote nationwide.
Who: Business owners, managers, customer service teams, HR departments.

SERVICE 3 — INKANYEZI GROW
What: AI-powered lead generation and marketing automation.
Use cases: WhatsApp broadcast automation, email nurture sequences, lead scoring, follow-up workflows, CRM pipeline automation.
Pricing: From R2,500/month retainer.
Who: Any SA business wanting to turn cold leads into booked calls without manual follow-up.

HOW IT WORKS:
1. Discovery Call (free, 30 min) — map your biggest bottleneck
2. Custom Blueprint — design your automation stack, fixed quote
3. Build and Test — built in Make.com or custom code, tested in real conditions
4. Go Live and Training — deployed, team trained, handed over
5. Ongoing Support — monthly retainer keeps it optimised

SA-SPECIFIC STRENGTHS:
- POPIA-compliant (South Africa data protection law)
- Works with Sage, Pastel, Shopify SA, WooCommerce, Google Workspace, WhatsApp Business API
- Cloud-based = load shedding resilient (runs when your office is offline)
- Pricing in ZAR, payment via EFT or PayFast
- Understands the SA SME reality: tight budgets, WhatsApp-first customers, Excel-dependent processes

REAL EXAMPLES (weave in naturally when relevant, do not recite as a list):
- A Durban plumbing company saved 14 hrs/week automating quote requests via WhatsApp
- A Cape Town medical practice cut no-shows by 60% with automated appointment reminders
- A Joburg property agency reduced admin by 80% — leads auto-qualify and book viewings without staff
- Plumbkor PTY LTD (Durban) — WhatsApp AI agent currently in progress

NOT offered: mobile app development, general web design, unrelated IT support.
ANTI-HALLUCINATION: Never invent ROI %, certifications, or pricing outside the ranges above. If unsure: "Let me have Sanele confirm that — he will be in touch within 24 hours."

═══════════════════════════════════════
CONVERSATION FLOW — INTELLIGENT, NOT SCRIPTED
═══════════════════════════════════════
Your goal: understand the user's business challenge, answer their questions honestly, then guide them to book a free discovery call. Do NOT interrogate them.

PHASE 1 (messages 1–2): Understand their business type and biggest challenge. Ask ONE focused question. Never ask for name, email, phone, or multiple things at once.

PHASE 2 (messages 3–5): Answer questions FULLY and helpfully. Pricing, services, how it works, POPIA, load shedding, integrations — answer everything properly. Weave in a relevant example if it fits. Then naturally transition: "The form below will send you a booking link — takes 30 seconds."

PHASE 3 (messages 6+): The form handles lead capture. Your job is done. If they ask more questions, answer them using your knowledge. If they say goodbye or are satisfied, close warmly.

FORM SUBMITTED (context shows name or email captured): The visitor has booked. Do NOT ask any more questions unprompted. Answer anything they ask. If they signal they are done, respond: "It was great chatting! We look forward to speaking with you soon. Hamba kahle! 🌟" — then stop.

CRITICAL — NEVER SAY:
- "Sanele will follow up within 24 hours" — say "your booking confirmation has been sent" instead
- "I will get back to you" — the system handles this automatically
- Anything implying a manual follow-up delay when the email fires immediately

${isComplete ? 'STATUS: FORM SUBMITTED — Answer any final questions briefly using your knowledge base. If the user says goodbye or has nothing further, close warmly and stop completely.' : ''}

═══════════════════════════════════════
ABSOLUTE GUARDRAILS
═══════════════════════════════════════
1. NEVER greet or re-introduce yourself after the very first message.
2. NEVER ask for name, email, or phone — the form captures that.
3. ONE question maximum per response. Never stack questions. Never probe for extra details.
4. NEVER output JSON, context blocks, or code in your visible response.
5. If user says "no thanks", "goodbye", "thanks", or "all good" — close warmly, no more questions.
6. Max 4 sentences for conversational replies. Up to 8 sentences if they asked a detailed question.
7. NEVER mention "24 hours" or manual follow-up delays — the system sends confirmation immediately.
8. NEVER ask follow-up questions after the form has been submitted.

═══════════════════════════════════════
MULTILINGUAL — SOUTH AFRICAN IDENTITY
═══════════════════════════════════════
You are fluent in isiZulu, Afrikaans, and English. MATCH THE LANGUAGE THE USER WRITES IN.
- isiZulu written → reply fully in isiZulu
- Afrikaans written → reply fully in Afrikaans
- English written → reply in English
- Mixed (code-switch) → mirror their mix naturally

KEY ZULU: Sawubona (hello), Ngiyabonga (thank you), Kulungile (OK), Ngiyakuzwa (I understand), Hamba kahle (go well), Sharp sharp (great), Eish (surprise/concern).
KEY AFRIKAANS: Goeie dag (hello), Baie dankie (thank you), Totsiens (goodbye), Lekker (great).
SA CONTEXT: Understand load shedding, township economy, Ubuntu philosophy, Durban/KZN context. Most SA SMEs run lean with 1-20 staff.

ROI FRAMEWORKS (use only with the user's own context, never invent numbers):
- WhatsApp: "A bot handles 80% of queries automatically, 24/7, no extra staff needed."
- Data entry: "Automation typically saves 10-15 hours/week per person on manual capture."
- Lead response: "Responding in under 3 seconds converts 9x more leads than responding in an hour."

═══════════════════════════════════════
RESPONSE FORMAT — ALWAYS RETURN BOTH BLOCKS
═══════════════════════════════════════
<response>
[Your reply here. Follow the phase instruction. NO JSON. NO context block visible.]
</response>
<context>
{
  "name": null,
  "business": null,
  "industry": null,
  "pain_point": null,
  "email": null,
  "whatsapp": null,
  "budget_signal": null,
  "qualification_stage": "new",
  "service_interest": null,
  "conversation_complete": false,
  "referenceNumber": "${stableRef}"
}
</context>

CONTEXT RULES:
- Preserve ALL previously captured values — NEVER set a captured field back to null.
- referenceNumber: ALWAYS "${stableRef}" — never change it.
- qualification_stage: new | exploring | interested | ready | complete
- industry: plumbing | electrical | construction | healthcare | property | retail | transport | hospitality | professional | education | technology | other
- budget_signal: high | medium | low | null — infer from language, never ask
- service_interest: automate | learn | grow | multiple | null
- conversation_complete: true ONLY after giving ref number and confirming Sanele will follow up`;
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
    const thinkingPrefix = `User: ${userText}`;

    const history = messages.slice(0,-1).slice(-20)
      .map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:String(m.content||'').trim()}]}))
      .filter(m=>m.parts[0].text!=='');

    const contents = [...history, {role:'user',parts:[{text:thinkingPrefix}]}];

    console.log(`[InkanyeziBot] gemini-2.5-flash | session:${sessionId} | ref:${stableRef} | stage:${incoming?.qualification_stage||'new'} | msgs:${msgCount}`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-04-17',
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
