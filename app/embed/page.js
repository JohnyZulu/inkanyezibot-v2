'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ── Brand tokens ─────────────────────────────────────────────────── */
const T = {
  night:   "#04080F",
  deep:    "#0A1628",
  navy:    "#0F1B35",
  orange:  "#FF6B35",
  gold:    "#F4B942",
  teal:    "#3A9E7E",
  ivory:   "#FAF6EE",
  muted:   "rgba(250,246,238,0.55)",
};

/* ── Inkanyezi knowledge base (rich, SA-specific) ────────────────── */
const KNOWLEDGE = `
You are InkanyeziBot — the AI sales assistant for Inkanyezi Technologies, an AI automation consultancy based in Durban, KwaZulu-Natal, South Africa.

FOUNDER: Sanele Sishange — AI automation consultant and L&D specialist. Based in eThekwini (Durban), KZN.

MISSION: Help South African SMEs replace manual, repetitive processes with intelligent AI automations — saving time, cutting costs, and growing revenue without hiring more staff.

=== SERVICES ===

1. INKANYEZI AUTOMATE
   What it is: End-to-end business process automation using Make.com, AI agents, and API integrations.
   Use cases: WhatsApp lead capture, auto-quoting, invoice reminders, appointment booking, stock alerts, CRM updates.
   Who it's for: Trade businesses (plumbing, electrical, construction), retail, logistics, professional services.
   Pricing: From R3,500/month (retainer) or R8,000–R25,000 once-off setup depending on complexity.
   Timeline: Most automations live within 2–4 weeks.

2. INKANYEZI LEARN
   What it is: AI literacy workshops and training for SME teams and corporates.
   Topics: ChatGPT for business, prompt engineering, AI tools audit, AI in customer service.
   Formats: Half-day workshop (R4,500), full-day (R7,500), 4-week programme (R18,000).
   Who it's for: Business owners, managers, customer service teams, HR departments.

3. INKANYEZI GROW
   What it is: AI-powered lead generation and marketing automation.
   Use cases: WhatsApp broadcast automation, email sequences, lead scoring, follow-up workflows.
   Pricing: From R2,500/month.
   Who it's for: Any SA business wanting to turn cold leads into booked calls automatically.

=== HOW IT WORKS ===
Step 1 — Discovery Call (free, 30 min): We map your biggest manual bottleneck.
Step 2 — Custom Blueprint: We design your automation stack and give you a fixed quote.
Step 3 — Build & Test: We build it in Make.com / custom code. You test it in real conditions.
Step 4 — Go Live + Training: We deploy, train your team, and hand over.
Step 5 — Ongoing Support: Monthly retainer keeps everything optimised and updated.

=== SA-SPECIFIC CONTEXT ===
- All automations are POPIA-compliant (South Africa's data protection law).
- We work with South African tools: WhatsApp Business API, Sage, Pastel, Shopify SA, WooCommerce, Google Workspace.
- Load shedding resilience: automations are cloud-based, run even when your office is offline.
- Pricing in ZAR. Payment via EFT or PayFast. No USD surprises.
- We understand the "SA SME reality" — tight budgets, WhatsApp-first customers, Excel-dependent processes.

=== ROI EXAMPLES ===
- A Durban plumbing company saved 14 hours/week by automating quote requests and job scheduling via WhatsApp.
- A Cape Town medical practice reduced no-shows by 60% with automated appointment reminders.
- A Joburg property agency cut admin by 80% — leads now auto-qualify and book viewings without staff.

=== TYPICAL QUESTIONS & ANSWERS ===
Q: Do I need to be technical?
A: Not at all. We handle everything. You just tell us the problem and we build the solution.

Q: What if I already use Sage/Pastel?
A: No problem. We integrate with Sage, Pastel, and most South African accounting software.

Q: How is this different from hiring a VA?
A: A VA works 8 hours a day. Your automation works 24/7, never calls in sick, and costs a fraction of a salary.

Q: Is my data safe?
A: Yes — 100% POPIA-compliant. We never share your data and use encrypted cloud infrastructure.

Q: What's the minimum budget?
A: Our smallest engagement is R2,500/month. Most SMEs start with a single automation and scale from there.

=== CONVERSATION GUIDELINES ===
PERSONALITY: Warm, intelligent, direct. SA-aware. Never robotic. Use "you" not "one". Occasional light Zulu/SA flavour ("Sawubona", "sharp sharp", "lekker") but don't overdo it.

INTELLIGENCE RULES:
- Answer any question about Inkanyezi, services, pricing, process, or AI automation naturally.
- If someone asks about a competitor or generic AI tool, you can acknowledge it then pivot to how Inkanyezi adds value.
- Never refuse to answer a reasonable business question — you are knowledgeable and helpful.
- If genuinely outside scope (personal advice, unrelated topics), gently redirect.
- Correct spelling/grammar errors silently in your understanding — never call them out.
- If someone seems frustrated or rushed, be more direct and skip pleasantries.

LEAD QUALIFICATION (natural, not interrogation):
- Understand their business type and size.
- Understand their biggest manual pain point.
- Gauge their urgency/readiness (just exploring vs. ready to start).
- Collect name, email, phone naturally in the conversation — never as a form dump.

FORM TRIGGER: After 4–6 meaningful exchanges where you have enough context, transition naturally to booking a call. Example: "I've got a good picture of what you need. The best next step is a free 30-min call — I can match you with the right automation. Can I grab your name and email to send over a booking link?"

HARD LIMITS:
- Max 6 exchanges before wrapping up or collecting contact info.
- Never quote outside the ranges above.
- Never promise a specific outcome or ROI figure.
- Never discuss competitors negatively.
- Always end with a clear next step: book a call, get the guide, or visit the website.
`;

/* ── Conversation flow stages ────────────────────────────────────── */



/* ── Speech recognition types ────────────────────────────────────── */
}

/* ── Quick-reply chips per stage ─────────────────────────────────── */
const CHIPS: Record<string, string[]> = {
  greeting: [
    "💼 I run a trade/service business",
    "🏥 I'm in healthcare or admin",
    "🏡 Real estate / property",
    "📦 Retail or logistics",
  ],
  discovery: [
    "⏰ Too much manual admin",
    "📲 Need WhatsApp automation",
    "📅 Appointment / booking chaos",
    "💸 Chasing invoices & payments",
  ],
  qualification: [
    "📊 Show me pricing",
    "🔁 How does it work?",
    "⚡ What about load shedding?",
    "📅 Book a free demo",
  ],
};

/* ═══════════════════════════════════════════════════════════════════ */
export default function EmbedPage() {
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState("");
  const [thinking, setThinking]     = useState(false);
  const [stage, setStage]           = useState("greeting");
  const [msgCount, setMsgCount]     = useState(0);
  const [showForm, setShowForm]     = useState(false);
  const [formData, setFormData]     = useState({ name: "", email: "", phone: "" });
  const [formStep, setFormStep]     = useState("name");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [interimText, setInterimText] = useState("");

  const sessionId   = useRef(Math.random().toString(36).slice(2));
  const messagesEnd = useRef(null);
  const textareaRef = useRef(null);
  const canvasRef   = useRef(null);
  const recognitionRef = useRef(null);

  /* ── Init: greeting + session restore ──────────────────────────── */
  useEffect(() => {
    // Try restore session from sessionStorage
    try {
      const saved = sessionStorage.getItem("ink_session");
      if (saved) {
        const { msgs, stg, cnt } = JSON.parse(saved);
        if (msgs?.length > 0) {
          setMessages(msgs);
          setStage(stg || "greeting");
          setMsgCount(cnt || 0);
          return;
        }
      }
    } catch {}

    // Fresh session — send greeting
    setMessages([{
      role: "assistant",
      content: "Sawubona! 👋 I'm InkanyeziBot — your AI guide to automation for South African businesses.\n\nBy chatting, you agree to our POPIA-compliant data policy.\n\nWhat does your business do, and what's the biggest challenge slowing you down right now?"
    }]);
  }, []);

  /* ── Persist session to sessionStorage ─────────────────────────── */
  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem("ink_session", JSON.stringify({
          msgs: messages, stg: stage, cnt: msgCount
        }));
      } catch {}
    }
  }, [messages, stage, msgCount]);

  /* ── Stars canvas ───────────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener("resize", resize);
    const stars = Array.from({ length: 70 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.008 + 0.002,
    }));
    const draw = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        const a = ((Math.sin(t * s.speed + s.phase) + 1) / 2) * 0.5 + 0.1;
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244,185,66,${a.toFixed(2)})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  /* ── Auto-scroll ────────────────────────────────────────────────── */
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  /* ── Auto-resize textarea ───────────────────────────────────────── */
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
  }, [input]);

  /* ── Speech recognition setup ───────────────────────────────────── */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setSpeechSupported(true);
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-ZA"; // South African English
    rec.maxAlternatives = 3;

    rec.onstart = () => setIsListening(true);
    rec.onend   = () => { setIsListening(false); setInterimText(""); };
    rec.onerror = () => { setIsListening(false); setInterimText(""); };

    rec.onresult = (e) => {
      let interim = "";
      let final   = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i];
        if (alt.isFinal) {
          // Pick best alternative
          final += alt[0].transcript;
        } else {
          interim += alt[0].transcript;
        }
      }
      if (interim) setInterimText(interim);
      if (final) {
        const cleaned = cleanSpeech(final);
        setInput(prev => (prev + " " + cleaned).trim());
        setInterimText("");
      }
    };
    recognitionRef.current = rec;
    return () => { rec.abort(); };
  }, []);

  /* ── Speech cleanup: fix common SA speech-to-text errors ──────── */
  const cleanSpeech = (text) => {
    return text
      .replace(/\bi\b/g, "I")
      .replace(/\bim\b/gi, "I'm")
      .replace(/\bdont\b/gi, "don't")
      .replace(/\bcant\b/gi, "can't")
      .replace(/\bwont\b/gi, "won't")
      .replace(/\bwhatsapp\b/gi, "WhatsApp")
      .replace(/\bai\b/gi, "AI")
      .replace(/\bsa\b/gi, "SA")
      .replace(/\s+/g, " ")
      .trim();
  };

  /* ── Toggle microphone ──────────────────────────────────────────── */
  const toggleMic = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isListening) {
      rec.stop();
    } else {
      try { rec.start(); } catch {}
    }
  }, [isListening]);

  /* ── Determine next stage based on message count ────────────────── */
  const nextStage = (count) => {
    if (count <= 2) return "greeting";
    if (count <= 4) return "discovery";
    if (count <= 5) return "qualification";
    return "form";
  };

  /* ── Send message ───────────────────────────────────────────────── */
  const send = useCallback(async (override?) => {
    const text = (override || input).trim();
    if (!text || thinking) return;
    setInput("");
    setInterimText("");

    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setThinking(true);

    const newCount = msgCount + 1;
    setMsgCount(newCount);
    const newStage = nextStage(newCount);
    setStage(newStage);

    // Trigger form after 5 user messages
    if (newCount >= 5 && !showForm) {
      setShowForm(true);
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          sessionId: sessionId.current,
          systemPrompt: KNOWLEDGE,
        }),
      });
      const data = await res.json();
      const reply = data.message || data.reply || "Sorry, something went wrong. Please try again.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please check your internet and try again." }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages, msgCount, showForm]);

  /* ── New session ────────────────────────────────────────────────── */
  const newSession = useCallback(() => {
    try { sessionStorage.removeItem("ink_session"); } catch {}
    setMessages([{
      role: "assistant",
      content: "Sawubona! 👋 I'm InkanyeziBot — your AI guide to automation for South African businesses.\n\nBy chatting, you agree to our POPIA-compliant data policy.\n\nWhat does your business do, and what's the biggest challenge slowing you down right now?"
    }]);
    setInput("");
    setStage("greeting");
    setMsgCount(0);
    setShowForm(false);
    setFormStep("name");
    setFormData({ name: "", email: "", phone: "" });
  }, []);

  /* ── Form submission ────────────────────────────────────────────── */
  const submitForm = useCallback(async () => {
    if (!formData.name || !formData.email) return;
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          sessionId: sessionId.current,
          leadData: formData,
          triggerLead: true,
        }),
      });
    } catch {}
    setStage("booked");
    setMessages(prev => [...prev, {
      role: "assistant",
      content: `Sharp sharp, ${formData.name}! 🎯\n\nI've sent your booking link to ${formData.email}. Check your inbox — it comes from inkanyeziaisolutions3@gmail.com.\n\nYou can also book directly: https://cal.com/sanele-inkanyezi/discovery-call\n\nSanele will connect with you soon. Inkosi!`
    }]);
  }, [formData, messages]);

  /* ── Current chips ──────────────────────────────────────────────── */
  const currentChips = stage !== "form" && stage !== "booked" && msgCount <= 4
    ? (CHIPS[stage] || [])
    : [];

  /* ─────────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&family=Cinzel:wght@600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden; }

        @keyframes headerShimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes orbitRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes msgFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes thinkPulse {
          0%,80%,100% { opacity: 0.15; transform: scale(0.8); }
          40%          { opacity: 1;    transform: scale(1); }
        }
        @keyframes chipAppear {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes rocketGlow {
          0%,100% { box-shadow: 0 0 14px rgba(249,115,22,0.5); }
          50%      { box-shadow: 0 0 22px rgba(249,115,22,0.8), 0 0 40px rgba(249,115,22,0.3); }
        }
        @keyframes ping {
          0%   { transform: scale(1); opacity: 0.8; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes micPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,107,53,0.5); }
          50%      { box-shadow: 0 0 0 8px rgba(255,107,53,0); }
        }
        @keyframes formSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .embed-root {
          width: 100%; height: 100vh; height: 100dvh;
          background: ${T.night};
          overflow: hidden;
          display: flex; flex-direction: column;
          position: relative;
        }
        .stars-canvas {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          pointer-events: none; z-index: 0;
        }
        .chat-shell {
          position: relative; z-index: 1;
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          background: linear-gradient(160deg, ${T.deep} 0%, ${T.night} 100%);
          overflow: hidden;
        }

        /* ── HEADER ── */
        .chat-header {
          position: relative; z-index: 2;
          background: linear-gradient(135deg, rgba(15,27,53,0.98), rgba(26,42,80,0.98));
          border-bottom: 1px solid rgba(249,115,22,0.18);
          padding: 10px 14px;
          display: flex; align-items: center; gap: 10px;
          flex-shrink: 0;
        }
        .header-shimmer {
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, ${T.gold}, ${T.orange}, ${T.gold}, transparent);
          background-size: 200% 100%;
          animation: headerShimmer 3s linear infinite;
        }
        .avatar-circle {
          width: 38px; height: 38px; border-radius: 50%;
          background: linear-gradient(135deg, ${T.orange}, #c2410c);
          display: flex; align-items: center; justify-content: center;
          font-size: 17px;
          box-shadow: 0 0 14px rgba(249,115,22,0.6);
          flex-shrink: 0; position: relative;
        }
        .orbit-ring {
          position: absolute; inset: -4px;
          animation: orbitRing 5s linear infinite;
          pointer-events: none;
        }
        .orbit-dot {
          position: absolute; top: 0; left: 50%;
          width: 5px; height: 5px; border-radius: 50%;
          background: ${T.gold}; transform: translateX(-50%);
          box-shadow: 0 0 6px ${T.gold};
        }
        .header-info { flex: 1; min-width: 0; }
        .header-name {
          font-family: 'Syne', sans-serif; font-weight: 800;
          font-size: 13px; color: #fff; letter-spacing: -0.01em;
        }
        .header-status {
          font-size: 10px; color: ${T.orange};
          display: flex; align-items: center; gap: 5px;
          font-family: 'DM Sans', sans-serif; margin-top: 1px;
        }
        .ping-wrap { position: relative; display: inline-flex; align-items: center; justify-content: center; }
        .ping-anim { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #22C55E; animation: ping 2s ease-out infinite; }
        .ping-dot  { width: 8px; height: 8px; border-radius: 50%; background: #22C55E; display: block; }

        .new-chat-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(244,185,66,0.2);
          border-radius: 8px;
          padding: 4px 8px;
          color: rgba(255,255,255,0.5);
          font-size: 9px;
          font-family: 'Space Mono', monospace;
          cursor: pointer;
          letter-spacing: 0.05em;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .new-chat-btn:hover {
          border-color: rgba(244,185,66,0.5);
          color: ${T.gold};
          background: rgba(244,185,66,0.08);
        }

        /* ── MESSAGES ── */
        .msg-area {
          flex: 1; overflow-y: auto;
          padding: 12px 12px 6px;
          display: flex; flex-direction: column; gap: 10px;
          position: relative; z-index: 2; min-height: 0;
        }
        .msg-area::-webkit-scrollbar { width: 3px; }
        .msg-area::-webkit-scrollbar-track { background: transparent; }
        .msg-area::-webkit-scrollbar-thumb { background: rgba(244,185,66,0.25); border-radius: 2px; }

        .msg-bubble { animation: msgFadeUp 0.3s ease forwards; }
        .msg-row { display: flex; align-items: flex-end; gap: 6px; }
        .msg-row.user { justify-content: flex-end; }
        .msg-row.assistant { justify-content: flex-start; }

        .msg-avatar {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, ${T.orange}, #c2410c);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; box-shadow: 0 0 8px rgba(249,115,22,0.4);
        }
        .msg-text {
          max-width: 78%; padding: 9px 12px; border-radius: 14px;
          font-size: 13px; line-height: 1.6; word-break: break-word;
          font-family: 'DM Sans', sans-serif; white-space: pre-wrap;
        }
        .msg-text.assistant {
          background: rgba(255,255,255,0.055); color: #fff;
          border: 1px solid rgba(249,115,22,0.13);
          border-bottom-left-radius: 3px;
        }
        .msg-text.user {
          background: linear-gradient(135deg, rgba(255,107,53,0.25), rgba(244,185,66,0.15));
          color: #fff; border: 1px solid rgba(244,185,66,0.2);
          border-bottom-right-radius: 3px;
        }

        /* Chips */
        .chips-wrap { display: flex; flex-direction: column; gap: 5px; margin-top: 4px; }
        .chips-label {
          font-size: 9px; color: rgba(255,255,255,0.28);
          font-family: 'Space Mono', monospace; letter-spacing: 0.1em;
          text-align: center; margin-bottom: 2px;
        }
        .chip-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(249,115,22,0.2);
          border-radius: 8px; padding: 7px 11px;
          color: rgba(255,255,255,0.7); font-size: 12px;
          cursor: pointer; text-align: left;
          font-family: 'DM Sans', sans-serif;
          animation: chipAppear 0.3s ease forwards;
          transition: all 0.2s;
        }
        .chip-btn:hover {
          background: rgba(244,185,66,0.12);
          border-color: rgba(244,185,66,0.45);
          color: #fff; transform: translateX(2px);
        }

        /* Thinking */
        .thinking {
          display: flex; gap: 4px; padding: 10px 14px;
          background: rgba(255,255,255,0.04);
          border-radius: 14px; border-bottom-left-radius: 3px;
          width: fit-content;
        }
        .think-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: rgba(244,185,66,0.7);
          animation: thinkPulse 1.4s ease-in-out infinite;
        }
        .think-dot:nth-child(2) { animation-delay: 0.2s; }
        .think-dot:nth-child(3) { animation-delay: 0.4s; }

        /* ── LEAD CAPTURE FORM ── */
        .lead-form {
          background: rgba(10,22,40,0.9);
          border: 1px solid rgba(244,185,66,0.25);
          border-radius: 12px; padding: 14px;
          margin: 0 0 8px 0;
          animation: formSlide 0.4s ease forwards;
          position: relative; z-index: 2;
          flex-shrink: 0;
        }
        .lead-form-title {
          font-family: 'Cinzel', serif; font-size: 10px;
          letter-spacing: 0.15em; color: ${T.gold};
          text-transform: uppercase; margin-bottom: 10px;
          text-align: center;
        }
        .form-progress {
          display: flex; gap: 4px; justify-content: center; margin-bottom: 10px;
        }
        .progress-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: rgba(255,255,255,0.15);
          transition: background 0.3s;
        }
        .progress-dot.done { background: ${T.teal}; }
        .progress-dot.active { background: ${T.gold}; }

        .form-field {
          display: flex; flex-direction: column; gap: 5px;
        }
        .form-label {
          font-size: 9px; letter-spacing: 0.1em;
          color: rgba(255,255,255,0.4);
          font-family: 'Space Mono', monospace;
          text-transform: uppercase;
        }
        .form-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(249,115,22,0.2);
          border-radius: 9px; padding: 8px 12px;
          color: #fff; font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          outline: none; transition: border-color 0.2s;
          width: 100%;
        }
        .form-input:focus { border-color: rgba(244,185,66,0.5); }
        .form-input::placeholder { color: rgba(255,255,255,0.25); }
        .form-hint {
          font-size: 10px; color: rgba(255,255,255,0.3);
          font-family: 'DM Sans', sans-serif; margin-top: 2px;
        }
        .form-btn {
          width: 100%; margin-top: 10px;
          background: linear-gradient(135deg, ${T.orange}, ${T.gold});
          border: none; border-radius: 9px;
          padding: 10px; color: #fff;
          font-family: 'Syne', sans-serif; font-weight: 700;
          font-size: 12px; letter-spacing: 0.05em;
          cursor: pointer; transition: all 0.2s;
        }
        .form-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(249,115,22,0.4); }
        .form-skip {
          text-align: center; margin-top: 6px;
          font-size: 10px; color: rgba(255,255,255,0.2);
          font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: color 0.2s;
        }
        .form-skip:hover { color: rgba(255,255,255,0.45); }

        /* ── INPUT BAR ── */
        .input-bar {
          position: relative; z-index: 2;
          padding: 8px 10px 10px;
          border-top: 1px solid rgba(249,115,22,0.12);
          background: rgba(15,27,53,0.97); flex-shrink: 0;
        }
        .input-row { display: flex; gap: 6px; align-items: flex-end; }
        .msg-input {
          flex: 1; padding: 8px 12px; border-radius: 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(249,115,22,0.18);
          color: #fff; outline: none; font-size: 13px;
          resize: none; line-height: 1.5;
          overflow-y: auto; max-height: 96px;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s;
        }
        .msg-input::placeholder { color: rgba(255,255,255,0.28); }
        .msg-input:focus { border-color: rgba(244,185,66,0.4); }
        .msg-input::-webkit-scrollbar { width: 2px; }
        .msg-input::-webkit-scrollbar-thumb { background: rgba(244,185,66,0.3); }

        .mic-btn {
          width: 36px; height: 36px; border-radius: 50%;
          border: 1px solid rgba(249,115,22,0.3);
          background: rgba(255,107,53,0.1);
          color: rgba(255,107,53,0.7);
          font-size: 15px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; flex-shrink: 0;
        }
        .mic-btn.listening {
          background: rgba(255,107,53,0.25);
          border-color: ${T.orange};
          color: ${T.orange};
          animation: micPulse 1s ease-in-out infinite;
        }
        .mic-btn:hover { background: rgba(255,107,53,0.2); color: ${T.orange}; }

        .send-btn {
          width: 36px; height: 36px; border-radius: 50%;
          flex-shrink: 0; border: none; color: #fff;
          font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .send-btn.active {
          background: linear-gradient(135deg, ${T.orange}, ${T.gold});
          cursor: pointer; animation: rocketGlow 2s ease infinite;
        }
        .send-btn.active:hover { transform: scale(1.08) rotate(-5deg); box-shadow: 0 0 30px rgba(249,115,22,0.9); }
        .send-btn.inactive { background: rgba(249,115,22,0.2); cursor: not-allowed; opacity: 0.4; }

        .interim-text {
          font-size: 11px; color: rgba(255,255,255,0.35);
          font-family: 'DM Sans', sans-serif; font-style: italic;
          padding: 2px 0 0 2px; min-height: 16px;
        }
        .input-footer {
          margin-top: 4px; text-align: center; font-size: 9px;
          color: rgba(255,255,255,0.15); font-family: 'Space Mono', monospace;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="embed-root">
        <canvas className="stars-canvas" ref={canvasRef} />

        <div className="chat-shell">

          {/* ── HEADER ─────────────────────────────────────────────── */}
          <div className="chat-header">
            <div className="header-shimmer" />
            <div className="avatar-circle" style={{ position: "relative" }}>
              ⭐
              <div className="orbit-ring"><div className="orbit-dot" /></div>
            </div>
            <div className="header-info">
              <div className="header-name">
                InkanyeziBot{" "}
                <span style={{ fontSize: 10, color: T.gold, fontFamily: "'Space Mono', monospace", fontWeight: 400 }}>✦</span>
              </div>
              <div className="header-status">
                <span className="ping-wrap">
                  <span className="ping-anim" />
                  <span className="ping-dot" />
                </span>
                <span>Online · AI Automation · Durban, ZA</span>
              </div>
            </div>
            <button className="new-chat-btn" onClick={newSession} title="Start a new conversation">
              ↺ NEW
            </button>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>🇿🇦 SA AI</div>
              <div style={{ display: "flex", gap: 2, justifyContent: "flex-end", marginTop: 3 }}>
                {(["#007A4D",11],["#FFB612",11],["#DE3831",18],["#002395",11],["#FFFFFF",11]) &&
                  [["#007A4D",11],["#FFB612",11],["#DE3831",18],["#002395",11],["#FFFFFF",11]].map(([c,w],i) => (
                  <div key={i} style={{ width: w, height: "2.5px", background: c, borderRadius: 2, opacity: 0.7 }} />
                ))}
              </div>
            </div>
          </div>

          {/* ── MESSAGES ────────────────────────────────────────────── */}
          <div className="msg-area">
            {messages.map((m, i) => (
              <div className="msg-bubble" key={i} style={{ animationDelay: `${i * 0.04}s` }}>
                <div className={`msg-row ${m.role}`}>
                  {m.role === "assistant" && <div className="msg-avatar">⭐</div>}
                  <div className={`msg-text ${m.role}`}>{m.content}</div>
                </div>

                {/* Show chips after first assistant message and when in early stages */}
                {i === 0 && m.role === "assistant" && currentChips.length > 0 && (
                  <div className="chips-wrap" style={{ marginLeft: 28 }}>
                    <div className="chips-label">Quick replies:</div>
                    {currentChips.map((chip, ci) => (
                      <button
                        key={ci}
                        className="chip-btn"
                        style={{ animationDelay: `${ci * 0.08}s`, opacity: 0 }}
                        onClick={() => send(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {/* Show contextual chips after latest assistant message */}
                {i === messages.length - 1 && m.role === "assistant" && currentChips.length > 0 && i > 0 && (
                  <div className="chips-wrap" style={{ marginLeft: 28, marginTop: 6 }}>
                    {currentChips.slice(0, 2).map((chip, ci) => (
                      <button
                        key={ci}
                        className="chip-btn"
                        style={{ animationDelay: `${ci * 0.08}s`, opacity: 0 }}
                        onClick={() => send(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {thinking && (
              <div className="msg-row assistant">
                <div className="msg-avatar">⭐</div>
                <div className="thinking">
                  <div className="think-dot" /><div className="think-dot" /><div className="think-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {/* ── LEAD CAPTURE FORM ───────────────────────────────────── */}
          {showForm && stage !== "booked" && (
            <div className="lead-form">
              <div className="lead-form-title">✦ Book Your Free Discovery Call</div>
              <div className="form-progress">
                {["name","email","phone"].map((s,i) => (
                  <div key={i} className={`progress-dot ${
                    (formStep === "name" && i === 0) ||
                    (formStep === "email" && i === 1) ||
                    (formStep === "phone" && i === 2) ? "active" :
                    (formStep === "email" && i < 1) ||
                    (formStep === "phone" && i < 2) ||
                    (formStep === "done" && i < 3) ? "done" : ""
                  }`} />
                ))}
              </div>

              {formStep === "name" && (
                <div className="form-field">
                  <div className="form-label">Your name</div>
                  <input
                    className="form-input"
                    placeholder="e.g. Thabo Nkosi"
                    value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && formData.name.trim() && setFormStep("email")}
                    autoFocus
                  />
                  <button
                    className="form-btn"
                    onClick={() => formData.name.trim() && setFormStep("email")}
                    disabled={!formData.name.trim()}
                  >Continue →</button>
                </div>
              )}

              {formStep === "email" && (
                <div className="form-field">
                  <div className="form-label">Email address</div>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="e.g. thabo@business.co.za"
                    value={formData.email}
                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && formData.email.trim() && setFormStep("phone")}
                    autoFocus
                  />
                  <div className="form-hint">Your booking link will be sent here</div>
                  <button
                    className="form-btn"
                    onClick={() => formData.email.trim() && setFormStep("phone")}
                    disabled={!formData.email.trim()}
                  >Continue →</button>
                </div>
              )}

              {formStep === "phone" && (
                <div className="form-field">
                  <div className="form-label">WhatsApp number <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 400 }}>(optional)</span></div>
                  <input
                    className="form-input"
                    type="tel"
                    placeholder="e.g. 082 456 7890"
                    value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && submitForm()}
                    autoFocus
                  />
                  <button className="form-btn" onClick={submitForm}>
                    🚀 Book My Free Call
                  </button>
                  <div className="form-skip" onClick={submitForm}>Skip — book without phone</div>
                </div>
              )}
            </div>
          )}

          {/* ── INPUT BAR ───────────────────────────────────────────── */}
          <div className="input-bar">
            <div className="input-row">
              <textarea
                ref={textareaRef}
                className="msg-input"
                rows={1}
                placeholder={isListening ? "🎙 Listening..." : "Ask me anything about AI automation..."}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                style={isListening ? { borderColor: "rgba(255,107,53,0.5)" } : undefined}
              />
              {speechSupported && (
                <button
                  className={`mic-btn ${isListening ? "listening" : ""}`}
                  onClick={toggleMic}
                  title={isListening ? "Stop listening" : "Tap to speak"}
                  aria-label={isListening ? "Stop listening" : "Speak"}
                >
                  🎙
                </button>
              )}
              <button
                className={`send-btn ${input.trim() && !thinking ? "active" : "inactive"}`}
                onClick={() => send()}
                disabled={!input.trim() || thinking}
                title="Launch message 🚀"
              >
                🚀
              </button>
            </div>
            {interimText && <div className="interim-text">{interimText}…</div>}
            <div className="input-footer">✦ INKANYEZI TECHNOLOGIES · WE ARE THE SIGNAL IN THE NOISE ✦</div>
          </div>

        </div>
      </div>
    </>
  );
}
