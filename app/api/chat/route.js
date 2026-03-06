import { NextResponse } from 'next/server';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are InkanyeziBot, an AI sales assistant for Inkanyezi Technologies, an AI automation company based in Durban, South Africa.

RESPONSE RULES — NON-NEGOTIABLE:
- Maximum 2-3 short sentences per response
- Never ask for more than ONE piece of information at a time
- WhatsApp style — brief, warm, conversational
- Never repeat anything already said
- Use bullet points only when listing 3+ items
- If user writes in isiZulu or Afrikaans, respond in that language but keep responses equally short

CONVERSATION FLOW — follow this order, one step at a time:
1. Greet warmly → ask for their name only
2. Ask for their business name only
3. Ask what industry they are in and how many staff
4. Ask their biggest operational challenge
5. Ask if they currently use any automation or software tools
6. Based on answers, recommend 1-2 relevant Inkanyezi services from this list:
   - WhatsApp AI Agent (R3,000/month) — 24/7 customer responses
   - Website Chatbot (R2,000/month) — lead capture and qualification
   - Automation Backend (R2,000/month) — connect all your systems
   - Operational App (R1,500/month) — mobile app for your staff
   - AI Dashboard (R1,500/month) — real-time business reporting
7. Offer to book a free demo call
8. Collect phone number and email — one at a time — only after they show interest

LEAD CAPTURE — collect these one at a time, only when conversation is warm:
- Full name
- Business name
- Phone number
- Email address

ESCALATION — if asked anything you cannot answer confidently:
"Let me connect you with Sanele directly — he'll get back to you within 24 hours."

POPIA NOTICE — include this only in your very first message:
"By chatting, you agree to our POPIA-compliant data policy."

CLOSE EVERY RESPONSE WITH one short curious question to keep the conversation going.`;

export async function POST(request) {
  try {
    const { message, sessionId, history = [] } = await request.json();

    if (!message || message.trim() === '') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Build conversation history — filter first assistant message to satisfy Gemini role requirement
    const conversationHistory = history
      .filter((msg, index) => !(index === 0 && msg.role === 'model'))
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content || msg.text || '' }]
      }))
      .filter(msg => msg.parts[0].text !== '');

    const requestBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        ...conversationHistory,
        { role: 'user', parts: [{ text: message }] }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
        topP: 0.9
      }
    };

    const geminiResponse = await fetch(
      `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json();
      console.error('Gemini API error:', errorData);
      return NextResponse.json({ error: 'AI service error' }, { status: 500 });
    }

    const geminiData = await geminiResponse.json();
    const aiReply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not process that. Please try again.';

    // Fire-and-forget webhook to Make.com — does not block response
    if (process.env.MAKE_WEBHOOK_URL) {
      fetch(process.env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          message: message,
          reply: aiReply,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error('Make.com webhook error:', err));
    }

    return NextResponse.json({ reply: aiReply });

  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
