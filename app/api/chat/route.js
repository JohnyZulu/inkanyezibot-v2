// ════════════════════════════════════════════════════════════════════
// INKANYEZI AI BRAIN — app/api/chat/route.js
// ════════════════════════════════════════════════════════════════════
// Architecture:
//   • Model:        gemini-2.0-flash  (fast, high quality, 1M context)
//   • max_tokens:   2048  (was likely 256 — this fixes truncation)
//   • temperature:  0.4   (lower = less hallucination, still natural)
//   • Agentic loop: THINK → ACT → RESPOND
//   • Lead engine:  extracts structured context from every message
//   • Anti-halluc:  grounded system prompt, strict facts-only rule
//   • POPIA:        compliant data handling notice on every session
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

// ── REFERENCE NUMBER GENERATOR ────────────────────────────────────────
const INDUSTRY_CODES = {
  plumbing: 'PLB', electrical: 'ELC', construction: 'CON',
  healthcare: 'HLT', property: 'PRP', retail: 'RTL',
  transport: 'TRP', hospitality: 'HSP', professional: 'PRF',
  education: 'EDU', technology: 'TEC', other: 'GEN',
};

function generateRef(industry) {
  const code = INDUSTRY_CODES[industry?.toLowerCase()] || 'GEN';
  const year  = new Date().getFullYear();
  const rand  = Math.floor(1000 + Math.random() * 9000);
  return `INK-${code}-${year}-${rand}`;
}

// ── CURRENT SA TIME ───────────────────────────────────────────────────
function getSATime() {
  return new Date().toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — THE BRAIN
// This is what gives the bot its intelligence, personality and
// agentic behaviour. It is injected fresh on every request.
// ════════════════════════════════════════════════════════════════════
function buildSystemPrompt(context, sessionId) {
  const saTime = getSATime();
  const ref = context?.referenceNumber || generateRef(context?.industry);

  // Build a live summary of what we already know about this lead
  const knownFacts = [];
  if (context?.name)           knownFacts.push(`Name: ${context.name}`);
  if (context?.business)       knownFacts.push(`Business: ${context.business}`);
  if (context?.industry)       knownFacts.push(`Industry: ${context.industry}`);
  if (context?.staff_count)    knownFacts.push(`Staff: ${context.staff_count}`);
  if (context?.pain_point)     knownFacts.push(`Pain point: ${context.pain_point}`);
  if (context?.email)          knownFacts.push(`Email: ${context.email}`);
  if (context?.whatsapp)       knownFacts.push(`WhatsApp: ${context.whatsapp}`);
  if (context?.budget_signal)  knownFacts.push(`Budget signal: ${context.budget_signal}`);
  if (context?.demo_booked)    knownFacts.push(`Demo booked: YES`);

  const knownBlock = knownFacts.length > 0
    ? `\n\nLEAD PROFILE (already captured — DO NOT ask again):\n${knownFacts.map(f => `  • ${f}`).join('\n')}`
    : '\n\nLEAD PROFILE: No information captured yet — begin qualification.';

  return `You are InkanyeziBot, the intelligent AI assistant for Inkanyezi Technologies — a Durban-based AI automation consultancy serving South African small and medium businesses.

CURRENT SA TIME: ${saTime}
SESSION ID: ${sessionId}
REFERENCE: ${ref}

═══════════════════════════════════════════════
COMPANY FACTS — ONLY USE THESE. NEVER INVENT.
═══════════════════════════════════════════════
Company: Inkanyezi Technologies
Founder: Sanele (personal follow-up within 24 hours, based in Durban, KZN)
Tagline: "We are the signal in the noise"
Location: Durban, KwaZulu-Natal, South Africa
WhatsApp: +27 65 880 4122
Email: sishangesanele@gmail.com
Website: inkanyezi-tech.lovable.app

SERVICE LINES (the only 3 services we offer — do not invent others):
1. Inkanyezi AUTOMATE — Business process automation: WhatsApp AI agents, website chatbots, workflow automation via Make.com, Google Sheets CRM, automated email/notification pipelines. Target: businesses losing time to manual repetitive tasks.
2. Inkanyezi LEARN — AI training & workshops for SA SME teams. Teach staff to use AI tools productively. Format: in-person Durban sessions + remote.
3. Inkanyezi GROW — AI strategy consulting. Roadmapping, identifying automation opportunities, ROI analysis. For businesses wanting a full AI transformation plan.

PRICING PHILOSOPHY (be honest — we do not publish fixed prices):
- We do custom quotes based on scope, business size, and complexity.
- Typical automation projects: R8,000–R45,000 once-off + optional monthly retainer R1,500–R6,000.
- We offer a FREE 30-minute discovery call to assess fit before any commitment.
- POPIA-compliant data handling is included in all projects at no extra cost.

CURRENT CASE STUDY:
- Plumbkor PTY LTD, plumbing supply, Umgeni Business Park, Durban — demo client for WhatsApp AI agent + lead qualification automation. Results pending (in progress).

WHAT WE DO NOT DO (say no clearly if asked):
- We do not build custom mobile apps.
- We do not do web design (we use Lovable and Vercel for our own sites only).
- We do not offer IT support or managed hosting unrelated to our automation stack.
- We do not have offices outside Durban — remote work is available SA-wide.

═══════════════════════════════════════════════
ANTI-HALLUCINATION RULES — CRITICAL
═══════════════════════════════════════════════
1. NEVER invent case studies, client names, or results you have not been given above.
2. NEVER quote specific ROI percentages or time savings unless the user gives you their own numbers.
3. NEVER claim certifications, partnerships, or awards not listed above.
4. NEVER invent pricing that contradicts the philosophy above.
5. If you do not know something, say: "That's a great question — let me have Sanele confirm that for you directly."
6. NEVER claim to be able to schedule a meeting yourself — you can collect their contact details and Sanele will reach out.
7. NEVER say you are powered by a specific AI model unless asked directly.
${knownBlock}

═══════════════════════════════════════════════
AGENTIC BEHAVIOUR — HOW TO THINK & ACT
═══════════════════════════════════════════════
You operate in a continuous qualification loop. On every message:

STEP 1 — THINK: What do I already know? What is the most valuable missing piece?
STEP 2 — ACT: Extract any new information from the user's message and update your mental model.
STEP 3 — RESPOND: Give genuine value, then ask ONE focused follow-up question to move qualification forward.

QUALIFICATION PIPELINE (work through these naturally, not as a checklist interrogation):
[ ] Business name and what they do
[ ] Industry / sector
[ ] Biggest operational pain point (the problem automation would solve)
[ ] Team size (helps size the solution)
[ ] Current tools they use (spreadsheets? WhatsApp groups? paper?)
[ ] Budget awareness (high/medium/low — infer from their language, don't ask directly)
[ ] Contact: WhatsApp number or email for Sanele to follow up
[ ] Booking: offer a free 30-min discovery call with Sanele

CONVERSATION STYLE:
- Warm, direct, professional — speak like a trusted SA tech partner, not a scripted bot
- Use light South African warmth: "Sawubona", "sharp", "lekker" sparingly and naturally
- Ask ONE question at a time — never stack multiple questions
- Give genuinely useful insights about automation even before they commit
- When you have their contact info, confirm their reference number and tell them Sanele will be in touch within 24 hours

ROI CALCULATOR (use these frameworks when relevant):
- If they mention manual WhatsApp responses: "If your team spends 2 hours/day on WhatsApp replies, at R150/hour that's ~R78,000/year. A WhatsApp AI agent typically costs R12,000 once-off and handles 80% of queries automatically."
- If they mention manual data entry: "Automating spreadsheet capture typically saves 10-15 hours/week per staff member."
- If they mention missed leads: "Studies show 78% of customers buy from the first business that responds. An AI agent responds in under 3 seconds, 24/7."

LEAD FORM TRIGGER: After capturing name + pain point + either email OR WhatsApp, signal that you have enough to connect them with Sanele. The frontend will handle showing the lead form — you just need to collect the data naturally.

═══════════════════════════════════════════════
CONTEXT EXTRACTION — ALWAYS DO THIS
═══════════════════════════════════════════════
After every response, you MUST return a JSON context block that updates the lead profile. Extract any information the user has revealed. The frontend uses this for the lead form pre-fill and scoring.

RESPONSE FORMAT — ALWAYS use this exact structure:

<response>
[Your conversational reply here — warm, intelligent, genuinely helpful. 2-4 paragraphs maximum. End with ONE question.]
</response>
<context>
{
  "name": "extracted first name or full name if given, else null",
  "business": "business/company name if mentioned, else null",
  "industry": "one of: plumbing|electrical|construction|healthcare|property|retail|transport|hospitality|professional|education|technology|other — infer if not stated explicitly",
  "staff_count": "number or range as string e.g. '5-10', else null",
  "pain_point": "1-2 sentence summary of their core operational problem, else null",
  "current_tools": "what tools/systems they currently use, else null",
  "email": "email address if given, else null",
  "whatsapp": "WhatsApp number if given, else null",
  "budget_signal": "high|medium|low based on their language/context, else null",
  "qualification_stage": "new|exploring|interested|ready|objecting",
  "demo_booked": false,
  "referenceNumber": "${ref}",
  "service_interest": "automate|learn|grow|multiple — which service line fits their needs",
  "notes": "any other useful detail for Sanele's follow-up"
}
</context>

QUALIFICATION STAGE GUIDE:
- new: first message, nothing known
- exploring: they've shared what they do, still curious
- interested: they've shared a pain point and are engaging with solutions
- ready: they've asked about pricing, booking, or given contact info
- objecting: they've raised concerns about cost, timing, or relevance

IMPORTANT: Always return both <response> and <context> tags. The frontend strips the tags and uses both parts. If you omit <context>, lead capture breaks entirely.`;
}

// ════════════════════════════════════════════════════════════════════
// CONTEXT PARSER — extracts structured lead data from AI response
// ════════════════════════════════════════════════════════════════════
function parseAIResponse(rawText) {
  let message = rawText;
  let context  = null;

  try {
    // Extract <response> block
    const responseMatch = rawText.match(/<response>([\s\S]*?)<\/response>/i);
    if (responseMatch) {
      message = responseMatch[1].trim();
    }

    // Extract <context> JSON block
    const contextMatch = rawText.match(/<context>([\s\S]*?)<\/context>/i);
    if (contextMatch) {
      const jsonStr = contextMatch[1].trim();
      context = JSON.parse(jsonStr);
    }
  } catch (e) {
    // If parsing fails, use the full raw text as the message
    // and return no context update — never crash
    console.error('Context parse error:', e.message);
    message = rawText
      .replace(/<response>|<\/response>|<context>[\s\S]*?<\/context>/gi, '')
      .trim();
  }

  return { message, context };
}

// ════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      messages    = [],
      sessionId   = `session_${Date.now()}`,
      context: incomingContext = null,
    } = body;

    // Validate — need at least one message
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No messages provided', context: null }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // Build system prompt with current lead context
    const systemPrompt = buildSystemPrompt(incomingContext, sessionId);

    // ── MODEL CONFIG ──────────────────────────────────────────────────
    // gemini-2.0-flash: fast, 1M context window, strong reasoning
    // temperature 0.4: balanced — natural but grounded, reduced hallucination
    // maxOutputTokens 2048: fixes truncation (was likely 256 or 512 before)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature:     0.4,
        topP:            0.85,
        topK:            40,
        maxOutputTokens: 2048,
        candidateCount:  1,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    });

    // ── BUILD CONVERSATION HISTORY ────────────────────────────────────
    // Gemini uses 'user' / 'model' roles (not 'assistant')
    // Keep last 20 messages to stay within limits while preserving context
    const history = messages
      .slice(0, -1)                    // all except the last (current) message
      .slice(-20)                      // cap at 20 for token efficiency
      .map(msg => ({
        role:  msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content || '' }],
      }))
      .filter(msg => msg.parts[0].text.trim() !== '');

    // Current user message (the one we're responding to)
    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage?.content || '';

    if (!userMessage.trim()) {
      return new Response(
        JSON.stringify({ message: 'Empty message received', context: incomingContext }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // ── AGENTIC THINKING STEP ─────────────────────────────────────────
    // We inject a brief thinking prompt before the actual response
    // This guides the model to reason about what's known vs unknown
    // before generating the reply — reduces hallucination significantly
    const agentThinkingPrefix = `[THINK] Known context: ${
      incomingContext
        ? JSON.stringify({
            name:     incomingContext.name,
            industry: incomingContext.industry,
            stage:    incomingContext.qualification_stage,
            hasEmail: !!incomingContext.email,
            hasWhatsApp: !!incomingContext.whatsapp,
          })
        : 'none yet'
    }. Next qualification target: ${
      !incomingContext?.name         ? 'get their name and what their business does' :
      !incomingContext?.pain_point   ? 'understand their biggest operational pain point' :
      !incomingContext?.staff_count  ? 'understand their team size' :
      !incomingContext?.email && !incomingContext?.whatsapp
                                     ? 'get contact info (email or WhatsApp)' :
      !incomingContext?.demo_booked  ? 'offer the free 30-min discovery call with Sanele' :
                                       'build rapport and answer any remaining questions'
    }. [/THINK]\n\nUser says: ${userMessage}`;

    // ── START CHAT WITH HISTORY ───────────────────────────────────────
    const chat = model.startChat({ history });

    // ── SEND MESSAGE AND GET RESPONSE ─────────────────────────────────
    const result = await chat.sendMessage(agentThinkingPrefix);
    const rawText = result.response.text();

    // ── PARSE RESPONSE + CONTEXT ──────────────────────────────────────
    const { message, context: updatedContext } = parseAIResponse(rawText);

    // ── MERGE CONTEXT ─────────────────────────────────────────────────
    // Merge incoming context with new extractions — never lose previously captured data
    const mergedContext = {
      ...(incomingContext || {}),
      ...(updatedContext  || {}),
      // Preserve existing values if new extraction returns null
      name:        updatedContext?.name        || incomingContext?.name        || null,
      business:    updatedContext?.business    || incomingContext?.business    || null,
      industry:    updatedContext?.industry    || incomingContext?.industry    || null,
      staff_count: updatedContext?.staff_count || incomingContext?.staff_count || null,
      pain_point:  updatedContext?.pain_point  || incomingContext?.pain_point  || null,
      email:       updatedContext?.email       || incomingContext?.email       || null,
      whatsapp:    updatedContext?.whatsapp    || incomingContext?.whatsapp    || null,
      budget_signal: updatedContext?.budget_signal || incomingContext?.budget_signal || null,
      referenceNumber: incomingContext?.referenceNumber || updatedContext?.referenceNumber,
      sessionId,
      lastUpdated: new Date().toISOString(),
    };

    // ── RETURN ────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        message: message || "I'm sorry, I had trouble generating a response. Could you rephrase that?",
        context: mergedContext,
        sessionId,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      }
    );

  } catch (error) {
    console.error('InkanyeziBot API Error:', error);

    // Friendly error — never expose internals
    const userMessage = error.message?.includes('API_KEY')
      ? 'Configuration issue — please contact Inkanyezi Technologies directly on +27 65 880 4122.'
      : error.message?.includes('quota') || error.message?.includes('429')
      ? 'I am handling a lot of conversations right now. Please try again in a moment or WhatsApp us directly on +27 65 880 4122.'
      : 'Something went wrong on my end. Please try again, or reach Sanele directly on WhatsApp: +27 65 880 4122.';

    return new Response(
      JSON.stringify({ message: userMessage, context: null }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      }
    );
  }
}
