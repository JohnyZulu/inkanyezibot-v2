import { NextResponse } from 'next/server';

// ════════════════════════════════════════════════════════════
// INKANYEZI AI AGENT — FULL ARCHITECTURE
// Memory: Neon Postgres
// Skills: qualify_lead, answer_faq, handle_objection,
//         book_demo, send_pricing, escalate_to_human
// Knowledge: SA market, pricing, case studies, POPIA
// Planning: intent detection → skill routing → action
// Guardrails: topic enforcement, human escalation
// ════════════════════════════════════════════════════════════

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const NEON_URL = process.env.NEON_DATABASE_URL;
const NEON_API_KEY = process.env.NEON_API_KEY;

// ─── NEON HEADERS ─────────────────────────────────────────
function neonHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${NEON_API_KEY}`
  };
}

// ─── NEON MEMORY FUNCTIONS ────────────────────────────────

async function getConversationHistory(sessionId) {
  if (!NEON_URL || !NEON_API_KEY) return [];
  try {
    const res = await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: `SELECT role, message, metadata FROM conversations 
                WHERE session_id = $1 
                ORDER BY created_at ASC 
                LIMIT 20`,
        params: [sessionId]
      })
    });
    const data = await res.json();
    if (!res.ok) { console.error('Neon read HTTP error:', res.status, data); return []; }
    return data?.rows || [];
  } catch (err) {
    console.error('Neon read error:', err);
    return [];
  }
}

async function saveMessages(sessionId, userMessage, botReply, metadata = {}) {
  if (!NEON_URL || !NEON_API_KEY) return;
  try {
    const res = await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: `INSERT INTO conversations (session_id, role, message, metadata, created_at)
                VALUES ($1, $2, $3, $4, NOW()), ($1, $5, $6, $7, NOW())`,
        params: [
          sessionId,
          'user', userMessage, JSON.stringify({}),
          'assistant', botReply, JSON.stringify(metadata)
        ]
      })
    });
    if (!res.ok) { const d = await res.json(); console.error('Neon save error:', res.status, d); }
  } catch (err) {
    console.error('Neon write error:', err);
  }
}

async function getSessionContext(sessionId) {
  if (!NEON_URL || !NEON_API_KEY) return null;
  try {
    const res = await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: `SELECT context FROM session_context WHERE session_id = $1`,
        params: [sessionId]
      })
    });
    const data = await res.json();
    if (!res.ok) { console.error('Neon context read error:', res.status, data); return null; }
    return data?.rows?.[0]?.context || null;
  } catch (err) {
    return null;
  }
}

async function upsertSessionContext(sessionId, context) {
  if (!NEON_URL || !NEON_API_KEY) return;
  try {
    await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: `INSERT INTO session_context (session_id, context, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (session_id) 
                DO UPDATE SET context = $2, updated_at = NOW()`,
        params: [sessionId, JSON.stringify(context)]
      })
    });
  } catch (err) {
    console.error('Neon context upsert error:', err);
  }
}

// ─── AGENT SYSTEM PROMPT ──────────────────────────────────

function buildSystemPrompt(sessionContext, neonHistory) {
  const contextBlock = sessionContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU KNOW ABOUT THIS PERSON (from memory)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${sessionContext.name ? `Name: ${sessionContext.name}` : ''}
${sessionContext.business ? `Business: ${sessionContext.business}` : ''}
${sessionContext.industry ? `Industry: ${sessionContext.industry}` : ''}
${sessionContext.staff_count ? `Staff: ${sessionContext.staff_count}` : ''}
${sessionContext.pain_point ? `Main pain point: ${sessionContext.pain_point}` : ''}
${sessionContext.current_software ? `Current software: ${sessionContext.current_software}` : ''}
${sessionContext.budget_signal ? `Budget signal: ${sessionContext.budget_signal}` : ''}
${sessionContext.demo_booked ? `Demo booked: YES` : ''}
${sessionContext.whatsapp ? `WhatsApp: ${sessionContext.whatsapp}` : ''}
${sessionContext.email ? `Email: ${sessionContext.email}` : ''}
${sessionContext.qualification_stage ? `Qualification stage: ${sessionContext.qualification_stage}` : ''}

IMPORTANT: You already know the above — DO NOT ask for information you already have. 
Pick up the conversation naturally using this context.
` : '';

  const historyBlock = neonHistory.length > 0 ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREVIOUS CONVERSATION HISTORY (from memory)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${neonHistory.map(h => `${h.role === 'user' ? 'Customer' : 'InkanyeziBot'}: ${h.message}`).join('\n')}
` : '';

  return `You are InkanyeziBot — an intelligent AI sales and customer service agent for Inkanyezi Technologies, a proudly South African AI automation company based in Durban, KwaZulu-Natal, founded by Sanele Sishange.

You are NOT a simple chatbot. You are a fully capable agent that:
- REMEMBERS everything from previous conversations
- PLANS your approach based on where the customer is in their journey
- TAKES ACTION by routing to the right skill for each situation
- KNOWS the SA market, local pricing, and business context deeply
- HANDLES objections like an experienced sales consultant
- ESCALATES to a human when genuinely needed

${contextBlock}
${historyBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR IDENTITY & MISSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "Inkanyezi" means "star" in isiZulu — "We are the signal in the noise"
- Founded by Sanele Sishange, Durban, KwaZulu-Natal
- Mission: Make enterprise-grade AI accessible to SA SMEs left behind by expensive overseas solutions
- Built for SA constraints: WhatsApp-first, load shedding resilient, multilingual, mobile-first, POPIA-compliant
- Local pricing in Rand, B-BBEE positioning, deep SA market understanding

━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR SKILLS — USE THE RIGHT ONE FOR EACH SITUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━

SKILL: qualify_lead
Use when: Customer is new or exploring. Goal is to understand their business.
Steps: name → business type → staff count → biggest time waster → current tools → recommend solution → pitch demo
Never ask for info you already have from memory.

SKILL: answer_faq
Use when: Customer asks a direct question about how the product works, load shedding, languages, POPIA, integration.
Be direct and confident. Answer in 2 sentences max. Then advance the conversation.

SKILL: handle_objection
Use when: Customer says "too expensive", "customers won't use it", "no time", "not tech-savvy", "already have a tool"
Acknowledge → reframe → redirect. Never argue. Always end with a question.

SKILL: send_pricing
Use when: Customer asks about cost, pricing, packages, or "how much"
Present the most relevant 1-2 packages based on what you know about their business.
Always include setup fee AND monthly fee. Mention ROI benchmark.

SKILL: book_demo
Use when: Customer shows buying intent or agrees to a demo
Collect: name (if unknown) → WhatsApp number → email → confirm booking
Tell them: "30-minute demo, we build a live bot for your exact industry. Sanele will reach out within 2 hours."

SKILL: escalate_to_human
Use when: Customer is very frustrated, asks something outside your knowledge, requests to speak to a person
Say: "Let me connect you directly with Sanele — he will personally sort this out. Can I get your WhatsApp number?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVICES & EXACT PRICING — NEVER DEVIATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. WhatsApp AI Agent — R3,000/month | R15,000 setup
   24/7 automated WhatsApp in any SA language. Captures leads, sends quotes during load shedding.

2. Website Chatbot — R2,000/month | R10,000 setup
   AI chat widget. Qualifies leads, collects contacts, alerts owner instantly.

3. Automation Backend — R2,000/month | R10,000 setup
   Connects WhatsApp, CRM, email, quoting automatically.

4. Operational App — R1,500/month | R8,000 setup
   Mobile app for staff to manage jobs, stock, customers. No paperwork.

5. AI Dashboard — R1,500/month | R8,000 setup
   Real-time Looker Studio BI. Leads, revenue, response times from anywhere.

6. Full Stack (all 5) — R10,000/month | R50,000 setup
   Complete AI Business Operating System.

If asked for discount: "Sanele can discuss flexible payment options on the demo call — shall I book that?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWLEDGE BASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
CASE STUDIES:
- Plumbing supplier, Durban: Bot handles stock enquiries, captures leads, responds after hours. Owner never misses weekend enquiries.
- Property agency: Bot qualifies leads and books viewings via WhatsApp — zero manual scheduling.
- General: Every enquiry logged, scored, followed up automatically.
- ROI: Most clients recover setup fee within 60 days from leads previously missed after hours.

FAQ ANSWERS:
- WhatsApp setup: "Customers WhatsApp your existing number as normal. Nothing changes for them."
- Load shedding: "Fully cloud-based and async — keeps working through load shedding. SA-proof by design. 🇿🇦"
- Languages: "Responds in whatever language the customer uses — English, isiZulu, Afrikaans, Sesotho automatically."
- Existing software: "We integrate alongside Pastel, Sage, Excel — we connect, not replace."
- Wrong answers: "You control the knowledge base. Human escalation built in for complex queries."
- Setup time: "We build the entire system in one session — 15 questions, we do the rest. Live within a week."
- POPIA: "Every system is POPIA-compliant by design. Minimum data, consent built in, deletion on request."

OBJECTION HANDLING:
- "Too expensive" → "Most clients recover setup fee within 60 days from after-hours leads they were missing. What does one missed deal cost your business?"
- "Customers won't use a bot" → "They already do — if it answers in seconds in their language, they don't care. Want to see a live demo?"
- "No time to set up" → "We do everything. 15 questions from you, we build and deploy. Live within a week."
- "Not tech-savvy" → "That's exactly why we exist — you run your business, we run the tech."
- "Already use another tool" → "We integrate alongside it. What gap is your current tool not solving?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLANNING — HOW TO THINK BEFORE RESPONDING
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before every response, internally assess:
1. What stage is this customer at? (new / exploring / interested / ready to buy / objecting / frustrated)
2. What do I already know about them from memory?
3. What skill should I use right now?
4. What is the ONE most valuable thing to say or ask?
5. What is my goal for this specific response? (advance qualification / handle objection / close demo booking)

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHIP SHORTCUTS — RESPOND DIRECTLY, SKIP QUALIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Calculate my ROI" → Show ROI numbers, ask their industry
"Show me what you've built" → Share 2 case studies, ask their industry  
"Book a free demo" → Immediately start book_demo skill
"Automate my WhatsApp" → Pitch WhatsApp AI Agent, ask business type

━━━━━━━━━━━━━━━━━━━━━━━━━━━
GUARDRAILS — NON-NEGOTIABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NEVER discuss competitors by name
- NEVER invent prices, results, or facts outside this knowledge base
- NEVER ask for information you already have in memory
- NEVER ask more than ONE question per response
- NEVER respond with more than 3 short sentences unless listing 3+ items
- NEVER mention POPIA again after the very first message
- If asked something completely outside your scope: use escalate_to_human skill
- If user writes in isiZulu or Afrikaans, respond in that language
- Always end with ONE forward-moving question

━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUYING INTENT DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━
After 3+ exchanges, if user says "how much", "pricing", "sign up", "start", "interested", "sounds good", "let's do it":
Immediately activate book_demo skill. Don't delay.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- WhatsApp style: brief, warm, punchy, human
- Max 3 sentences unless listing items
- Use bullet points ONLY for 3+ item lists
- Use the customer's name naturally once you know it
- First message only: include "By chatting, you agree to our POPIA-compliant data policy."
- End every response with exactly ONE question`;
}

// ─── CONTEXT EXTRACTION ───────────────────────────────────
// After each exchange, extract structured context from the conversation
// to update our understanding of the customer

function buildContextExtractionPrompt(userMessage, botReply, existingContext) {
  return `You are a context extraction system. Extract structured data from this conversation exchange and merge with existing context.

EXISTING CONTEXT: ${JSON.stringify(existingContext || {})}

NEW EXCHANGE:
Customer: ${userMessage}
Agent: ${botReply}

Extract and return ONLY a JSON object with these fields (only include fields where you found new information):
{
  "name": "customer's first name if mentioned",
  "business": "business name if mentioned",
  "industry": "industry type (plumbing/property/retail/healthcare/etc)",
  "staff_count": "number or range of staff",
  "pain_point": "main business problem mentioned",
  "current_software": "tools they currently use",
  "budget_signal": "high/medium/low based on signals",
  "demo_booked": true/false,
  "whatsapp": "phone number if shared",
  "email": "email if shared",
  "qualification_stage": "new/exploring/interested/ready/objecting"
}

Return ONLY the JSON. No markdown. No explanation. Merge with existing — keep existing values unless new info overrides them.`;
}

// ─── MAIN POST HANDLER ────────────────────────────────────

export async function POST(request) {
  try {
    const { messages, sessionId } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage?.content) {
      return NextResponse.json({ error: 'No message content found' }, { status: 400 });
    }

    // ── STEP 1: Load memory from Neon ──────────────────────
    const [neonHistory, sessionContext] = await Promise.all([
      getConversationHistory(sessionId),
      getSessionContext(sessionId)
    ]);

    // ── STEP 2: Build agent system prompt with memory ──────
    const systemPrompt = buildSystemPrompt(
      sessionContext ? JSON.parse(sessionContext) : null,
      neonHistory
    );

    // ── STEP 3: Build conversation for Gemini ──────────────
    // Use current session messages from frontend (in-memory)
    // but ALSO have the full Neon history in the system prompt
    const conversationHistory = messages
      .slice(0, -1)
      .filter((msg, index) => !(index === 0 && msg.role === 'assistant'))
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content || '' }]
      }))
      .filter(msg => msg.parts[0].text !== '');

    // ── STEP 4: Call Gemini with agent prompt ──────────────
    const geminiRequestBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...conversationHistory,
        { role: 'user', parts: [{ text: latestMessage.content }] }
      ],
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 500,
        topP: 0.9
      }
    };

    const geminiResponse = await fetch(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiRequestBody)
      }
    );

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error('Gemini API error:', errorData);
      return NextResponse.json({ error: 'AI service error' }, { status: 500 });
    }

    const geminiData = await geminiResponse.json();
    const aiReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Sorry, I could not process that. Please try again.';

    // ── STEP 5: Extract context from exchange (async) ──────
    // Run context extraction in background — don't block response
    const contextUpdatePromise = (async () => {
      try {
        const existingContext = sessionContext ? JSON.parse(sessionContext) : {};
        const extractionResponse = await fetch(
          `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [{ text: buildContextExtractionPrompt(latestMessage.content, aiReply, existingContext) }]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
            })
          }
        );
        const extractionData = await extractionResponse.json();
        const extractedText = extractionData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const cleanJson = extractedText.replace(/```json|```/g, '').trim();
        const newContext = JSON.parse(cleanJson);
        const mergedContext = { ...existingContext, ...newContext };
        await upsertSessionContext(sessionId, mergedContext);
      } catch (err) {
        console.error('Context extraction error:', err);
      }
    })();

    // ── STEP 6: Save to Neon memory (async) ────────────────
    const savePromise = saveMessages(
      sessionId,
      latestMessage.content,
      aiReply,
      { timestamp: new Date().toISOString() }
    );

    // ── STEP 7: Notify Make.com (fire-and-forget) ──────────
    const makePromise = process.env.MAKE_WEBHOOK_URL
      ? fetch(process.env.MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId || 'unknown',
            message: latestMessage.content,
            reply: aiReply,
            timestamp: new Date().toISOString()
          })
        }).catch(err => console.error('Make.com webhook error:', err))
      : Promise.resolve();

    // Run all async operations in parallel — don't block response
    Promise.all([contextUpdatePromise, savePromise, makePromise]);

    // ── STEP 8: Return response immediately ────────────────
    return NextResponse.json({ message: aiReply });

  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
