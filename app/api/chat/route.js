import { NextResponse } from 'next/server';

// ── CORS — allow requests from Lovable site and any other origin ──────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// Handle OPTIONS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const NEON_URL = process.env.NEON_DATABASE_URL;
const NEON_API_KEY = process.env.NEON_API_KEY;

function neonHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${NEON_API_KEY}`
  };
}

async function getConversationHistory(sessionId) {
  if (!NEON_URL || !NEON_API_KEY) return [];
  const escape = (str) => String(str || '').replace(/'/g, "''");
  try {
    const res = await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: `SELECT role, message FROM conversations 
                WHERE session_id = '${escape(sessionId)}' 
                ORDER BY created_at ASC 
                LIMIT 20`
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
  const sid = String(sessionId || 'unknown');
  const userMsg = String(userMessage || '');
  const botMsg = String(botReply || '');
  try {
    await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: 'INSERT INTO conversations (session_id, role, message, metadata, created_at) VALUES ($1, $2, $3, $4, NOW())',
        params: [sid, 'user', userMsg, '{}']
      })
    });
    await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: 'INSERT INTO conversations (session_id, role, message, metadata, created_at) VALUES ($1, $2, $3, $4, NOW())',
        params: [sid, 'assistant', botMsg, JSON.stringify(metadata)]
      })
    });
  } catch (err) {
    console.error('Neon write error:', err);
  }
}

async function getSessionContext(sessionId) {
  if (!NEON_URL || !NEON_API_KEY) return null;
  const escape = (str) => String(str || '').replace(/'/g, "''");
  try {
    const res = await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: `SELECT context FROM session_context WHERE session_id = '${escape(sessionId)}'`
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
  const escape = (str) => String(str || '').replace(/'/g, "''");
  const contextJson = escape(JSON.stringify(context));
  try {
    await fetch(NEON_URL, {
      method: 'POST',
      headers: neonHeaders(),
      body: JSON.stringify({
        query: `INSERT INTO session_context (session_id, context, updated_at)
                VALUES ('${escape(sessionId)}', '${contextJson}', NOW())
                ON CONFLICT (session_id) 
                DO UPDATE SET context = '${contextJson}', updated_at = NOW()`
      })
    });
  } catch (err) {
    console.error('Neon context upsert error:', err);
  }
}

// ── INDUSTRY CODE MAPPING ──────────────────────────────────────────────────
function getIndustryCode(industry) {
  if (!industry) return 'GEN';
  const map = {
    // Trade & Field Services
    plumbing: 'PLB', plumber: 'PLB', plumbkor: 'PLB',
    electrical: 'ELC', electrician: 'ELC', electric: 'ELC',
    construction: 'CON', builder: 'CON', building: 'CON', contractor: 'CON',
    hvac: 'HVC', aircon: 'HVC', 'air conditioning': 'HVC',
    cleaning: 'CLN', cleaner: 'CLN',
    security: 'SEC', guard: 'SEC',
    // Healthcare
    healthcare: 'MED', medical: 'MED', health: 'MED',
    clinic: 'MED', doctor: 'MED', pharmacy: 'MED', dental: 'MED',
    // Property & Real Estate
    property: 'REA', 'real estate': 'REA', realtor: 'REA',
    estate: 'REA', rental: 'REA', letting: 'REA',
    // Retail & FMCG
    retail: 'RET', shop: 'RET', store: 'RET', supermarket: 'RET',
    wholesale: 'RET', supplier: 'RET',
    // Transport & Logistics
    transport: 'TRN', logistics: 'TRN', courier: 'TRN',
    delivery: 'TRN', freight: 'TRN', fleet: 'TRN',
    // Hospitality & Food
    hospitality: 'HOS', restaurant: 'HOS', hotel: 'HOS',
    catering: 'HOS', cafe: 'HOS', food: 'HOS',
    // Professional Services
    professional: 'PRO', legal: 'PRO', lawyer: 'PRO',
    accounting: 'PRO', accountant: 'PRO', finance: 'PRO',
    consulting: 'PRO', consultant: 'PRO', advisory: 'PRO',
    // Education & Training
    education: 'EDU', school: 'EDU', training: 'EDU',
    university: 'EDU', college: 'EDU', tutoring: 'EDU',
    // Technology
    technology: 'TEC', software: 'TEC', it: 'TEC',
    tech: 'TEC', digital: 'TEC', saas: 'TEC',
    // Manufacturing
    manufacturing: 'MFG', factory: 'MFG', production: 'MFG',
    // Agriculture
    agriculture: 'AGR', farming: 'AGR', farm: 'AGR',
    // Automotive
    automotive: 'AUT', car: 'AUT', vehicle: 'AUT',
    garage: 'AUT', mechanic: 'AUT', motor: 'AUT',
    // Insurance & Financial
    insurance: 'INS', broker: 'INS', assurance: 'INS',
    // Marketing & Media
    marketing: 'MKT', media: 'MKT', advertising: 'MKT',
    agency: 'MKT', creative: 'MKT',
  };
  const key = industry.toLowerCase().trim();
  for (const [term, code] of Object.entries(map)) {
    if (key.includes(term)) return code;
  }
  return 'GEN';
}

// ── REFERENCE NUMBER GENERATOR ─────────────────────────────────────────────
// Format: INK-[INDUSTRY]-[YEAR]-[RAND4]
// Example: INK-PLB-2026-4827 (Plumbing lead, 2026)
// Once generated for a session it is PRESERVED — never regenerated
function generateReferenceNumber(industry) {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const code = getIndustryCode(industry);
  return `INK-${code}-${year}-${rand}`;
}

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
${sessionContext.referenceNumber ? `Reference number: ${sessionContext.referenceNumber}` : ''}
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

  return `You are InkanyeziBot — AI sales agent for Inkanyezi Technologies, Durban, SA. Founded by Sanele Sishange. "We are the signal in the noise."

${contextBlock}
${historyBlock}

━━━ CONVERSATION FLOW — STRICT 3-EXCHANGE MAX ━━━
Your only job: qualify fast, match to a solution, get them to the form.

EXCHANGE 1 — They describe their business:
→ Acknowledge in ONE sentence. Ask ONE pain-point question with 2 options.
Example: "Sounds like a busy operation — is the bigger issue missing after-hours enquiries, or slow quoting?"

EXCHANGE 2 — They name their pain:
→ Match to solution + ROI in 2 sentences max. Ask ONE closing question.
Example: "That's exactly what our WhatsApp AI Agent solves — most clients recover the setup fee within 60 days. Want to see the pricing for your industry?"

EXCHANGE 3 — They show interest:
→ Share the relevant price (1-2 packages only). Tell them the form is coming.
Example: "WhatsApp AI Agent: R3,000/month + R15,000 setup. Drop your details in the form that appears and Sanele will personally reach out within 24 hours. 🇿🇦"
→ FORM APPEARS HERE.

━━━ PRICING (never deviate) ━━━
WhatsApp AI Agent — R3,000/mo | R15,000 setup
Website Chatbot — R2,000/mo | R10,000 setup
Automation Backend — R2,000/mo | R10,000 setup
Operational App — R1,500/mo | R8,000 setup
AI Dashboard — R1,500/mo | R8,000 setup
Full Stack (all 5) — R10,000/mo | R50,000 setup

━━━ QUICK ANSWERS ━━━
Load shedding: "Cloud-based — works through load shedding. SA-proof. 🇿🇦"
Languages: "Responds in English, isiZulu, Afrikaans, Sesotho automatically."
Setup time: "Live within a week — we do everything."
Integration: "Works alongside Pastel, Sage, Excel — we connect, not replace."
Discount: "Sanele can discuss payment options on the demo call."

━━━ OBJECTIONS ━━━
Too expensive → "One missed after-hours deal likely costs more than a month's fee. What does one deal cost you?"
Won't use it → "If it answers in seconds in their language, they don't notice it's a bot."
No time → "We do everything. 15 questions from you, live within a week."
Not tech-savvy → "That's exactly why we exist."

━━━ GUARDRAILS ━━━
✗ NEVER ask more than ONE question per message
✗ NEVER write more than 2-3 short sentences per response
✗ NEVER ask for contact details — the form handles this
✗ NEVER mention POPIA after the first message
✗ NEVER use bullet lists unless sharing 3+ prices at once
✗ NEVER discuss competitors
✓ Use customer's name naturally once you know it
✓ Match their language (isiZulu/Afrikaans → reply in kind)
✓ Quick chips: "Calculate my ROI" → ROI numbers + ask industry | "Book a free demo" → go to book_demo | "Show me what you've built" → 1 case study + ask industry
✓ Frustrated/lost → "Let me get Sanele to help — drop your details in the form."

━━━ RESPONSE FORMAT ━━━
Style: WhatsApp — punchy, warm, human, SA-flavoured
Length: 1-3 sentences MAXIMUM. If you feel the urge to write more — cut it in half.
End: ONE forward-moving question. Never two.
First message only: add "By chatting you agree to our POPIA-compliant data policy."`;
}

function buildContextExtractionPrompt(userMessage, botReply, existingContext) {
  return `You are a context extraction system. Extract structured data from this conversation exchange and merge with existing context.

EXISTING CONTEXT: ${JSON.stringify(existingContext || {})}

NEW EXCHANGE:
Customer: ${userMessage}
Agent: ${botReply}

Extract and return ONLY a JSON object with these fields (only include fields where you found new information):
{
  "name": "customer's first name if mentioned — extract from ANY natural mention e.g. 'I'm Sipho', 'My name is Thandi', 'This is John'",
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

async function extractContext(userMessage, botReply, existingContext, geminiApiKey) {
  try {
    const extractionResponse = await fetch(
      `${GEMINI_URL}?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: buildContextExtractionPrompt(userMessage, botReply, existingContext) }]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
        })
      }
    );
    const extractionData = await extractionResponse.json();
    const extractedText = extractionData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanJson = extractedText.replace(/```json|```/g, '').trim();
    const newContext = JSON.parse(cleanJson);
    return { ...existingContext, ...newContext };
  } catch (err) {
    console.error('Context extraction error:', err);
    return existingContext;
  }
}

async function fireWebhook(webhookUrl, sessionId, updatedContext, message, aiReply) {
  // Reference number is PRESERVED from context — never regenerated for same session
  const referenceNumber = updatedContext.referenceNumber;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId || 'unknown',
      referenceNumber,
      timestamp: new Date().toISOString(),
      message,
      reply: aiReply,
      name: updatedContext.name || '',
      email: updatedContext.email || '',
      whatsapp: updatedContext.whatsapp || '',
      business: updatedContext.business || '',
      industry: updatedContext.industry || '',
      staff_count: updatedContext.staff_count || '',
      pain_point: updatedContext.pain_point || '',
      budget_signal: updatedContext.budget_signal || '',
      demo_booked: updatedContext.demo_booked || false,
      qualification_stage: updatedContext.qualification_stage || 'new',
      has_email: !!(updatedContext.email),
      has_whatsapp: !!(updatedContext.whatsapp),
      is_demo_booked: !!(updatedContext.demo_booked),
    })
  });
}

export async function POST(request) {
  try {
    const { messages, sessionId } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400, headers: CORS_HEADERS });
    }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage?.content) {
      return NextResponse.json({ error: 'No message content found' }, { status: 400, headers: CORS_HEADERS });
    }

    // STEP 1: Load memory from Neon
    const [neonHistory, sessionContext] = await Promise.all([
      getConversationHistory(sessionId),
      getSessionContext(sessionId)
    ]);

    const parsedContext = sessionContext ? JSON.parse(sessionContext) : {};

    // STEP 2: Build agent system prompt with memory
    const systemPrompt = buildSystemPrompt(parsedContext, neonHistory);

    // STEP 3: Build conversation for Gemini
    const conversationHistory = messages
      .slice(0, -1)
      .filter((msg, index) => !(index === 0 && msg.role === 'assistant'))
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content || '' }]
      }))
      .filter(msg => msg.parts[0].text !== '');

    // STEP 4: Call Gemini for bot reply
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
      return NextResponse.json({ error: 'AI service error' }, { status: 500, headers: CORS_HEADERS });
    }

    const geminiData = await geminiResponse.json();
    const aiReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
      || 'Sorry, I could not process that. Please try again.';

    // STEP 5: Return reply immediately to user
    const response = NextResponse.json({ message: aiReply }, { headers: CORS_HEADERS });

    // STEP 6: Background tasks — extract context, assign reference number, save, fire webhook
    ;(async () => {
      try {
        // Extract updated context from this exchange
        const updatedContext = await extractContext(
          latestMessage.content,
          aiReply,
          parsedContext,
          process.env.GEMINI_API_KEY
        );

        // ASSIGN REFERENCE NUMBER — generated once per session, preserved forever
        // Uses industry code from context: INK-PLB-2026-4827 format
        if (!updatedContext.referenceNumber) {
          updatedContext.referenceNumber = generateReferenceNumber(updatedContext.industry);
        }

        // Save updated context and messages to Neon in parallel
        await Promise.all([
          upsertSessionContext(sessionId, updatedContext),
          saveMessages(sessionId, latestMessage.content, aiReply, {
            timestamp: new Date().toISOString()
          })
        ]);

        // Fire webhook ONLY when demo is booked AND at least one contact method exists
        if (
          process.env.MAKE_WEBHOOK_URL &&
          updatedContext.demo_booked === true &&
          (updatedContext.email || updatedContext.whatsapp)
        ) {
          await fireWebhook(
            process.env.MAKE_WEBHOOK_URL,
            sessionId,
            updatedContext,
            latestMessage.content,
            aiReply
          );
        }

      } catch (err) {
        console.error('Background processing error:', err);
      }
    })();

    return response;

  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS });
  }
}
