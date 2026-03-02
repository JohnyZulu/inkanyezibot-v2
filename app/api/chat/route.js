import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/79mjaa3s26c6bsr3lpfqmx5nwu5sa489";

async function sendToMake(leadData) {
  try {
    await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...leadData,
        timestamp: new Date().toISOString(),
        source: "InkanyeziBot Website Chat",
      }),
    });
  } catch (error) {
    console.error("Make.com webhook error:", error);
  }
}

function extractLeadData(messages) {
  const conversation = messages.map((m) => m.content).join(" ");
  const emailMatch = conversation.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = conversation.match(/(\+27|0)[0-9]{9}/);
  const nameMatch = conversation.match(/(?:my name is|i am|i'm|name:|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  const companyMatch = conversation.match(/(?:company|business|work at|from|represent)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|\s+and|\s+we)/i);
  return {
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0] : null,
    name: nameMatch ? nameMatch[1] : null,
    company: companyMatch ? companyMatch[1] : null,
  };
}

function isQualifiedLead(messages) {
  const data = extractLeadData(messages);
  return data.email && data.phone;
}

export async function POST(request) {
  try {
    const { messages } = await request.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: `You are InkanyeziBot, an expert AI sales assistant for Inkanyezi Technologies, an AI automation company based in Durban, South Africa.

YOUR GOAL: Have a natural, consultative conversation to understand the prospect's business challenges and show them how Inkanyezi Technologies can solve them.

CONVERSATION FLOW:
1. Greet warmly and collect: name, business name, phone, email
2. Ask about their business - what they do, how many staff, industry
3. Ask about their biggest operational challenges and pain points
4. Ask what tasks take up most of their time
5. Ask if they currently use any software or automation tools
6. Based on their answers, explain which of our 5 services would help them:
   - WhatsApp AI Assistant (customer communication)
   - Website AI Chatbot (lead generation)
   - AppSheet Operational App (staff management)
   - Looker Studio Dashboard (business insights)
   - Make.com Automation Engine (workflow automation)
7. Share relevant pricing: Starter R3,000/month, Growth R6,000/month, Enterprise R10,000/month
8. Only after a deep conversation, offer to book a discovery call

RULES:
- Ask ONE question at a time
- Listen carefully and respond to what they say
- Be consultative, not pushy
- Use their name once you know it
- Respond in whatever language the user writes in
- Use emojis naturally but professionally
- Never rush to close, build rapport first
- If they mention a specific problem, dig deeper with follow-up questions
- Always collect name, company, phone and email before ending conversation
- Add this to your first message only: By chatting with us, you agree that your information may be used to contact you about our services, in accordance with POPIA.`,
    });

    const history = messages.slice(0, -1).filter((msg, index) => {
      if (index === 0 && msg.role === "assistant") return false;
      if (!msg.content || msg.content.trim() === "") return false;
      return true;
    }).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1].content;
    const result = await chat.sendMessage(lastMessage);
    const text = result.response.text();

    if (isQualifiedLead(messages)) {
      const leadData = extractLeadData(messages);
      const fullConversation = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      await sendToMake({ ...leadData, enquiry: fullConversation });
    }

    return Response.json({ message: text });
  } 
catch (error) {
  console.error('Gemini error:', error);
  
  if (error.status === 429) {
    return new Response(JSON.stringify({ 
      message: "I'm experiencing high demand right now. Please try again in a moment! 🙏",
      role: 'assistant'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ 
    error: 'Failed to generate response',
    details: error.message 
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}