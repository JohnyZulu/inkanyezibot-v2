'use client';

// app/dashboard/AgentChat.tsx
//
// The Inkanyezi Agent — a floating chat panel that lets you command the
// internal operations agent (read_crm, score_lead, generate_report,
// check_hygiene, update_crm) from inside the CRM dashboard. Works on desktop
// and mobile (the dashboard is responsive, so this is your "agent in your
// pocket").
//
// Self-contained: takes the dashboard's theme object `C` and `dark` flag as
// props so it matches light/dark automatically. Talks to POST /api/agent.
// Design language: Inkanyezi "signal in the noise" — gold/orange on deep navy,
// a star/spark motif, constellation accents. African-futurist, not generic.

import { useState, useRef, useEffect } from 'react';

type Theme = {
  bg: string; card: string; border: string; borderHover: string;
  gold: string; orange: string; text: string; muted: string; dimmed: string;
  inputBg: string; modalBg: string; trackBg: string;
};

type Msg = { role: 'user' | 'agent'; text: string; ts: number };

// A few starter prompts so it's never a blank box — these teach the user what
// the agent can do, in Inkanyezi's voice.
const SUGGESTIONS = [
  'Give me a report on our pipeline',
  'Which leads are HOT and why?',
  'Run a data quality check',
  'Score our new leads',
];

export default function AgentChat({ C, dark }: { C: Theme; dark: boolean }) {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [input, setInput]     = useState('');
  const [busy, setBusy]       = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  async function send(text: string) {
    const task = text.trim();
    if (!task || busy) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text: task, ts: Date.now() }]);
    setBusy(true);
    try {
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      const d = await r.json();
      const reply = r.ok && d.result
        ? String(d.result)
        : (d.error ? `⚠ ${d.error}` : '⚠ The agent could not complete that request.');
      setMsgs(m => [...m, { role: 'agent', text: reply, ts: Date.now() }]);
    } catch {
      setMsgs(m => [...m, { role: 'agent', text: '⚠ Could not reach the agent. Check your connection and try again.', ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  }

  // ── Launcher button (collapsed state) ──────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Inkanyezi Agent"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 900,
          width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`,
          boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${C.borderHover}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {/* four-point star / spark — the Inkanyezi mark */}
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M12 1.5 L14 9.5 L22 12 L14 14.5 L12 22.5 L10 14.5 L2 12 L10 9.5 Z"
            fill="#0A1628" opacity="0.92" />
        </svg>
      </button>
    );
  }

  // ── Open panel ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 900,
        width: 'min(400px, calc(100vw - 32px))',
        height: 'min(560px, calc(100vh - 48px))',
        display: 'flex', flexDirection: 'column',
        background: C.modalBg,
        border: `1px solid ${C.borderHover}`,
        borderRadius: 18,
        boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* Header — gold/orange gradient with the star mark + constellation line */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
        background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`,
        position: 'relative', overflow: 'hidden',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 1.5 L14 9.5 L22 12 L14 14.5 L12 22.5 L10 14.5 L2 12 L10 9.5 Z" fill="#0A1628" opacity="0.9" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0A1628', letterSpacing: 0.2 }}>Inkanyezi Agent</div>
          <div style={{ fontSize: 10.5, color: 'rgba(10,22,40,0.7)', letterSpacing: 1, textTransform: 'uppercase' }}>The signal in the noise</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          style={{ background: 'rgba(10,22,40,0.15)', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', color: '#0A1628', fontSize: 16, lineHeight: 1 }}
        >×</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: C.bg }}>
        {msgs.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', padding: '10px 6px' }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Ask the agent about your pipeline, leads, or data.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    textAlign: 'left', padding: '9px 12px', borderRadius: 10,
                    background: C.inputBg, border: `1px solid ${C.border}`,
                    color: C.text, fontSize: 12.5, cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderHover)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  <span style={{ color: C.gold, marginRight: 6 }}>✦</span>{s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '10px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              ...(m.role === 'user'
                ? { background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#0A1628', borderBottomRightRadius: 4, fontWeight: 500 }
                : { background: C.card, color: C.text, border: `1px solid ${C.border}`, borderBottomLeftRadius: 4 }),
            }}>
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 13px', borderRadius: 14, background: C.card, border: `1px solid ${C.border}`, color: C.muted, fontSize: 13 }}>
              <span className="ink-pulse">✦</span> thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: C.modalBg, display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(input); }}
          placeholder="Ask the agent…"
          disabled={busy}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 13,
            background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, outline: 'none',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          aria-label="Send"
          style={{
            width: 42, borderRadius: 10, border: 'none',
            background: busy || !input.trim() ? C.trackBg : `linear-gradient(135deg, ${C.gold}, ${C.orange})`,
            color: '#0A1628', cursor: busy || !input.trim() ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12 L20 4 L13 12 L20 20 Z" fill="#0A1628" /></svg>
        </button>
      </div>

      <style>{`.ink-pulse{display:inline-block;animation:inkpulse 1.2s ease-in-out infinite}@keyframes inkpulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}
