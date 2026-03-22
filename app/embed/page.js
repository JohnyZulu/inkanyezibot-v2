'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export default function EmbedPage() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Sawubona! 👋 I'm InkanyeziBot — your AI guide to automation for South African businesses.\n\nBy chatting, you agree to our POPIA-compliant data policy.\n\nWhat does your business do, and what's the biggest challenge slowing you down right now?",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const canvasRef = useRef(null);

  // Star field canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.2 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.01 + 0.003,
    }));

    const draw = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach((s) => {
        const a = ((Math.sin(t * s.speed + s.phase) + 1) / 2) * 0.6 + 0.1;
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244,185,66,${a.toFixed(2)})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
  }, [input]);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = (text || input).trim();
      if (!trimmed || loading) return;
      setInput('');
      const userMsg = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMsg],
            sessionId,
          }),
        });
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.message || data.reply || 'Sorry, something went wrong.' },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Connection error. Please try again.' },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, sessionId]
  );

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const chips = [
    '📊 Calculate my ROI',
    '🚀 Show me what you\'ve built',
    '📅 Book a free demo',
    '💬 Automate my WhatsApp',
  ];

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

        .embed-root {
          width: 100%;
          height: 100vh;
          height: 100dvh;
          background: #04080F;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .stars-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 0;
        }

        .chat-shell {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: linear-gradient(160deg, #0A1628 0%, #04080F 100%);
          overflow: hidden;
        }

        /* ── HEADER ── */
        .chat-header {
          position: relative;
          z-index: 2;
          background: linear-gradient(135deg, rgba(15,27,53,0.98), rgba(26,42,80,0.98));
          border-bottom: 1px solid rgba(249,115,22,0.18);
          padding: 10px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .header-shimmer {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #F4B942, #FF6B35, #F4B942, transparent);
          background-size: 200% 100%;
          animation: headerShimmer 3s linear infinite;
        }

        .header-avatar {
          position: relative;
          flex-shrink: 0;
        }
        .avatar-circle {
          width: 40px; height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF6B35, #c2410c);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
          box-shadow: 0 0 16px rgba(249,115,22,0.6);
        }
        .orbit-ring {
          position: absolute; inset: -4px;
          animation: orbitRing 5s linear infinite;
          pointer-events: none;
        }
        .orbit-dot {
          position: absolute; top: 0; left: 50%;
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #F4B942;
          transform: translateX(-50%);
          box-shadow: 0 0 6px #F4B942;
        }

        .header-info { flex: 1; min-width: 0; }
        .header-name {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 14px;
          color: #FFFFFF;
          letter-spacing: -0.01em;
        }
        .header-status {
          font-size: 10px;
          color: #FF6B35;
          display: flex;
          align-items: center;
          gap: 5px;
          font-family: 'DM Sans', sans-serif;
          margin-top: 1px;
        }
        .ping-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .ping-anim {
          position: absolute;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #22C55E;
          animation: ping 2s ease-out infinite;
        }
        .ping-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #22C55E;
          display: block;
        }

        .header-flag { text-align: right; flex-shrink: 0; }
        .flag-label {
          font-size: 10px;
          color: rgba(255,255,255,0.3);
          font-family: 'Space Mono', monospace;
        }
        .flag-bars {
          display: flex; gap: 2px;
          align-items: center;
          justify-content: flex-end;
          margin-top: 3px;
        }

        /* ── MESSAGES ── */
        .msg-area {
          flex: 1;
          overflow-y: auto;
          padding: 12px 12px 6px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: relative;
          z-index: 2;
          min-height: 0;
        }
        .msg-area::-webkit-scrollbar { width: 3px; }
        .msg-area::-webkit-scrollbar-track { background: transparent; }
        .msg-area::-webkit-scrollbar-thumb { background: rgba(244,185,66,0.25); border-radius: 2px; }

        .msg-bubble {
          animation: msgFadeUp 0.3s ease forwards;
        }
        .msg-row {
          display: flex;
          align-items: flex-end;
          gap: 6px;
        }
        .msg-row.user { justify-content: flex-end; }
        .msg-row.assistant { justify-content: flex-start; }

        .msg-avatar {
          width: 22px; height: 22px;
          border-radius: 50%;
          flex-shrink: 0;
          background: linear-gradient(135deg, #FF6B35, #c2410c);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px;
          box-shadow: 0 0 8px rgba(249,115,22,0.4);
        }

        .msg-text {
          max-width: 78%;
          padding: 9px 12px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.6;
          word-break: break-word;
          font-family: 'DM Sans', sans-serif;
          white-space: pre-wrap;
        }
        .msg-text.assistant {
          background: rgba(255,255,255,0.055);
          color: #FFFFFF;
          border: 1px solid rgba(249,115,22,0.13);
          border-bottom-left-radius: 3px;
        }
        .msg-text.user {
          background: linear-gradient(135deg, rgba(255,107,53,0.25), rgba(244,185,66,0.15));
          color: #FFFFFF;
          border: 1px solid rgba(244,185,66,0.2);
          border-bottom-right-radius: 3px;
        }

        /* Chips */
        .chips-wrap {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-top: 4px;
        }
        .chips-label {
          font-size: 9px;
          color: rgba(255,255,255,0.28);
          font-family: 'Space Mono', monospace;
          letter-spacing: 0.1em;
          text-align: center;
          margin-bottom: 2px;
        }
        .chip-btn {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(249,115,22,0.2);
          border-radius: 8px;
          padding: 7px 11px;
          color: rgba(255,255,255,0.7);
          font-size: 12px;
          cursor: pointer;
          text-align: left;
          font-family: 'DM Sans', sans-serif;
          animation: chipAppear 0.3s ease forwards;
          transition: all 0.2s;
        }
        .chip-btn:hover {
          background: rgba(244,185,66,0.12);
          border-color: rgba(244,185,66,0.45);
          color: #fff;
          transform: translateX(2px);
        }

        /* Thinking dots */
        .thinking {
          display: flex;
          gap: 4px;
          padding: 10px 14px;
          background: rgba(255,255,255,0.04);
          border-radius: 14px;
          border-bottom-left-radius: 3px;
          width: fit-content;
        }
        .think-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: rgba(244,185,66,0.7);
          animation: thinkPulse 1.4s ease-in-out infinite;
        }
        .think-dot:nth-child(2) { animation-delay: 0.2s; }
        .think-dot:nth-child(3) { animation-delay: 0.4s; }

        /* ── INPUT BAR ── */
        .input-bar {
          position: relative;
          z-index: 2;
          padding: 8px 10px 10px;
          border-top: 1px solid rgba(249,115,22,0.12);
          background: rgba(15,27,53,0.97);
          flex-shrink: 0;
        }
        .input-row {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }
        .msg-input {
          flex: 1;
          padding: 8px 12px;
          border-radius: 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(249,115,22,0.18);
          color: #FFFFFF;
          outline: none;
          font-size: 13px;
          resize: none;
          line-height: 1.5;
          word-break: break-word;
          overflow-y: auto;
          max-height: 96px;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s;
        }
        .msg-input::placeholder { color: rgba(255,255,255,0.28); }
        .msg-input:focus { border-color: rgba(244,185,66,0.4); }
        .msg-input::-webkit-scrollbar { width: 2px; }
        .msg-input::-webkit-scrollbar-thumb { background: rgba(244,185,66,0.3); }

        .send-btn {
          width: 40px; height: 40px;
          border-radius: 50%;
          flex-shrink: 0;
          border: none;
          color: #FFFFFF;
          font-size: 17px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .send-btn.active {
          background: linear-gradient(135deg, #FF6B35, #F4B942);
          cursor: pointer;
          animation: rocketGlow 2s ease infinite;
        }
        .send-btn.active:hover {
          transform: scale(1.08) rotate(-5deg);
          box-shadow: 0 0 30px rgba(249,115,22,0.9);
        }
        .send-btn.inactive {
          background: rgba(249,115,22,0.2);
          cursor: not-allowed;
          opacity: 0.4;
        }

        .input-footer {
          margin-top: 5px;
          text-align: center;
          font-size: 9px;
          color: rgba(255,255,255,0.18);
          font-family: 'Space Mono', monospace;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="embed-root">
        <canvas className="stars-canvas" ref={canvasRef} />

        <div className="chat-shell">
          {/* HEADER */}
          <div className="chat-header">
            <div className="header-shimmer" />
            <div className="header-avatar">
              <div className="avatar-circle">⭐</div>
              <div className="orbit-ring">
                <div className="orbit-dot" />
              </div>
            </div>
            <div className="header-info">
              <div className="header-name">
                InkanyeziBot{' '}
                <span style={{ fontSize: 10, color: '#F4B942', fontFamily: "'Space Mono', monospace", fontWeight: 400 }}>✦</span>
              </div>
              <div className="header-status">
                <span className="ping-wrap">
                  <span className="ping-anim" />
                  <span className="ping-dot" />
                </span>
                <span>Online · AI Automation · Durban, ZA</span>
              </div>
            </div>
            <div className="header-flag">
              <div className="flag-label">🇿🇦 SA AI</div>
              <div className="flag-bars">
                {[['#007A4D',11],['#FFB612',11],['#DE3831',18],['#002395',11],['#FFFFFF',11]].map(([c,w],i)=>(
                  <div key={i} style={{width:w,height:'2.5px',background:c,borderRadius:2,opacity:0.7}} />
                ))}
              </div>
            </div>
          </div>

          {/* MESSAGES */}
          <div className="msg-area">
            {messages.map((msg, i) => (
              <div key={i} className="msg-bubble" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className={`msg-row ${msg.role}`}>
                  {msg.role === 'assistant' && (
                    <div className="msg-avatar">⭐</div>
                  )}
                  <div className={`msg-text ${msg.role}`}>{msg.content}</div>
                </div>
                {/* Quick chips after first assistant message only */}
                {i === 0 && msg.role === 'assistant' && (
                  <div className="chips-wrap" style={{ marginLeft: 28 }}>
                    <div className="chips-label">Quick questions:</div>
                    {chips.map((chip, ci) => (
                      <button
                        key={ci}
                        className="chip-btn"
                        style={{ animationDelay: `${ci * 0.08}s`, opacity: 0 }}
                        onClick={() => sendMessage(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="msg-row assistant">
                <div className="msg-avatar">⭐</div>
                <div className="thinking">
                  <div className="think-dot" />
                  <div className="think-dot" />
                  <div className="think-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT BAR */}
          <div className="input-bar">
            <div className="input-row">
              <textarea
                ref={textareaRef}
                className="msg-input"
                rows={1}
                placeholder="Send a message into the cosmos..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
              />
              <button
                className={`send-btn ${input.trim() && !loading ? 'active' : 'inactive'}`}
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                title="Launch message 🚀"
              >
                🚀
              </button>
            </div>
            <div className="input-footer">✦ INKANYEZI TECHNOLOGIES · WE ARE THE SIGNAL IN THE NOISE ✦</div>
          </div>
        </div>
      </div>
    </>
  );
}
