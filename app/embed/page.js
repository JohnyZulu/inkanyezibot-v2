'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// ── BRAND TOKENS ──────────────────────────────────────────────────────────────
const BRAND = {
  midnight: '#0A1628',
  midnightDeep: '#060E1A',
  gold: '#F4B942',
  orange: '#FF6B35',
  saGreen: '#007A4D',
  saGold: '#FFB612',
  saRed: '#DE3831',
  saBlue: '#002395',
};

// ── TRIGGER SIGNAL WEIGHTS ────────────────────────────────────────────────────
// 🔮 Move to Vercel Edge Config for remote tuning without redeployment
const SIGNALS = {
  QUALIFICATION_STAGES: { interested: 30, ready: 60, exploring: 10, objecting: 5, new: 0 },
  HAS_PAIN_POINT: 20,
  HAS_INDUSTRY: 15,
  HAS_STAFF_COUNT: 10,
  HAS_BUDGET_SIGNAL: { high: 25, medium: 15, low: 5 },
  MESSAGE_COUNT_BONUS: 5,
  DEMO_BOOKED: 100,
  EXPLICIT_REQUEST: 80,
};
const TRIGGER_THRESHOLD = 45;
const MIN_MESSAGES = 3;

const INTEREST_PHRASES = [
  'get in touch', 'contact', 'speak to someone', 'call me', 'reach out',
  'book a demo', 'schedule', 'sign up', 'get started',
  'how much', 'pricing', 'cost', 'quote', 'proposal',
  'want to know more', 'sounds good', "let's do it",
  'ready to', 'can you help', 'would you help',
];

const INDUSTRIES = [
  { value: 'plumbing', label: '🔧 Plumbing & Trade' },
  { value: 'electrical', label: '⚡ Electrical & HVAC' },
  { value: 'construction', label: '🏗️ Construction' },
  { value: 'healthcare', label: '🏥 Healthcare' },
  { value: 'property', label: '🏘️ Property & Real Estate' },
  { value: 'retail', label: '🛒 Retail & Wholesale' },
  { value: 'transport', label: '🚛 Transport & Logistics' },
  { value: 'hospitality', label: '🍽️ Hospitality & Food' },
  { value: 'professional', label: '💼 Professional Services' },
  { value: 'education', label: '📚 Education & Training' },
  { value: 'technology', label: '💻 Technology' },
  { value: 'other', label: '◎ Other' },
];

const SERVICES = [
  { value: 'automate', label: '⚙️ Automate — Business Automation' },
  { value: 'learn', label: '🎓 Learn — AI Training' },
  { value: 'grow', label: '📈 Grow — AI Strategy' },
  { value: 'unsure', label: '✦ Just exploring' },
];

// ── TRIGGER SCORE CALCULATOR ──────────────────────────────────────────────────
function calculateTriggerScore(sessionContext, userMessageCount, lastUserMessage) {
  let score = 0;
  const reasons = [];
  if (!sessionContext) return { score: 0, reasons: [], shouldShow: false };

  const stage = sessionContext.qualification_stage || 'new';
  const stageScore = SIGNALS.QUALIFICATION_STAGES[stage] || 0;
  if (stageScore > 0) { score += stageScore; reasons.push(`stage:${stage}`); }
  if (sessionContext.pain_point) { score += SIGNALS.HAS_PAIN_POINT; reasons.push('pain_point'); }
  if (sessionContext.industry) { score += SIGNALS.HAS_INDUSTRY; reasons.push('industry'); }
  if (sessionContext.staff_count) { score += SIGNALS.HAS_STAFF_COUNT; reasons.push('staff_count'); }
  if (sessionContext.budget_signal) {
    const s = SIGNALS.HAS_BUDGET_SIGNAL[sessionContext.budget_signal] || 0;
    score += s; reasons.push(`budget:${sessionContext.budget_signal}`);
  }
  if (userMessageCount > 4) {
    const bonus = Math.floor((userMessageCount - 4) / 3) * SIGNALS.MESSAGE_COUNT_BONUS;
    score += bonus; if (bonus > 0) reasons.push(`depth:${bonus}`);
  }
  if (sessionContext.demo_booked) { score += SIGNALS.DEMO_BOOKED; reasons.push('demo_booked'); }
  if (lastUserMessage) {
    const lower = lastUserMessage.toLowerCase();
    const matched = INTEREST_PHRASES.find(p => lower.includes(p));
    if (matched) { score += SIGNALS.EXPLICIT_REQUEST; reasons.push(`phrase:${matched}`); }
  }

  return { score, reasons, shouldShow: score >= TRIGGER_THRESHOLD && userMessageCount >= MIN_MESSAGES };
}

// ── MINI STAR CANVAS ──────────────────────────────────────────────────────────
function MiniStars() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    let animId;
    const stars = Array.from({ length: 35 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.1 + 0.2, pulse: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.02 + 0.005, gold: Math.random() > 0.82,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        s.pulse += s.speed;
        const op = 0.25 + 0.4 * Math.sin(s.pulse);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.gold ? `rgba(244,185,66,${op})` : `rgba(255,255,255,${op * 0.5})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: '10px' }} />;
}

// ── HERITAGE STRIP ────────────────────────────────────────────────────────────
function HeritageStrip({ style }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', ...style }}>
      {[BRAND.saGreen, BRAND.saGold, BRAND.saRed, BRAND.saBlue, '#ffffff'].map((c, i) => (
        <div key={i} style={{ width: i === 2 ? 14 : 9, height: 2.5, background: c, borderRadius: 2, opacity: 0.6 }} />
      ))}
    </div>
  );
}

// ── LEAD FORM FIELD ───────────────────────────────────────────────────────────
function FormField({ label, name, type = 'text', placeholder, value, onChange, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={{
        display: 'block', fontSize: '0.58rem', letterSpacing: '0.12em',
        textTransform: 'uppercase', fontFamily: "'Space Mono', monospace",
        color: focused ? BRAND.gold : 'rgba(255,255,255,0.38)',
        marginBottom: '0.25rem', transition: 'color 0.2s',
      }}>
        {label}{required && <span style={{ color: BRAND.orange }}> *</span>}
      </label>
      <input
        type={type} name={name} value={value} onChange={onChange}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} required={required}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: focused ? 'rgba(244,185,66,0.04)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${focused ? 'rgba(244,185,66,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: '5px', padding: '0.5rem 0.65rem',
          color: '#fff', fontSize: '0.8rem',
          fontFamily: "'DM Sans', sans-serif",
          outline: 'none', transition: 'all 0.2s',
        }}
      />
    </div>
  );
}

function FormSelect({ label, name, value, onChange, options, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <label style={{
        display: 'block', fontSize: '0.58rem', letterSpacing: '0.12em',
        textTransform: 'uppercase', fontFamily: "'Space Mono', monospace",
        color: focused ? BRAND.gold : 'rgba(255,255,255,0.38)',
        marginBottom: '0.25rem', transition: 'color 0.2s',
      }}>
        {label}{required && <span style={{ color: BRAND.orange }}> *</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <select
          name={name} value={value} onChange={onChange}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          required={required}
          style={{
            width: '100%', appearance: 'none', boxSizing: 'border-box',
            background: 'rgba(10,22,40,0.95)',
            border: `1px solid ${focused ? 'rgba(244,185,66,0.4)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '5px', padding: '0.5rem 1.8rem 0.5rem 0.65rem',
            color: value ? '#fff' : 'rgba(255,255,255,0.28)',
            fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif",
            outline: 'none', cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <option value="" disabled style={{ background: '#0A1628' }}>Choose...</option>
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ background: '#0A1628', color: '#fff' }}>{o.label}</option>
          ))}
        </select>
        <span style={{ position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }}>▼</span>
      </div>
    </div>
  );
}

// ── INLINE LEAD CAPTURE FORM CARD ─────────────────────────────────────────────
function ChatLeadForm({ onSubmit, onDismiss, sessionContext = {}, submitting = false }) {
  const [submitted, setSubmitted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState({
    name: sessionContext?.name || '',
    email: sessionContext?.email || '',
    phone: sessionContext?.whatsapp || '',
    company: sessionContext?.business || '',
    industry: sessionContext?.industry || '',
    service_interest: '',
    message: sessionContext?.pain_point || '',
  });

  // Re-fill as bot learns more context mid-conversation
  useEffect(() => {
    setForm(f => ({
      ...f,
      name: f.name || sessionContext?.name || '',
      email: f.email || sessionContext?.email || '',
      phone: f.phone || sessionContext?.whatsapp || '',
      company: f.company || sessionContext?.business || '',
      industry: f.industry || sessionContext?.industry || '',
      message: f.message || sessionContext?.pain_point || '',
    }));
  }, [sessionContext]);

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!consent) return;
    const result = await onSubmit?.(form);
    if (result?.success !== false) setSubmitted(true);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        @keyframes inkSlideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes inkShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes inkSpin { to { transform: rotate(360deg); } }
        @keyframes inkPulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,185,66,0.35)} 50%{box-shadow:0 0 0 5px rgba(244,185,66,0)} }
        .ink-form-row { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; }
        @media(max-width:360px){.ink-form-row{grid-template-columns:1fr;}}
        .ink-input::placeholder{color:rgba(255,255,255,0.2)!important;}
        .ink-input:-webkit-autofill{-webkit-box-shadow:0 0 0 30px #0D1E35 inset!important;-webkit-text-fill-color:#fff!important;}
      `}</style>

      {/* Appears as a bot message */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
      }}>
        {/* Bot avatar row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: `linear-gradient(135deg, ${BRAND.gold}, ${BRAND.orange})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', color: BRAND.midnight,
            animation: 'inkPulse 2.5s ease infinite',
          }}>✦</div>
          <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontFamily: "'Space Mono', monospace" }}>InkanyeziBot</span>
        </div>

        {/* CARD */}
        <div style={{
          width: '100%',
          background: 'linear-gradient(145deg, rgba(10,22,40,0.97), rgba(6,14,26,0.99))',
          border: '1px solid rgba(244,185,66,0.15)',
          borderRadius: '12px', borderTopLeftRadius: '3px',
          overflow: 'hidden', position: 'relative',
          boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
          animation: 'inkSlideUp 0.4s ease forwards',
        }}>
          <MiniStars />

          {/* Shimmer bar */}
          <div style={{
            height: '2px',
            background: `linear-gradient(90deg, transparent, ${BRAND.gold}, ${BRAND.orange}, ${BRAND.gold}, transparent)`,
            backgroundSize: '200% 100%', animation: 'inkShimmer 3s linear infinite',
          }} />

          {/* Dismiss */}
          {onDismiss && !submitted && (
            <button onClick={onDismiss} style={{
              position: 'absolute', top: '0.5rem', right: '0.5rem',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '3px', padding: '1px 5px',
              color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem',
              cursor: 'pointer', zIndex: 10, fontFamily: "'Space Mono', monospace",
            }}>✕</button>
          )}

          <div style={{ padding: '0.85rem 0.95rem 0.95rem', position: 'relative', zIndex: 1 }}>
            {submitted ? (
              /* SUCCESS */
              <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', margin: '0 auto 0.6rem',
                  background: 'rgba(244,185,66,0.1)', border: '1px solid rgba(244,185,66,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
                }}>✦</div>
                <p style={{ fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', fontWeight: 800, color: '#fff', margin: '0 0 0.3rem' }}>
                  Signal received,{' '}
                  <span style={{ background: `linear-gradient(90deg, ${BRAND.gold}, ${BRAND.orange})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    {form.name?.split(' ')[0] || 'friend'}
                  </span>
                </p>
                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 0.65rem', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                  {form.company ? `We'll reach out to ${form.company} within 24 hours.` : "Sanele will be in touch within 24 hours."}
                </p>
                <HeritageStrip style={{ justifyContent: 'center' }} />
              </div>
            ) : (
              /* FORM */
              <>
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: BRAND.gold, fontFamily: "'Space Mono', monospace", marginBottom: '0.25rem' }}>
                    ✦ Inkanyezi Technologies
                  </div>
                  <h3 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: '0.95rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                    Let's make this{' '}
                    <span style={{ background: `linear-gradient(90deg, ${BRAND.gold}, ${BRAND.orange})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>official</span>
                  </h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>
                    Share your details — Sanele will personally follow up within 24 hours.
                  </p>
                  <HeritageStrip style={{ marginTop: '0.5rem' }} />
                </div>

                <form onSubmit={handleSubmit} className="ink-input">
                  <div className="ink-form-row" style={{ marginBottom: '0.5rem' }}>
                    <FormField label="Your Name" name="name" placeholder="e.g. Sipho" value={form.name} onChange={handleChange} required />
                    <FormField label="Business" name="company" placeholder="e.g. Dlamini Co." value={form.company} onChange={handleChange} />
                  </div>
                  <div className="ink-form-row" style={{ marginBottom: '0.5rem' }}>
                    <FormField label="Email" name="email" type="email" placeholder="you@business.co.za" value={form.email} onChange={handleChange} required />
                    <FormField label="WhatsApp" name="phone" type="tel" placeholder="+27 82 ..." value={form.phone} onChange={handleChange} />
                  </div>
                  <div className="ink-form-row" style={{ marginBottom: '0.5rem' }}>
                    <FormSelect label="Industry" name="industry" value={form.industry} onChange={handleChange} options={INDUSTRIES} required />
                    <FormSelect label="How we help" name="service_interest" value={form.service_interest} onChange={handleChange} options={SERVICES} required />
                  </div>

                  {/* Consent */}
                  <label style={{ display: 'flex', gap: '0.5rem', cursor: 'pointer', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
                    <div
                      onClick={() => setConsent(c => !c)}
                      style={{
                        width: 14, height: 14, flexShrink: 0, marginTop: 2,
                        border: `1px solid ${consent ? BRAND.gold : 'rgba(255,255,255,0.2)'}`,
                        borderRadius: '2px', background: consent ? 'rgba(244,185,66,0.12)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s', cursor: 'pointer',
                      }}
                    >
                      {consent && <span style={{ color: BRAND.gold, fontSize: '9px', lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif" }}>
                      I consent to Inkanyezi Technologies contacting me per{' '}
                      <span style={{ color: BRAND.gold }}>POPIA</span>.{' '}
                      <span style={{ color: BRAND.orange }}>*</span>
                    </span>
                  </label>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting || !consent}
                    style={{
                      width: '100%', padding: '0.6rem',
                      background: submitting || !consent ? 'rgba(244,185,66,0.1)' : `linear-gradient(90deg, ${BRAND.gold}, ${BRAND.orange})`,
                      border: 'none', borderRadius: '5px',
                      color: submitting || !consent ? 'rgba(255,255,255,0.25)' : BRAND.midnight,
                      fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                      fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                      cursor: submitting || !consent ? 'not-allowed' : 'pointer',
                      transition: 'all 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    }}
                  >
                    {submitting ? (
                      <>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid rgba(255,255,255,0.7)', display: 'inline-block', animation: 'inkSpin 0.7s linear infinite' }} />
                        Transmitting...
                      </>
                    ) : '✦ Send My Details'}
                  </button>

                  <p style={{ textAlign: 'center', fontSize: '0.58rem', color: 'rgba(255,255,255,0.18)', margin: '0.5rem 0 0', fontFamily: "'Space Mono', monospace" }}>
                    Durban, KZN 🇿🇦 · We are the signal in the noise.
                  </p>
                </form>
              </>
            )}
          </div>
          <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(244,185,66,0.12), transparent)' }} />
        </div>
      </div>
    </>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Sawubona! 👋 I'm InkanyeziBot — your AI guide to automation for South African businesses.\n\nBy chatting, you agree to our POPIA-compliant data policy.\n\nWhat does your business do, and what's the biggest challenge slowing you down right now?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionContext, setSessionContext] = useState(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // ── Lead capture state ──────────────────────────────────────────────────────
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadFormSubmitted, setLeadFormSubmitted] = useState(false);
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const hasTriggered = useRef(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showLeadForm]);

  // ── Trigger evaluation after every bot reply ────────────────────────────────
  useEffect(() => {
    if (hasTriggered.current || leadFormSubmitted || !sessionContext) return;
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';
    const { shouldShow } = calculateTriggerScore(sessionContext, userMessages.length, lastUserMsg);
    if (shouldShow) {
      hasTriggered.current = true;
      // Delay slightly so it appears after the bot's reply animation
      setTimeout(() => setShowLeadForm(true), 1200);
    }
  }, [messages, sessionContext, leadFormSubmitted]);

  const formatMessage = (text) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, sessionId }),
      });
      const data = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: data.message }]);

      // Update session context if returned from the API
      // 🔮 Future: /api/chat can return context in response for richer triggering
      if (data.context) setSessionContext(data.context);

    } catch (error) {
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Lead form submission ────────────────────────────────────────────────────
  const handleLeadSubmit = useCallback(async (formData) => {
    setLeadSubmitting(true);
    try {
      // Build rich lead event with full conversation context
      const conversationSummary = messages
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'Customer' : 'InkanyeziBot'}: ${m.content}`)
        .join('\n');

      const userMessageCount = messages.filter(m => m.role === 'user').length;
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
      const { score, reasons } = calculateTriggerScore(sessionContext, userMessageCount, lastUserMsg);

      const leadEvent = {
        // Core fields — match Make scenario exactly
        name: formData.name || sessionContext?.name || '',
        email: formData.email || sessionContext?.email || '',
        phone: formData.phone || sessionContext?.whatsapp || '',
        company: formData.company || sessionContext?.business || '',
        industry: formData.industry || sessionContext?.industry || '',
        service_interest: formData.service_interest || '',
        message: formData.message || sessionContext?.pain_point || '',
        has_email: (formData.email || sessionContext?.email) ? 'true' : 'false',
        has_whatsapp: (formData.phone || sessionContext?.whatsapp) ? 'true' : 'false',
        source: 'chatbot-lead-form',

        // Conversation intelligence
        session_id: sessionId,
        message_count: userMessageCount,
        conversation_summary: conversationSummary,
        qualification_stage: sessionContext?.qualification_stage || 'new',
        pain_point: sessionContext?.pain_point || '',
        budget_signal: sessionContext?.budget_signal || '',
        staff_count: sessionContext?.staff_count || '',
        demo_booked: sessionContext?.demo_booked || false,
        reference_number: sessionContext?.referenceNumber || '',
        trigger_score: score,
        trigger_reason: reasons.join(', '),

        // Timestamps
        timestamp: new Date().toISOString(),
        sast_time: new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }),

        // 🔮 Future fields:
        // ai_lead_score: null,
        // sentiment_score: null,
        // utm_source: null,
        // page_url: window.location.href,
      };

      const webhookUrl = process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL;
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadEvent),
        });
      }

      setLeadFormSubmitted(true);
      setShowLeadForm(false);

      // Bot acknowledges the submission naturally
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✦ Got it${formData.name ? `, ${formData.name.split(' ')[0]}` : ''}! Your details have been received. Sanele will personally reach out within 24 hours.\n\nIn the meantime, is there anything else you'd like to know about how we can help ${formData.company || 'your business'}?`
        }]);
      }, 600);

      return { success: true };
    } catch (err) {
      console.error('[Inkanyezi] Lead submission error:', err);
      return { success: false };
    } finally {
      setLeadSubmitting(false);
    }
  }, [messages, sessionContext, sessionId]);

  // EMBED MODE — no bubble, chat fills 100% of iframe
  return (
    <main style={{ width: '100%', height: '100vh', background: '#0B1120', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {true && (
        <div style={{ width: '100%', flex: 1, background: '#0B1120', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0f1b35, #1a2a50)',
            borderBottom: '1px solid rgba(249,115,22,0.2)',
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316, #c2410c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', flexShrink: 0,
              boxShadow: '0 0 12px rgba(249,115,22,0.5)',
            }}>⭐</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700', fontSize: '15px', color: '#ffffff' }}>InkanyeziBot</div>
              <div style={{ fontSize: '11px', color: '#f97316', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
                Online · Inkanyezi Technologies
              </div>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>🇿🇦 SA AI</div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px',
            display: 'flex', flexDirection: 'column', gap: '10px',
            background: '#0B1120',
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-end', gap: '6px',
              }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #f97316, #c2410c)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', flexShrink: 0,
                  }}>⭐</div>
                )}
                <div
                  style={{
                    maxWidth: '78%', padding: '10px 14px', borderRadius: '14px',
                    fontSize: '13px', lineHeight: '1.6', wordBreak: 'break-word',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #f97316, #c2410c)'
                      : 'rgba(255,255,255,0.06)',
                    color: '#ffffff',
                    border: msg.role === 'user' ? 'none' : '1px solid rgba(249,115,22,0.15)',
                    boxShadow: msg.role === 'user' ? '0 0 12px rgba(249,115,22,0.3)' : 'none',
                    borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '14px',
                    borderBottomRightRadius: msg.role === 'user' ? '4px' : '14px',
                  }}
                  dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                />
              </div>
            ))}

            {/* ── INLINE LEAD FORM — appears as a bot message ── */}
            {showLeadForm && !leadFormSubmitted && (
              <ChatLeadForm
                onSubmit={handleLeadSubmit}
                onDismiss={() => setShowLeadForm(false)}
                sessionContext={sessionContext}
                submitting={leadSubmitting}
              />
            )}

            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f97316, #c2410c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px',
                }}>⭐</div>
                <div style={{
                  background: 'rgba(255,255,255,0.06)', padding: '10px 16px',
                  borderRadius: '14px', borderBottomLeftRadius: '4px',
                  fontSize: '13px', color: '#f97316',
                  border: '1px solid rgba(249,115,22,0.15)',
                }}>✦ Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(249,115,22,0.15)', background: '#0f1b35' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder="Type a message... (Enter to send)"
                rows={1}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '16px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(249,115,22,0.2)',
                  color: '#ffffff', outline: 'none', fontSize: '13px',
                  resize: 'none', lineHeight: '1.5', wordBreak: 'break-word',
                  overflowY: 'auto', maxHeight: '100px', fontFamily: 'sans-serif',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading}
                style={{
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: isLoading ? 'rgba(249,115,22,0.4)' : 'linear-gradient(135deg, #f97316, #c2410c)',
                  border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: 'white', fontSize: '16px', flexShrink: 0,
                  boxShadow: '0 0 12px rgba(249,115,22,0.4)',
                }}>➤</button>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '6px', textAlign: 'center' }}>
              Press Enter to send · Shift+Enter for new line
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '6px', textAlign: 'center', background: '#0f1b35',
            fontSize: '10px', color: 'rgba(255,255,255,0.25)',
            borderTop: '1px solid rgba(249,115,22,0.1)',
          }}>
            ⭐ Powered by Inkanyezi Technologies · AI Automation 🇿🇦
          </div>
        </div>
      )}
    </main>
  );
}
