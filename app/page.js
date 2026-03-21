'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

// ── DESIGN SYSTEM ─────────────────────────────────────────────────────────────
// Afrofuturist Cosmos × SA Heritage × Dark Matter
// Unforgettable. Proof of intelligence, not just talk.
const C = {
  void:      '#04080F',
  midnight:  '#0A1628',
  deep:      '#0D1E35',
  navy:      '#0F2040',
  gold:      '#F4B942',
  amber:     '#E8A020',
  orange:    '#FF6B35',
  plasma:    '#FF4D00',
  white:     '#FFFFFF',
  mist:      'rgba(255,255,255,0.06)',
  fog:       'rgba(255,255,255,0.03)',
  // SA flag heritage
  saGreen:   '#007A4D',
  saGold:    '#FFB612',
  saRed:     '#DE3831',
  saBlue:    '#002395',
};

// ── CONSTELLATION BACKGROUND ──────────────────────────────────────────────────
function CosmosCanvas({ width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    let raf;

    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.4 + 0.2,
      pulse: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.015 + 0.003,
      gold: Math.random() > 0.85,
      twinkle: Math.random() * 0.5 + 0.5,
    }));

    // Constellation lines — inspired by Southern Cross / Orion
    const lines = [[0,7],[7,15],[15,22],[22,8],[8,3],[3,17],[17,31],[31,42],[42,55],[12,28],[28,44]];

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Constellation lines
      lines.forEach(([a, b]) => {
        if (!stars[a] || !stars[b]) return;
        ctx.beginPath();
        ctx.moveTo(stars[a].x * canvas.width, stars[a].y * canvas.height);
        ctx.lineTo(stars[b].x * canvas.width, stars[b].y * canvas.height);
        ctx.strokeStyle = 'rgba(244,185,66,0.06)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });

      // Stars
      stars.forEach((s, i) => {
        s.pulse += s.speed;
        const op = s.twinkle * (0.5 + 0.5 * Math.sin(s.pulse));
        const color = s.gold ? `rgba(244,185,66,${op})` : `rgba(255,255,255,${op * 0.7})`;
        const grd = ctx.createRadialGradient(
          s.x * canvas.width, s.y * canvas.height, 0,
          s.x * canvas.width, s.y * canvas.height, s.r * (s.gold ? 4 : 2.5)
        );
        grd.addColorStop(0, color);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r * (s.gold ? 2 : 1.5), 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', borderRadius: 'inherit',
    }} />
  );
}

// ── SIGNAL INDICATOR ──────────────────────────────────────────────────────────
function SignalDot() {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.8; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
      <span style={{
        position: 'absolute', width: 8, height: 8, borderRadius: '50%',
        background: '#22C55E', animation: 'ping 2s ease-out infinite',
      }} />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', display: 'block' }} />
    </span>
  );
}

// ── SA HERITAGE STRIP ─────────────────────────────────────────────────────────
function HeritageStrip({ style }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', ...style }}>
      {[C.saGreen, C.saGold, C.saRed, C.saBlue, C.white].map((c, i) => (
        <div key={i} style={{
          width: i === 2 ? 18 : 11, height: 2.5,
          background: c, borderRadius: 2, opacity: 0.7,
        }} />
      ))}
    </div>
  );
}

// ── TRIGGER SCORING ───────────────────────────────────────────────────────────
const SIGNALS = {
  STAGES:   { interested: 30, ready: 60, exploring: 10, objecting: 5, new: 0 },
  PAIN:     20, INDUSTRY: 15, STAFF: 10,
  BUDGET:   { high: 25, medium: 15, low: 5 },
  DEPTH:    5,  DEMO: 100, EXPLICIT: 80,
};
const THRESHOLD = 45;
const MIN_MSGS  = 3;

const TRIGGERS = [
  'get in touch','contact','speak to someone','call me','reach out',
  'book a demo','schedule','sign up','get started','how much',
  'pricing','cost','quote','proposal','sounds good',"let's do it",
  'ready to','can you help','interested',
];

function scoreConversation(ctx, userCount, lastMsg) {
  let score = 0;
  if (!ctx) return { score: 0, shouldShow: false };
  score += SIGNALS.STAGES[ctx.qualification_stage || 'new'] || 0;
  if (ctx.pain_point)    score += SIGNALS.PAIN;
  if (ctx.industry)      score += SIGNALS.INDUSTRY;
  if (ctx.staff_count)   score += SIGNALS.STAFF;
  if (ctx.budget_signal) score += SIGNALS.BUDGET[ctx.budget_signal] || 0;
  if (userCount > 4)     score += Math.floor((userCount - 4) / 3) * SIGNALS.DEPTH;
  if (ctx.demo_booked)   score += SIGNALS.DEMO;
  if (lastMsg && TRIGGERS.some(p => lastMsg.toLowerCase().includes(p))) score += SIGNALS.EXPLICIT;
  return { score, shouldShow: score >= THRESHOLD && userCount >= MIN_MSGS };
}

// ── QUICK REPLY CHIPS ─────────────────────────────────────────────────────────
const CHIPS = [
  { label: '📊 Calculate my ROI',    msg: 'Calculate my ROI' },
  { label: '🚀 Show me what you\'ve built', msg: 'Show me what you\'ve built' },
  { label: '📅 Book a free demo',    msg: 'Book a free demo' },
  { label: '💬 Automate my WhatsApp', msg: 'Automate my WhatsApp' },
];

// ── LEAD FORM COMPONENTS ──────────────────────────────────────────────────────
const INDUSTRIES = [
  { value: 'plumbing',      label: '🔧 Plumbing & Trade' },
  { value: 'electrical',   label: '⚡ Electrical & HVAC' },
  { value: 'construction', label: '🏗️ Construction' },
  { value: 'healthcare',   label: '🏥 Healthcare' },
  { value: 'property',     label: '🏘️ Property & Real Estate' },
  { value: 'retail',       label: '🛒 Retail & Wholesale' },
  { value: 'transport',    label: '🚛 Transport & Logistics' },
  { value: 'hospitality',  label: '🍽️ Hospitality & Food' },
  { value: 'professional', label: '💼 Professional Services' },
  { value: 'education',    label: '📚 Education & Training' },
  { value: 'technology',   label: '💻 Technology' },
  { value: 'other',        label: '◎ Other' },
];
const SERVICES = [
  { value: 'automate', label: '⚙️ Automate — Business Automation' },
  { value: 'learn',    label: '🎓 Learn — AI Training' },
  { value: 'grow',     label: '📈 Grow — AI Strategy' },
  { value: 'unsure',   label: '✦ Just exploring' },
];

function LeadField({ label, name, type='text', placeholder, value, onChange, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label style={{
        display: 'block', fontSize: '0.56rem', letterSpacing: '0.14em',
        textTransform: 'uppercase', fontFamily: "'Space Mono', monospace",
        color: focused ? C.gold : 'rgba(255,255,255,0.35)', marginBottom: '0.25rem',
        transition: 'color 0.2s',
      }}>
        {label}{required && <span style={{ color: C.orange }}> *</span>}
      </label>
      <input
        type={type} name={name} value={value} onChange={onChange}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={placeholder} required={required}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: focused ? 'rgba(244,185,66,0.05)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${focused ? 'rgba(244,185,66,0.45)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '5px', padding: '0.48rem 0.65rem',
          color: '#fff', fontSize: '0.8rem',
          fontFamily: "'DM Sans', sans-serif", outline: 'none',
          transition: 'all 0.2s',
        }}
      />
    </div>
  );
}

function LeadSelect({ label, name, value, onChange, options, required }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <label style={{
        display: 'block', fontSize: '0.56rem', letterSpacing: '0.14em',
        textTransform: 'uppercase', fontFamily: "'Space Mono', monospace",
        color: focused ? C.gold : 'rgba(255,255,255,0.35)', marginBottom: '0.25rem',
        transition: 'color 0.2s',
      }}>
        {label}{required && <span style={{ color: C.orange }}> *</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <select
          name={name} value={value} onChange={onChange} required={required}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', appearance: 'none', boxSizing: 'border-box',
            background: 'rgba(10,22,40,0.98)',
            border: `1px solid ${focused ? 'rgba(244,185,66,0.45)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: '5px', padding: '0.48rem 1.8rem 0.48rem 0.65rem',
            color: value ? '#fff' : 'rgba(255,255,255,0.25)',
            fontSize: '0.8rem', fontFamily: "'DM Sans', sans-serif",
            outline: 'none', cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          <option value="" disabled style={{ background: '#0A1628' }}>Select...</option>
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ background: '#0A1628', color: '#fff' }}>
              {o.label}
            </option>
          ))}
        </select>
        <span style={{
          position: 'absolute', right: '0.55rem', top: '50%',
          transform: 'translateY(-50%)', fontSize: '0.5rem',
          color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
        }}>▼</span>
      </div>
    </div>
  );
}

// ── INLINE LEAD CAPTURE FORM ──────────────────────────────────────────────────
function ChatLeadForm({ onSubmit, onDismiss, sessionContext = {}, submitting }) {
  const [submitted, setSubmitted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    company: '', industry: '', service_interest: '', message: '',
  });

  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);

  // Pre-fill from bot context
  useEffect(() => {
    setForm(f => ({
      ...f,
      name:    f.name    || sessionContext?.name     || '',
      email:   f.email   || sessionContext?.email    || '',
      phone:   f.phone   || sessionContext?.whatsapp || '',
      company: f.company || sessionContext?.business || '',
      industry:f.industry|| sessionContext?.industry || '',
      message: f.message || sessionContext?.pain_point || '',
    }));
  }, [sessionContext]);

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (!consent) return;
    const r = await onSubmit?.(form);
    if (r?.success !== false) setSubmitted(true);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        @keyframes cosmosSlide { from { opacity:0; transform:translateY(14px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes shimmerBar { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes spinOrbit { to { transform:rotate(360deg); } }
        @keyframes formPulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,185,66,0.3)} 50%{box-shadow:0 0 0 6px rgba(244,185,66,0)} }
        .ink-row { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; }
        @media(max-width:340px){.ink-row{grid-template-columns:1fr;}}
        .ink-field input::placeholder,.ink-field select option[disabled]{color:rgba(255,255,255,0.2)!important;}
      `}</style>

      {/* Appears as a bot message card */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
      }}>
        {/* Bot label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.6rem', color: C.midnight,
            animation: 'formPulse 2.5s ease infinite',
          }}>✦</div>
          <span style={{
            fontSize: '0.58rem', color: 'rgba(255,255,255,0.28)',
            fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em',
          }}>InkanyeziBot</span>
        </div>

        {/* CARD */}
        <div style={{
          width: '100%', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(145deg, rgba(10,22,40,0.96), rgba(4,8,15,0.98))',
          border: '1px solid rgba(244,185,66,0.18)',
          borderRadius: '14px', borderTopLeftRadius: '3px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(244,185,66,0.06)',
          animation: 'cosmosSlide 0.45s ease forwards',
        }} className="ink-field">
          {/* Mini cosmos bg */}
          <CosmosCanvas width={340} height={280} />

          {/* Shimmer top bar */}
          <div style={{
            height: '2px', position: 'relative', zIndex: 2,
            background: `linear-gradient(90deg, transparent, ${C.gold}, ${C.orange}, ${C.gold}, transparent)`,
            backgroundSize: '200% 100%', animation: 'shimmerBar 3s linear infinite',
          }} />

          {/* Dismiss */}
          {onDismiss && !submitted && (
            <button onClick={onDismiss} style={{
              position: 'absolute', top: '0.55rem', right: '0.55rem', zIndex: 10,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px', padding: '2px 6px', color: 'rgba(255,255,255,0.3)',
              fontSize: '0.6rem', cursor: 'pointer', fontFamily: "'Space Mono', monospace",
            }}>✕</button>
          )}

          <div style={{ padding: '0.9rem 1rem 1rem', position: 'relative', zIndex: 1 }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '0.75rem 0 0.25rem' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', margin: '0 auto 0.65rem',
                  background: 'rgba(244,185,66,0.1)', border: '1px solid rgba(244,185,66,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
                }}>✦</div>
                <p style={{
                  fontFamily: "'Syne', sans-serif", fontSize: '1rem',
                  fontWeight: 800, color: '#fff', margin: '0 0 0.35rem', lineHeight: 1.2,
                }}>
                  Signal received,{' '}
                  <span style={{
                    background: `linear-gradient(90deg, ${C.gold}, ${C.orange})`,
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>{form.name?.split(' ')[0] || 'friend'}</span>
                </p>
                <p style={{
                  fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)',
                  margin: '0 0 0.75rem', lineHeight: 1.55,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {form.company
                    ? `Sanele will reach out to ${form.company} within 24 hours.`
                    : 'Sanele will be in touch within 24 hours.'}
                </p>
                <HeritageStrip style={{ justifyContent: 'center' }} />
              </div>
            ) : (
              <>
                <div style={{ marginBottom: '0.8rem' }}>
                  <div style={{
                    fontSize: '0.52rem', letterSpacing: '0.22em',
                    textTransform: 'uppercase', color: C.gold,
                    fontFamily: "'Space Mono', monospace", marginBottom: '0.22rem',
                  }}>✦ Inkanyezi Technologies</div>
                  <h3 style={{
                    margin: 0, fontFamily: "'Syne', sans-serif",
                    fontSize: '0.95rem', fontWeight: 800, color: '#fff', lineHeight: 1.2,
                  }}>
                    Let's make this{' '}
                    <span style={{
                      background: `linear-gradient(90deg, ${C.gold}, ${C.orange})`,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>official</span>
                  </h3>
                  <p style={{
                    margin: '0.22rem 0 0', fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.35)', lineHeight: 1.5,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    Sanele will personally follow up within 24 hours.
                  </p>
                  <HeritageStrip style={{ marginTop: '0.5rem' }} />
                </div>

                <form onSubmit={submit}>
                  <div className="ink-row" style={{ marginBottom: '0.48rem' }}>
                    <LeadField label="Your Name" name="name" placeholder="e.g. Sipho" value={form.name} onChange={handle} required />
                    <LeadField label="Business" name="company" placeholder="Company name" value={form.company} onChange={handle} />
                  </div>
                  <div className="ink-row" style={{ marginBottom: '0.48rem' }}>
                    <LeadField label="Email" name="email" type="email" placeholder="you@business.co.za" value={form.email} onChange={handle} required />
                    <LeadField label="WhatsApp" name="phone" type="tel" placeholder="+27 82..." value={form.phone} onChange={handle} />
                  </div>
                  <div className="ink-row" style={{ marginBottom: '0.48rem' }}>
                    <LeadSelect label="Industry" name="industry" value={form.industry} onChange={handle} options={INDUSTRIES} required />
                    <LeadSelect label="How we help" name="service_interest" value={form.service_interest} onChange={handle} options={SERVICES} required />
                  </div>

                  {/* Consent */}
                  <label style={{
                    display: 'flex', gap: '0.5rem', cursor: 'pointer',
                    alignItems: 'flex-start', marginBottom: '0.65rem',
                  }}>
                    <div onClick={() => setConsent(c => !c)} style={{
                      width: 14, height: 14, flexShrink: 0, marginTop: 2,
                      border: `1px solid ${consent ? C.gold : 'rgba(255,255,255,0.2)'}`,
                      borderRadius: '3px',
                      background: consent ? 'rgba(244,185,66,0.12)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', cursor: 'pointer',
                    }}>
                      {consent && <span style={{ color: C.gold, fontSize: '9px', lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{
                      fontSize: '0.63rem', color: 'rgba(255,255,255,0.32)',
                      lineHeight: 1.5, fontFamily: "'DM Sans', sans-serif",
                    }}>
                      I consent to Inkanyezi Technologies contacting me per{' '}
                      <span style={{ color: C.gold }}>POPIA</span>.{' '}
                      <span style={{ color: C.orange }}>*</span>
                    </span>
                  </label>

                  <button type="submit" disabled={submitting || !consent} style={{
                    width: '100%', padding: '0.6rem',
                    background: submitting || !consent
                      ? 'rgba(244,185,66,0.1)'
                      : `linear-gradient(90deg, ${C.gold}, ${C.orange})`,
                    border: 'none', borderRadius: '6px',
                    color: submitting || !consent ? 'rgba(255,255,255,0.2)' : C.midnight,
                    fontFamily: "'Space Mono', monospace", fontSize: '0.65rem',
                    fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    cursor: submitting || !consent ? 'not-allowed' : 'pointer',
                    transition: 'all 0.25s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  }}>
                    {submitting
                      ? <>
                          <span style={{
                            width: 10, height: 10, borderRadius: '50%',
                            border: '2px solid rgba(255,255,255,0.2)',
                            borderTop: '2px solid rgba(255,255,255,0.7)',
                            display: 'inline-block', animation: 'spinOrbit 0.7s linear infinite',
                          }} />
                          Transmitting...
                        </>
                      : '✦ Send My Details'
                    }
                  </button>

                  <p style={{
                    textAlign: 'center', fontSize: '0.56rem',
                    color: 'rgba(255,255,255,0.18)', margin: '0.5rem 0 0',
                    fontFamily: "'Space Mono', monospace",
                  }}>
                    Durban, KZN 🇿🇦 · We are the signal in the noise.
                  </p>
                </form>
              </>
            )}
          </div>

          <div style={{
            height: '1px', position: 'relative', zIndex: 1,
            background: 'linear-gradient(90deg, transparent, rgba(244,185,66,0.12), transparent)',
          }} />
        </div>
      </div>
    </>
  );
}

// ── FORMAT MESSAGE ────────────────────────────────────────────────────────────
function formatMessage(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN CHATBOT PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const [isOpen, setIsOpen]     = useState(false);
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "Sawubona! 👋 I'm InkanyeziBot — your AI guide to automation for South African businesses.\n\nBy chatting, you agree to our POPIA-compliant data policy.\n\nWhat does your business do, and what's the biggest challenge slowing you down right now?",
  }]);
  const [input, setInput]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [sessionContext, setSessionContext] = useState(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2,9)}`);
  const [showLeadForm, setShowLeadForm]         = useState(false);
  const [leadFormSubmitted, setLeadFormSubmitted] = useState(false);
  const [leadSubmitting, setLeadSubmitting]       = useState(false);
  const [showChips, setShowChips]               = useState(true);
  const [showGreeting, setShowGreeting]   = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const hasTriggered  = useRef(false);
  const messagesEnd   = useRef(null);
  const textareaRef   = useRef(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showLeadForm, isLoading]);

  // ── Proactive greeting — appears after 8s idle if chat not opened ──────────
  useEffect(() => {
    const showTimer = setTimeout(() => {
      if (!isOpen) {
        setShowGreeting(true);
        setTimeout(() => setGreetingVisible(true), 50);
      }
    }, 8000);

    const hideTimer = setTimeout(() => {
      setGreetingVisible(false);
      setTimeout(() => setShowGreeting(false), 400);
    }, 20000);

    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, []);

  // Hide greeting when chat opens
  useEffect(() => {
    if (isOpen) {
      setGreetingVisible(false);
      setTimeout(() => setShowGreeting(false), 400);
    }
  }, [isOpen]);

  // Trigger evaluation
  useEffect(() => {
    if (hasTriggered.current || leadFormSubmitted || !sessionContext) return;
    const userMsgs  = messages.filter(m => m.role === 'user');
    const lastMsg   = userMsgs[userMsgs.length - 1]?.content || '';
    const { shouldShow } = scoreConversation(sessionContext, userMsgs.length, lastMsg);
    if (shouldShow) {
      hasTriggered.current = true;
      setTimeout(() => setShowLeadForm(true), 1200);
    }
  }, [messages, sessionContext, leadFormSubmitted]);

  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || isLoading) return;
    setShowChips(false);
    const userMessage  = { role: 'user', content };
    const newMessages  = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);
    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, sessionId }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.message }]);
      if (data.context) setSessionContext(data.context);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Something went wrong — please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeadSubmit = useCallback(async (formData) => {
    setLeadSubmitting(true);
    try {
      const userMsgs = messages.filter(m => m.role === 'user');
      const lastMsg  = userMsgs[userMsgs.length - 1]?.content || '';
      const { score } = scoreConversation(sessionContext, userMsgs.length, lastMsg);

      const payload = {
        name:             formData.name    || sessionContext?.name     || '',
        email:            formData.email   || sessionContext?.email    || '',
        phone:            formData.phone   || sessionContext?.whatsapp || '',
        company:          formData.company || sessionContext?.business || '',
        industry:         formData.industry|| sessionContext?.industry || '',
        service_interest: formData.service_interest || '',
        message:          formData.message || sessionContext?.pain_point || '',
        has_email:        (formData.email || sessionContext?.email)    ? 'true' : 'false',
        has_whatsapp:     (formData.phone || sessionContext?.whatsapp) ? 'true' : 'false',
        source:           'chatbot-lead-form',
        session_id:       sessionId,
        message_count:    userMsgs.length,
        conversation_summary: messages.slice(-6).map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`).join('\n'),
        qualification_stage: sessionContext?.qualification_stage || 'new',
        pain_point:          sessionContext?.pain_point           || '',
        budget_signal:       sessionContext?.budget_signal        || '',
        demo_booked:         sessionContext?.demo_booked          || false,
        reference_number:    sessionContext?.referenceNumber      || '',
        trigger_score:       score,
        timestamp:           new Date().toISOString(),
        sast_time:           new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
      };

      const url = process.env.NEXT_PUBLIC_MAKE_WEBHOOK_URL;
      if (url) await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      setLeadFormSubmitted(true);
      setShowLeadForm(false);

      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✦ Signal locked in${formData.name ? `, ${formData.name.split(' ')[0]}` : ''}! Sanele will personally reach out within 24 hours.\n\nIs there anything else you'd like to know about how we can transform ${formData.company || 'your business'}?`,
        }]);
      }, 700);

      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false };
    } finally {
      setLeadSubmitting(false);
    }
  }, [messages, sessionContext, sessionId]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&family=Cinzel:wght@600&display=swap');

        * { box-sizing: border-box; }

        @keyframes floatBubble {
          0%,100% { transform: translateY(0) scale(1); box-shadow: 0 0 30px rgba(249,115,22,0.55), 0 0 60px rgba(249,115,22,0.2); }
          50%      { transform: translateY(-6px) scale(1.03); box-shadow: 0 0 40px rgba(249,115,22,0.7), 0 0 80px rgba(249,115,22,0.3); }
        }
        @keyframes orbitRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes windowSlide {
          from { opacity:0; transform:translateY(20px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes headerShimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes msgFadeUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes thinkPulse {
          0%,80%,100% { opacity:0.15; transform:scale(0.8); }
          40%          { opacity:1;    transform:scale(1); }
        }
        @keyframes chipAppear {
          from { opacity:0; transform:translateX(-6px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes rocketGlow {
          0%,100% { box-shadow: 0 0 14px rgba(249,115,22,0.5); }
          50%      { box-shadow: 0 0 22px rgba(249,115,22,0.8), 0 0 40px rgba(249,115,22,0.3); }
        }

        .msg-bubble { animation: msgFadeUp 0.3s ease forwards; }
        .chip-btn {
          animation: chipAppear 0.3s ease forwards;
          transition: all 0.2s !important;
        }
        .chip-btn:hover {
          background: rgba(244,185,66,0.15) !important;
          border-color: rgba(244,185,66,0.5) !important;
          color: #fff !important;
          transform: translateX(2px);
        }
        .send-btn { animation: rocketGlow 2s ease infinite; }
        .send-btn:hover:not(:disabled) {
          transform: scale(1.08) rotate(-5deg) !important;
          box-shadow: 0 0 30px rgba(249,115,22,0.9) !important;
        }
        @keyframes greetingPop {
          from { opacity:0; transform:translateY(10px) scale(0.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes greetingDot {
          0%,60%,100% { transform:translateY(0); }
          30%          { transform:translateY(-4px); }
        }
        .msg-area::-webkit-scrollbar { width: 3px; }
        .msg-area::-webkit-scrollbar-track { background: transparent; }
        .msg-area::-webkit-scrollbar-thumb { background: rgba(244,185,66,0.25); border-radius: 2px; }
        textarea::placeholder { color: rgba(255,255,255,0.28) !important; }
        textarea::-webkit-scrollbar { width: 2px; }
        textarea::-webkit-scrollbar-thumb { background: rgba(244,185,66,0.3); }
      `}</style>

      <main style={{ minHeight: '100vh', background: 'transparent' }}>

        {/* ── PROACTIVE GREETING BUBBLE ── */}
        {showGreeting && !isOpen && (
          <div
            onClick={() => setIsOpen(true)}
            style={{
              position: 'fixed', bottom: 100, right: 24, zIndex: 999,
              maxWidth: 260, cursor: 'pointer',
              opacity: greetingVisible ? 1 : 0,
              transform: greetingVisible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
              transition: 'opacity 0.35s ease, transform 0.35s ease',
            }}
          >
            {/* Card */}
            <div style={{
              background: 'linear-gradient(145deg, rgba(15,27,53,0.98), rgba(10,22,40,0.98))',
              border: '1px solid rgba(249,115,22,0.25)',
              borderRadius: 16, borderBottomRightRadius: 4,
              padding: '12px 14px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(244,185,66,0.06)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Shimmer top */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
                background: 'linear-gradient(90deg, transparent, rgba(244,185,66,0.6), transparent)',
              }} />

              {/* Bot row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #FF6B35, #c2410c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, boxShadow: '0 0 10px rgba(249,115,22,0.5)',
                }}>⭐</div>
                <div>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 700, color: '#fff',
                    fontFamily: "'Syne', sans-serif",
                  }}>InkanyeziBot</div>
                  <div style={{
                    fontSize: '0.55rem', color: '#f97316',
                    fontFamily: "'Space Mono', monospace",
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#22c55e', display: 'inline-block',
                    }} />
                    Online now
                  </div>
                </div>
              </div>

              {/* Message */}
              <p style={{
                margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)',
                lineHeight: 1.55, fontFamily: "'DM Sans', sans-serif",
              }}>
                Sawubona! 👋 Automating a South African business?{' '}
                <span style={{ color: '#F4B942', fontWeight: 600 }}>
                  I can show you how in 3 minutes.
                </span>
              </p>

              {/* CTA hint */}
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center',
                gap: 4, fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)',
                fontFamily: "'Space Mono', monospace",
              }}>
                <span>Tap to chat</span>
                <span style={{ color: '#F4B942' }}>→</span>
              </div>
            </div>

            {/* Pointer triangle */}
            <div style={{
              position: 'absolute', bottom: -7, right: 18,
              width: 0, height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '8px solid rgba(15,27,53,0.98)',
            }} />
          </div>
        )}

        {/* ── FLOATING CHAT BUBBLE ── */}
        <button
          onClick={() => setIsOpen(o => !o)}
          aria-label={isOpen ? 'Close chat' : 'Open InkanyeziBot'}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            width: 64, height: 64, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.orange}, #c2410c)`,
            border: `2px solid rgba(249,115,22,0.45)`,
            cursor: 'pointer', fontSize: 26,
            animation: 'floatBubble 3s ease-in-out infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.2s',
          }}
        >
          {/* Orbiting dot */}
          {!isOpen && (
            <div style={{
              position: 'absolute', width: 64, height: 64,
              animation: 'orbitRing 4s linear infinite',
              pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute', top: -3, left: '50%',
                width: 7, height: 7, borderRadius: '50%',
                background: C.gold, transform: 'translateX(-50%)',
                boxShadow: `0 0 10px ${C.gold}`,
              }} />
            </div>
          )}
          <span style={{ position: 'relative', zIndex: 1, transition: 'transform 0.3s', transform: isOpen ? 'rotate(45deg)' : 'none' }}>
            {isOpen ? '✕' : '⭐'}
          </span>
        </button>

        {/* ── CHAT WINDOW ── */}
        {isOpen && (
          <div style={{
            position: 'fixed', bottom: 100, right: 24,
            width: 370, height: 580,
            display: 'flex', flexDirection: 'column',
            zIndex: 999, overflow: 'hidden',
            borderRadius: 20,
            background: `linear-gradient(160deg, ${C.midnight} 0%, ${C.void} 100%)`,
            border: '1px solid rgba(249,115,22,0.2)',
            boxShadow: '0 0 0 1px rgba(244,185,66,0.05), 0 0 50px rgba(249,115,22,0.12), 0 25px 70px rgba(0,0,0,0.7)',
            animation: 'windowSlide 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
          }}>
            {/* Cosmos background inside window */}
            <CosmosCanvas width={370} height={580} />

            {/* ── HEADER ── */}
            <div style={{
              position: 'relative', zIndex: 2,
              background: 'linear-gradient(135deg, rgba(15,27,53,0.98), rgba(26,42,80,0.98))',
              borderBottom: '1px solid rgba(249,115,22,0.18)',
              padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              flexShrink: 0,
            }}>
              {/* Gold shimmer line at very top */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${C.gold}, ${C.orange}, ${C.gold}, transparent)`,
                backgroundSize: '200% 100%', animation: 'headerShimmer 3s linear infinite',
              }} />

              {/* Avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.orange}, #c2410c)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, boxShadow: `0 0 16px rgba(249,115,22,0.6)`,
                }}>⭐</div>
                {/* Orbiting gold dot on avatar */}
                <div style={{
                  position: 'absolute', inset: -4,
                  animation: 'orbitRing 5s linear infinite', pointerEvents: 'none',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: '50%',
                    width: 5, height: 5, borderRadius: '50%',
                    background: C.gold, transform: 'translateX(-50%)',
                    boxShadow: `0 0 6px ${C.gold}`,
                  }} />
                </div>
              </div>

              {/* Title */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Syne', sans-serif", fontWeight: 800,
                  fontSize: 15, color: C.white, letterSpacing: '-0.01em',
                }}>
                  InkanyeziBot <span style={{
                    fontSize: 11, color: C.gold, fontFamily: "'Space Mono', monospace",
                    fontWeight: 400, letterSpacing: '0.05em',
                  }}>✦</span>
                </div>
                <div style={{
                  fontSize: 11, color: C.orange,
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <SignalDot />
                  <span>Online · AI Automation · Durban, ZA</span>
                </div>
              </div>

              {/* SA flag + label */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Space Mono', monospace" }}>
                  🇿🇦 SA AI
                </div>
                <HeritageStrip style={{ justifyContent: 'flex-end', marginTop: 3 }} />
              </div>
            </div>

            {/* ── MESSAGES AREA ── */}
            <div
              className="msg-area"
              style={{
                flex: 1, overflowY: 'auto', padding: '14px 14px 6px',
                display: 'flex', flexDirection: 'column', gap: 10,
                position: 'relative', zIndex: 2,
              }}
            >
              {messages.map((msg, i) => (
                <div key={i} className="msg-bubble" style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-end', gap: 6,
                  animationDelay: `${i * 0.03}s`,
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, ${C.orange}, #c2410c)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, boxShadow: '0 0 8px rgba(249,115,22,0.4)',
                    }}>⭐</div>
                  )}
                  <div
                    style={{
                      maxWidth: '78%', padding: '10px 13px',
                      borderRadius: 14, fontSize: 13, lineHeight: 1.6,
                      wordBreak: 'break-word',
                      background: msg.role === 'user'
                        ? `linear-gradient(135deg, ${C.orange}, #c2410c)`
                        : 'rgba(255,255,255,0.055)',
                      color: C.white,
                      border: msg.role === 'user' ? 'none' : '1px solid rgba(249,115,22,0.13)',
                      boxShadow: msg.role === 'user' ? '0 0 14px rgba(249,115,22,0.3)' : 'none',
                      borderBottomLeftRadius:  msg.role === 'assistant' ? 3 : 14,
                      borderBottomRightRadius: msg.role === 'user'      ? 3 : 14,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                  />
                </div>
              ))}

              {/* Quick reply chips — shown only after first bot message */}
              {showChips && messages.length === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  <div style={{
                    fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)',
                    fontFamily: "'Space Mono', monospace", letterSpacing: '0.1em',
                    textAlign: 'center', marginBottom: 2,
                  }}>Quick questions:</div>
                  {CHIPS.map((chip, i) => (
                    <button
                      key={i}
                      className="chip-btn"
                      onClick={() => sendMessage(chip.msg)}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(249,115,22,0.2)',
                        borderRadius: 8, padding: '8px 12px',
                        color: 'rgba(255,255,255,0.7)', fontSize: 12,
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: "'DM Sans', sans-serif",
                        animationDelay: `${i * 0.08}s`, opacity: 0,
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Inline lead form */}
              {showLeadForm && !leadFormSubmitted && (
                <ChatLeadForm
                  onSubmit={handleLeadSubmit}
                  onDismiss={() => setShowLeadForm(false)}
                  sessionContext={sessionContext}
                  submitting={leadSubmitting}
                />
              )}

              {/* Thinking indicator */}
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${C.orange}, #c2410c)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, flexShrink: 0,
                  }}>⭐</div>
                  <div style={{
                    background: 'rgba(255,255,255,0.055)', padding: '12px 16px',
                    borderRadius: 14, borderBottomLeftRadius: 3,
                    border: '1px solid rgba(249,115,22,0.13)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: C.orange, opacity: 0.15,
                        animation: `thinkPulse 1.2s ease-in-out infinite`,
                        animationDelay: `${i * 0.2}s`,
                      }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEnd} />
            </div>

            {/* ── INPUT AREA ── */}
            <div style={{
              position: 'relative', zIndex: 2,
              padding: '10px 12px 12px',
              borderTop: '1px solid rgba(249,115,22,0.12)',
              background: 'rgba(15,27,53,0.95)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder="Send a message into the cosmos..."
                  rows={1}
                  style={{
                    flex: 1, padding: '9px 13px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(249,115,22,0.18)',
                    color: C.white, outline: 'none', fontSize: 13,
                    resize: 'none', lineHeight: 1.5, wordBreak: 'break-word',
                    overflowY: 'auto', maxHeight: 96,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(249,115,22,0.4)'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(249,115,22,0.18)'}
                />
                {/* ROCKET SEND BUTTON */}
                <button
                  className="send-btn"
                  onClick={() => sendMessage()}
                  disabled={isLoading || !input.trim()}
                  style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    background: isLoading || !input.trim()
                      ? 'rgba(249,115,22,0.3)'
                      : `linear-gradient(135deg, ${C.orange}, #c2410c)`,
                    border: 'none',
                    cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                    color: C.white, fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                    opacity: isLoading || !input.trim() ? 0.5 : 1,
                  }}
                  title="Launch message 🚀"
                >
                  🚀
                </button>
              </div>

              {/* Footer hint */}
              <div style={{
                marginTop: 6, textAlign: 'center',
                fontSize: 10, color: 'rgba(255,255,255,0.2)',
                fontFamily: "'Space Mono', monospace", letterSpacing: '0.05em',
              }}>
                ✦ INKANYEZI TECHNOLOGIES · WE ARE THE SIGNAL IN THE NOISE ✦
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
