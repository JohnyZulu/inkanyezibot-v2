import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(request) {
  try {
    const { messages } = await request.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `You are InkanyeziBot, a friendly AI assistant for Inkanyezi Technologies, 
      an AI automation company based in Durban, South Africa. 
      Your job is to chat with potential clients, understand their business challenges, 
      and qualify them as leads. Always greet with "Sawubona!" and be warm and professional.
      Ask about their business, how many staff they have, and what their biggest operational challenges are.
      When you have their name, company, phone and email, let them know someone will be in touch.`,
    });

    // Filter out the initial assistant greeting and only keep user/assistant exchanges
    const history = messages.slice(0, -1).filter((msg, index) => {
      if (index === 0 && msg.role === 'assistant') return false;
      return true;
    }).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1].content;
    const result = await chat.sendMessage(lastMessage);
    const text = result.response.text();

    return Response.json({ message: text });
  } catch (error) {
    console.error("Gemini error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}