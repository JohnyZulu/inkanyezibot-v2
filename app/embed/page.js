'use client';
import { useState, useRef, useEffect } from 'react';

export default function EmbedPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Sawubona! 👋 I\'m InkanyeziBot, your AI sales assistant from Inkanyezi Technologies.\n\n📋 By chatting, you agree to our POPIA-compliant data policy.\n\nWhat\'s your name?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stars, setStars] = useState([]);
  const [shootingStars, setShootingStars] = useState([]);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [doorsAnimating, setDoorsAnimating] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const generatedStars = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      duration: Math.random() * 3 + 2,
    }));
    setStars(generatedStars);
    const timer = setTimeout(() => {
      setDoorsOpen(true);
      setTimeout(() => setDoorsAnimating(false), 1400);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const triggerShootingStar = () => {
    const newStar = { id: Date.now(), startX: Math.random() * 50, startY: Math.random() * 50 };
    setShootingStars(prev => [...prev, newStar]);
    setTimeout(() => setShootingStars(prev => prev.filter(s => s.id !== newStar.id)), 1000);
  };

  const formatMessage = (text) => {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    triggerShootingStar();
    const userMessage = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await response.json();
      setMessages([...newMessages, { role: 'assistant', content: data.message }]);
    } catch (error) {
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const DoorPanel = ({ side }) => {
    const isLeft = side === 'left';
    return (
      <div
        className={doorsOpen ? (isLeft ? 'door-left' : 'door-right') : ''}
        style={{
          width: '50%', height: '100%', position: 'relative', overflow: 'hidden',
          background: isLeft
            ? 'linear-gradient(160deg, #0a1628 0%, #0d1f3c 40%, #071020 100%)'
            : 'linear-gradient(200deg, #0a1628 0%, #0d1f3c 40%, #071020 100%)',
          borderRight: isLeft ? '3px solid rgba(249,115,22,0.9)' : 'none',
          borderLeft: !isLeft ? '3px solid rgba(249,115,22,0.9)' : 'none',
        }}
      >
        {/* Top indicator light */}
        <div style={{
          position: 'absolute', top: '8px',
          left: isLeft ? '50%' : '50%',
          transform: 'translateX(-50%)',
          width: '0', height: '0',
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderBottom: '14px solid rgba(249,115,22,0.9)',
          filter: 'drop-shadow(0 0 6px rgba(249,115,22,1))'
        }} />

        {/* Outer frame border */}
        <div style={{
          position: 'absolute',
          top: '28px', bottom: '28px',
          left: isLeft ? '8px' : '4px',
          right: isLeft ? '4px' : '8px',
          border: '2px solid rgba(249,115,22,0.25)',
          borderRadius: '2px'
        }} />

        {/* Inner frame */}
        <div style={{
          position: 'absolute',
          top: '44px', bottom: '44px',
          left: isLeft ? '20px' : '10px',
          right: isLeft ? '10px' : '20px',
          border: '1px solid rgba(249,115,22,0.15)',
          borderRadius: '2px'
        }} />

        {/* Main angled panel shape */}
        <div style={{
          position: 'absolute',
          top: '60px', bottom: '60px',
          left: isLeft ? '24px' : '8px',
          right: isLeft ? '8px' : '24px',
          background: 'linear-gradient(180deg, rgba(249,115,22,0.04) 0%, rgba(249,115,22,0.08) 50%, rgba(249,115,22,0.04) 100%)',
          border: '1px solid rgba(249,115,22,0.2)',
          clipPath: isLeft
            ? 'polygon(0% 8%, 100% 0%, 100% 100%, 0% 92%)'
            : 'polygon(0% 0%, 100% 8%, 100% 92%, 0% 100%)',
        }} />

        {/* Energy strips - like the blue strips in the reference */}
        {[28, 42, 58, 72].map((pct, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: `${pct}%`,
            left: isLeft ? '28px' : '12px',
            right: isLeft ? '12px' : '28px',
            height: '4px',
            background: `linear-gradient(90deg, transparent, rgba(249,115,22,${0.4 + i * 0.1}), rgba(249,115,22,${0.7 + i * 0.1}), rgba(249,115,22,${0.4 + i * 0.1}), transparent)`,
            borderRadius: '2px',
            boxShadow: `0 0 8px rgba(249,115,22,0.6), 0 0 16px rgba(249,115,22,0.3)`,
            animation: `energyPulse ${1.2 + i * 0.4}s ease-in-out infinite`
          }} />
        ))}

        {/* Horizontal panel dividers */}
        <div style={{ position: 'absolute', top: '22%', left: isLeft ? '20px' : '8px', right: isLeft ? '8px' : '20px', height: '1px', background: 'rgba(249,115,22,0.2)' }} />
        <div style={{ position: 'absolute', top: '50%', left: isLeft ? '16px' : '6px', right: isLeft ? '6px' : '16px', height: '2px', background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.5), transparent)' }} />
        <div style={{ position: 'absolute', top: '78%', left: isLeft ? '20px' : '8px', right: isLeft ? '8px' : '20px', height: '1px', background: 'rgba(249,115,22,0.2)' }} />

        {/* Vertical structural ridge */}
        <div style={{
          position: 'absolute',
          [isLeft ? 'left' : 'right']: '35%',
          top: '30px', bottom: '30px',
          width: '3px',
          background: 'linear-gradient(180deg, transparent, rgba(249,115,22,0.4), rgba(249,115,22,0.6), rgba(249,115,22,0.4), transparent)',
          boxShadow: '0 0 6px rgba(249,115,22,0.4)'
        }} />

        {/* Rivets / bolts */}
        {[20, 38, 56, 74, 88].map((pct, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: `${pct}%`,
            [isLeft ? 'left' : 'right']: '10px',
            width: '8px', height: '8px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #ff9a3c, #f97316, #7c2d12)',
            border: '1px solid rgba(249,115,22,0.5)',
            boxShadow: '0 0 6px rgba(249,115,22,0.8), inset 0 0 4px rgba(0,0,0,0.5)',
            animation: `boltFlicker ${0.8 + i * 0.35}s ease-in-out infinite`
          }} />
        ))}

        {/* Corner accent marks */}
        <div style={{ position: 'absolute', top: '30px', [isLeft ? 'right' : 'left']: '10px', width: '16px', height: '16px', borderTop: '2px solid rgba(249,115,22,0.6)', [isLeft ? 'borderRight' : 'borderLeft']: '2px solid rgba(249,115,22,0.6)' }} />
        <div style={{ position: 'absolute', bottom: '30px', [isLeft ? 'right' : 'left']: '10px', width: '16px', height: '16px', borderBottom: '2px solid rgba(249,115,22,0.6)', [isLeft ? 'borderRight' : 'borderLeft']: '2px solid rgba(249,115,22,0.6)' }} />

        {/* Scan line sweep */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: '3px',
          background: 'linear-gradient(90deg, transparent, rgba(249,115,22,1), white, rgba(249,115,22,1), transparent)',
          animation: 'scanLine 0.8s ease forwards',
          boxShadow: '0 0 10px rgba(249,115,22,0.8)'
        }} />

        {/* Inner edge glow */}
        <div style={{
          position: 'absolute',
          [isLeft ? 'right' : 'left']: 0,
          top: 0, bottom: 0, width: '40px',
          background: isLeft
            ? 'linear-gradient(90deg, transparent, rgba(249,115,22,0.25))'
            : 'linear-gradient(270deg, transparent, rgba(249,115,22,0.25))'
        }} />

        {/* Engine glow bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '12px',
          background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.8), transparent)',
          animation: 'enginePulse 0.6s ease-in-out infinite',
          boxShadow: '0 -4px 12px rgba(249,115,22,0.4)'
        }} />

        {/* Center star logo */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -60%)',
          fontSize: '24px',
          filter: 'drop-shadow(0 0 12px rgba(249,115,22,1))',
          opacity: doorsOpen ? 0 : 1,
          transition: 'opacity 0.2s ease'
        }}>⭐</div>
      </div>
    );
  };

  return (
    <div style={{
      width: '100%', height: '100vh',
      background: 'linear-gradient(180deg, #020818 0%, #0B1120 40%, #0f0a1e 100%)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'sans-serif', position: 'relative', overflow: 'hidden'
    }}>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes shootingStar {
          0% { transform: translateX(0) translateY(0) rotate(45deg); opacity: 1; width: 0px; }
          100% { transform: translateX(200px) translateY(200px) rotate(45deg); opacity: 0; width: 80px; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(249,115,22,0.3), 0 0 20px rgba(249,115,22,0.1); }
          50% { box-shadow: 0 0 20px rgba(249,115,22,0.6), 0 0 40px rgba(249,115,22,0.3); }
        }
        @keyframes rotateStar {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes constellation {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(12px) rotate(0deg); }
          to { transform: rotate(360deg) translateX(12px) rotate(-360deg); }
        }
        @keyframes doorLeft {
          0% { transform: translateX(0); }
          60% { transform: translateX(-88%); }
          80% { transform: translateX(-95%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes doorRight {
          0% { transform: translateX(0); }
          60% { transform: translateX(88%); }
          80% { transform: translateX(95%); }
          100% { transform: translateX(100%); }
        }
        @keyframes revealContent {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes scanLine {
          0% { top: -4px; opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes enginePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes energyPulse {
          0%, 100% { opacity: 0.5; transform: scaleX(0.95); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes boltFlicker {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(249,115,22,0.8); }
          50% { opacity: 0.4; box-shadow: 0 0 2px rgba(249,115,22,0.3); }
        }
        .message-bubble { animation: fadeInUp 0.3s ease forwards; }
        .star-pulse { animation: twinkle var(--duration, 2s) ease-in-out infinite; }
        .cosmic-border { animation: pulseGlow 3s ease-in-out infinite; }
        .door-left { animation: doorLeft 1.1s cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }
        .door-right { animation: doorRight 1.1s cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }
        .content-reveal { animation: revealContent 0.5s ease 0.9s both; }
        textarea:focus { border-color: rgba(249,115,22,0.6) !important; box-shadow: 0 0 12px rgba(249,115,22,0.3); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(249,115,22,0.3); border-radius: 2px; }
      `}</style>

      {/* SPACESHIP DOORS */}
      {doorsAnimating && (
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          zIndex: 100, display: 'flex',
          pointerEvents: doorsOpen ? 'none' : 'all'
        }}>
          <DoorPanel side="left" />
          <DoorPanel side="right" />
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="content-reveal" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative', zIndex: 1 }}>

        {stars.map(star => (
          <div key={star.id} className="star-pulse" style={{
            position: 'absolute', left: `${star.x}%`, top: `${star.y}%`,
            width: `${star.size}px`, height: `${star.size}px`,
            borderRadius: '50%', background: 'white',
            '--duration': `${star.duration}s`,
            pointerEvents: 'none', zIndex: 0
          }} />
        ))}

        {shootingStars.map(star => (
          <div key={star.id} style={{
            position: 'absolute', left: `${star.startX}%`, top: `${star.startY}%`,
            height: '2px', background: 'linear-gradient(90deg, transparent, #f97316, white)',
            borderRadius: '2px', zIndex: 1, pointerEvents: 'none',
            animation: 'shootingStar 1s ease-out forwards'
          }} />
        ))}

        <div style={{ position: 'absolute', width: '300px', height: '300px', borderRadius: '50%', top: '-100px', right: '-100px', background: 'radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'absolute', width: '200px', height: '200px', borderRadius: '50%', bottom: '100px', left: '-50px', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        {/* Header */}
        <div className="cosmic-border" style={{
          background: 'linear-gradient(135deg, rgba(15,27,53,0.95), rgba(26,42,80,0.95))',
          borderBottom: '1px solid rgba(249,115,22,0.3)',
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px',
          position: 'relative', zIndex: 2, backdropFilter: 'blur(10px)'
        }}>
          <div style={{ position: 'relative', width: '38px', height: '38px', flexShrink: 0 }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316, #c2410c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '18px', boxShadow: '0 0 15px rgba(249,115,22,0.6)',
              animation: 'rotateStar 8s linear infinite'
            }}>⭐</div>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#f97316', marginTop: '-3px', marginLeft: '-3px',
              animation: 'orbit 3s linear infinite',
              boxShadow: '0 0 6px rgba(249,115,22,0.8)'
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '14px', color: '#ffffff', letterSpacing: '0.5px' }}>InkanyeziBot ✦</div>
            <div style={{ fontSize: '10px', color: '#f97316', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }}></span>
              Online · AI Automation · Durban, ZA 🇿🇦
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {[0, 0.5, 1].map((delay, i) => (
              <div key={i} style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(249,115,22,0.6)', animation: `constellation 2s ease-in-out ${delay}s infinite` }} />
            ))}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative', zIndex: 2 }}>
          {messages.map((msg, i) => (
            <div key={i} className="message-bubble" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '6px' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #c2410c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', flexShrink: 0, boxShadow: '0 0 8px rgba(249,115,22,0.5)' }}>⭐</div>
              )}
              <div style={{
                maxWidth: '78%', padding: '10px 14px', borderRadius: '14px',
                fontSize: '13px', lineHeight: '1.6', wordBreak: 'break-word',
                background: msg.role === 'user' ? 'linear-gradient(135deg, #f97316, #c2410c)' : 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                border: msg.role === 'user' ? 'none' : '1px solid rgba(249,115,22,0.2)',
                boxShadow: msg.role === 'user' ? '0 0 15px rgba(249,115,22,0.4)' : '0 0 10px rgba(0,0,0,0.3)',
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '14px',
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '14px',
                backdropFilter: 'blur(10px)'
              }} dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #c2410c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', boxShadow: '0 0 8px rgba(249,115,22,0.5)' }}>⭐</div>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '14px', borderBottomLeftRadius: '4px', border: '1px solid rgba(249,115,22,0.2)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                {[0, 0.2, 0.4].map((delay, i) => (
                  <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', animation: `constellation 1s ease-in-out ${delay}s infinite`, boxShadow: '0 0 6px rgba(249,115,22,0.6)' }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(249,115,22,0.15)', background: 'rgba(15,27,53,0.95)', backdropFilter: 'blur(10px)', position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
              }}
              placeholder="Send a message into the cosmos..."
              rows={1}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(249,115,22,0.25)', color: '#ffffff', outline: 'none', fontSize: '13px', resize: 'none', lineHeight: '1.5', fontFamily: 'sans-serif', transition: 'all 0.3s ease' }}
            />
            <button onClick={sendMessage} disabled={isLoading} style={{ width: '42px', height: '42px', borderRadius: '50%', background: isLoading ? 'rgba(249,115,22,0.3)' : 'linear-gradient(135deg, #f97316, #c2410c)', border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer', color: 'white', fontSize: '16px', flexShrink: 0, boxShadow: '0 0 15px rgba(249,115,22,0.5)', transition: 'all 0.3s ease' }}>🚀</button>
          </div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '5px', textAlign: 'center', letterSpacing: '0.5px' }}>
            ⭐ INKANYEZI TECHNOLOGIES · WE ARE THE SIGNAL IN THE NOISE ✦
          </div>
        </div>
      </div>
    </div>
  );
}
