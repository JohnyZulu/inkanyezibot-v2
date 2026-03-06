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
      setTimeout(() => setDoorsAnimating(false), 2800);
    }, 500);
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
    const sendChip = async (text) => {
    if (isLoading) return;
    triggerShootingStar();
    const userMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
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
        @keyframes doorOpenLeft {
          0% { transform: translateX(0); }
          30% { transform: translateX(-15%); }
          70% { transform: translateX(-80%); }
          90% { transform: translateX(-97%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes doorOpenRight {
          0% { transform: translateX(0); }
          30% { transform: translateX(15%); }
          70% { transform: translateX(80%); }
          90% { transform: translateX(97%); }
          100% { transform: translateX(100%); }
        }
        @keyframes revealContent {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes energyPulse {
          0%, 100% { opacity: 0.5; filter: brightness(0.8); }
          50% { opacity: 1; filter: brightness(1.4); }
        }
        @keyframes boltFlicker {
          0%, 85%, 100% { opacity: 1; }
          90% { opacity: 0.2; }
        }
        @keyframes scanSweep {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(1000%); opacity: 0; }
        }
        @keyframes engineGlow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes pressureVent {
          0%, 100% { opacity: 0; transform: scaleY(0); }
          50% { opacity: 1; transform: scaleY(1); }
        }
        .message-bubble { animation: fadeInUp 0.3s ease forwards; }
        .star-pulse { animation: twinkle var(--duration, 2s) ease-in-out infinite; }
        .cosmic-border { animation: pulseGlow 3s ease-in-out infinite; }
        .door-open-left { animation: doorOpenLeft 2.5s cubic-bezier(0.33, 0, 0.2, 1) forwards; }
        .door-open-right { animation: doorOpenRight 2.5s cubic-bezier(0.33, 0, 0.2, 1) forwards; }
        .content-reveal { animation: revealContent 0.6s ease 2.2s both; }
        textarea:focus { border-color: rgba(249,115,22,0.6) !important; box-shadow: 0 0 12px rgba(249,115,22,0.3); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(249,115,22,0.3); border-radius: 2px; }
      `}</style>

      {/* SPACESHIP DOORS */}
      {doorsAnimating && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          zIndex: 100, display: 'flex', overflow: 'hidden',
          pointerEvents: doorsOpen ? 'none' : 'all'
        }}>

          {/* LEFT DOOR */}
          <div className={doorsOpen ? 'door-open-left' : ''} style={{
            width: '50%', height: '100%', position: 'relative', overflow: 'hidden', flexShrink: 0
          }}>
            <svg width="100%" height="100%" viewBox="0 0 200 600" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="doorBgL" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#050e20"/>
                  <stop offset="40%" stopColor="#0a1a35"/>
                  <stop offset="100%" stopColor="#040c1a"/>
                </linearGradient>
                <linearGradient id="panelGradL" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0d2040"/>
                  <stop offset="50%" stopColor="#112545"/>
                  <stop offset="100%" stopColor="#0a1a35"/>
                </linearGradient>
                <linearGradient id="energyL" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="transparent"/>
                  <stop offset="30%" stopColor="#f97316" stopOpacity="0.6"/>
                  <stop offset="50%" stopColor="#f97316"/>
                  <stop offset="70%" stopColor="#f97316" stopOpacity="0.6"/>
                  <stop offset="100%" stopColor="transparent"/>
                </linearGradient>
                <linearGradient id="edgeGlowL" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="transparent"/>
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.4"/>
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* Background */}
              <rect width="200" height="600" fill="url(#doorBgL)"/>

              {/* Outer structural frame */}
              <path d="M8,20 L192,8 L192,592 L8,580 Z" fill="url(#panelGradL)" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.4"/>

              {/* Inner beveled panel */}
              <path d="M22,45 L178,32 L178,568 L22,555 Z" fill="#0a1628" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.25"/>

              {/* Deep inner recess */}
              <path d="M38,72 L162,60 L162,540 L38,528 Z" fill="#060f20" stroke="#f97316" strokeWidth="0.5" strokeOpacity="0.15"/>

              {/* Top angled header panel */}
              <path d="M8,20 L192,8 L192,80 L8,95 Z" fill="#0f2040" stroke="#f97316" strokeWidth="1" strokeOpacity="0.5"/>

              {/* Bottom angled footer panel */}
              <path d="M8,505 L192,520 L192,592 L8,580 Z" fill="#0f2040" stroke="#f97316" strokeWidth="1" strokeOpacity="0.5"/>

              {/* Center main panel */}
              <path d="M22,108 L178,96 L178,504 L22,492 Z" fill="#0c1e3a" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.3"/>

              {/* Angled top-left cut */}
              <path d="M22,45 L70,45 L45,108 L22,108 Z" fill="#0a1830" stroke="#f97316" strokeWidth="0.6" strokeOpacity="0.3"/>

              {/* Angled bottom-left cut */}
              <path d="M22,492 L45,492 L70,555 L22,555 Z" fill="#0a1830" stroke="#f97316" strokeWidth="0.6" strokeOpacity="0.3"/>

              {/* Vertical left ridge */}
              <path d="M45,108 L55,108 L55,492 L45,492 Z" fill="#0d2245" stroke="#f97316" strokeWidth="0.5" strokeOpacity="0.4"/>

              {/* Vertical structural line */}
              <line x1="100" y1="96" x2="100" y2="504" stroke="#f97316" strokeWidth="0.5" strokeOpacity="0.15"/>

              {/* Energy strips */}
              <rect x="60" y="155" width="118" height="5" rx="2" fill="url(#energyL)" style={{animation: 'energyPulse 1.5s ease-in-out infinite'}}/>
              <rect x="60" y="220" width="118" height="5" rx="2" fill="url(#energyL)" style={{animation: 'energyPulse 1.8s ease-in-out 0.3s infinite'}}/>
              <rect x="60" y="290" width="118" height="8" rx="3" fill="url(#energyL)" style={{animation: 'energyPulse 1.2s ease-in-out 0.1s infinite'}}/>
              <rect x="60" y="370" width="118" height="5" rx="2" fill="url(#energyL)" style={{animation: 'energyPulse 1.6s ease-in-out 0.4s infinite'}}/>
              <rect x="60" y="435" width="118" height="5" rx="2" fill="url(#energyL)" style={{animation: 'energyPulse 1.4s ease-in-out 0.2s infinite'}}/>

              {/* Horizontal panel lines */}
              <line x1="22" y1="130" x2="178" y2="125" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.3"/>
              <line x1="22" y1="470" x2="178" y2="475" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.3"/>

              {/* Rivets */}
              {[130, 195, 260, 325, 390, 455].map((y, i) => (
                <g key={i}>
                  <circle cx="30" cy={y} r="5" fill="#1a0800" stroke="#f97316" strokeWidth="1" strokeOpacity="0.7" filter="url(#glow)"/>
                  <circle cx="30" cy={y} r="3" fill="#f97316" fillOpacity="0.8"/>
                  <circle cx="29" cy={y-1} r="1" fill="white" fillOpacity="0.6"/>
                </g>
              ))}

              {/* Top indicator triangle */}
              <polygon points="100,10 88,30 112,30" fill="#f97316" fillOpacity="0.9" filter="url(#glow)"/>
              <polygon points="100,14 92,28 108,28" fill="white" fillOpacity="0.3"/>

              {/* Corner brackets */}
              <path d="M15,28 L15,55 M15,28 L40,25" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>
              <path d="M15,572 L15,545 M15,572 L40,575" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>
              <path d="M185,15 L185,42 M185,15 L160,12" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>
              <path d="M185,585 L185,558 M185,585 L160,588" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>

              {/* Edge glow */}
              <rect x="175" y="0" width="25" height="600" fill="url(#edgeGlowL)"/>

              {/* Engine pulse bottom */}
              <rect x="8" y="590" width="184" height="10" fill="#f97316" fillOpacity="0.7" style={{animation: 'engineGlow 0.8s ease-in-out infinite'}}/>

              {/* Scan line */}
              <rect x="0" y="0" width="200" height="4" fill="url(#energyL)" style={{animation: 'scanSweep 1.5s ease-in-out 0.3s forwards'}}/>

              {/* Center star */}
              <text x="100" y="310" textAnchor="middle" fontSize="36" fill="#f97316" filter="url(#glow)" style={{opacity: doorsOpen ? 0 : 1, transition: 'opacity 0.3s'}}>⭐</text>
            </svg>
          </div>

          {/* RIGHT DOOR */}
          <div className={doorsOpen ? 'door-open-right' : ''} style={{
            width: '50%', height: '100%', position: 'relative', overflow: 'hidden', flexShrink: 0
          }}>
            <svg width="100%" height="100%" viewBox="0 0 200 600" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="doorBgR" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#050e20"/>
                  <stop offset="40%" stopColor="#0a1a35"/>
                  <stop offset="100%" stopColor="#040c1a"/>
                </linearGradient>
                <linearGradient id="panelGradR" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0d2040"/>
                  <stop offset="50%" stopColor="#112545"/>
                  <stop offset="100%" stopColor="#0a1a35"/>
                </linearGradient>
                <linearGradient id="energyR" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="transparent"/>
                  <stop offset="30%" stopColor="#f97316" stopOpacity="0.6"/>
                  <stop offset="50%" stopColor="#f97316"/>
                  <stop offset="70%" stopColor="#f97316" stopOpacity="0.6"/>
                  <stop offset="100%" stopColor="transparent"/>
                </linearGradient>
                <linearGradient id="edgeGlowR" x1="100%" y1="0%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="transparent"/>
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.4"/>
                </linearGradient>
              </defs>

              {/* Background */}
              <rect width="200" height="600" fill="url(#doorBgR)"/>

              {/* Outer structural frame */}
              <path d="M8,8 L192,20 L192,580 L8,592 Z" fill="url(#panelGradR)" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.4"/>

              {/* Inner beveled panel */}
              <path d="M22,32 L178,45 L178,555 L22,568 Z" fill="#0a1628" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.25"/>

              {/* Deep inner recess */}
              <path d="M38,60 L162,72 L162,528 L38,540 Z" fill="#060f20" stroke="#f97316" strokeWidth="0.5" strokeOpacity="0.15"/>

              {/* Top angled header panel */}
              <path d="M8,8 L192,20 L192,95 L8,80 Z" fill="#0f2040" stroke="#f97316" strokeWidth="1" strokeOpacity="0.5"/>

              {/* Bottom angled footer panel */}
              <path d="M8,520 L192,505 L192,580 L8,592 Z" fill="#0f2040" stroke="#f97316" strokeWidth="1" strokeOpacity="0.5"/>

              {/* Center main panel */}
              <path d="M22,96 L178,108 L178,492 L22,504 Z" fill="#0c1e3a" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.3"/>

              {/* Angled top-right cut */}
              <path d="M130,45 L178,45 L178,108 L155,108 Z" fill="#0a1830" stroke="#f97316" strokeWidth="0.6" strokeOpacity="0.3"/>

              {/* Angled bottom-right cut */}
              <path d="M155,492 L178,492 L178,555 L130,555 Z" fill="#0a1830" stroke="#f97316" strokeWidth="0.6" strokeOpacity="0.3"/>

              {/* Vertical right ridge */}
              <path d="M145,108 L155,108 L155,492 L145,492 Z" fill="#0d2245" stroke="#f97316" strokeWidth="0.5" strokeOpacity="0.4"/>

              {/* Vertical structural line */}
              <line x1="100" y1="96" x2="100" y2="504" stroke="#f97316" strokeWidth="0.5" strokeOpacity="0.15"/>

              {/* Energy strips */}
              <rect x="22" y="155" width="118" height="5" rx="2" fill="url(#energyR)" style={{animation: 'energyPulse 1.5s ease-in-out infinite'}}/>
              <rect x="22" y="220" width="118" height="5" rx="2" fill="url(#energyR)" style={{animation: 'energyPulse 1.8s ease-in-out 0.3s infinite'}}/>
              <rect x="22" y="290" width="118" height="8" rx="3" fill="url(#energyR)" style={{animation: 'energyPulse 1.2s ease-in-out 0.1s infinite'}}/>
              <rect x="22" y="370" width="118" height="5" rx="2" fill="url(#energyR)" style={{animation: 'energyPulse 1.6s ease-in-out 0.4s infinite'}}/>
              <rect x="22" y="435" width="118" height="5" rx="2" fill="url(#energyR)" style={{animation: 'energyPulse 1.4s ease-in-out 0.2s infinite'}}/>

              {/* Horizontal panel lines */}
              <line x1="22" y1="125" x2="178" y2="130" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.3"/>
              <line x1="22" y1="475" x2="178" y2="470" stroke="#f97316" strokeWidth="0.8" strokeOpacity="0.3"/>

              {/* Rivets */}
              {[130, 195, 260, 325, 390, 455].map((y, i) => (
                <g key={i}>
                  <circle cx="170" cy={y} r="5" fill="#1a0800" stroke="#f97316" strokeWidth="1" strokeOpacity="0.7" filter="url(#glow)"/>
                  <circle cx="170" cy={y} r="3" fill="#f97316" fillOpacity="0.8"/>
                  <circle cx="169" cy={y-1} r="1" fill="white" fillOpacity="0.6"/>
                </g>
              ))}

              {/* Top indicator triangle */}
              <polygon points="100,10 88,30 112,30" fill="#f97316" fillOpacity="0.9" filter="url(#glow)"/>
              <polygon points="100,14 92,28 108,28" fill="white" fillOpacity="0.3"/>

              {/* Corner brackets */}
              <path d="M15,12 L15,38 M15,12 L40,15" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>
              <path d="M15,588 L15,562 M15,588 L40,585" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>
              <path d="M185,25 L185,52 M185,25 L160,28" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>
              <path d="M185,575 L185,548 M185,575 L160,572" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>

              {/* Edge glow */}
              <rect x="0" y="0" width="25" height="600" fill="url(#edgeGlowR)"/>

              {/* Engine pulse bottom */}
              <rect x="8" y="590" width="184" height="10" fill="#f97316" fillOpacity="0.7" style={{animation: 'engineGlow 0.8s ease-in-out infinite'}}/>

              {/* Scan line */}
              <rect x="0" y="0" width="200" height="4" fill="url(#energyR)" style={{animation: 'scanSweep 1.5s ease-in-out 0.3s forwards'}}/>

              {/* Center star */}
              <text x="100" y="310" textAnchor="middle" fontSize="36" fill="#f97316" filter="url(#glow)" style={{opacity: doorsOpen ? 0 : 1, transition: 'opacity 0.3s'}}>⭐</text>
            </svg>
          </div>
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
