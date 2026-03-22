'use client';

import { useState, useEffect, useRef } from 'react';

export default function HomePage() {
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes floatBubble {
          0%,100% { transform: translateY(0) scale(1); box-shadow: 0 0 30px rgba(249,115,22,0.55), 0 0 60px rgba(249,115,22,0.2); }
          50%      { transform: translateY(-6px) scale(1.03); box-shadow: 0 0 40px rgba(249,115,22,0.7), 0 0 80px rgba(249,115,22,0.3); }
        }
        @keyframes orbitRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes windowSlide {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .fab {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 1000;
          width: 62px;
          height: 62px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF6B35, #c2410c);
          border: 2px solid rgba(249,115,22,0.45);
          cursor: pointer;
          font-size: 24px;
          animation: floatBubble 3s ease-in-out infinite;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
        }
        .fab:hover { transform: scale(1.08) !important; animation-play-state: paused; }

        .orbit-ring {
          position: absolute;
          width: 62px; height: 62px;
          animation: orbitRing 4s linear infinite;
          pointer-events: none;
        }
        .orbit-dot {
          position: absolute;
          top: -3px; left: 50%;
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #F4B942;
          transform: translateX(-50%);
          box-shadow: 0 0 10px #F4B942;
        }

        .chat-window {
          position: fixed;
          right: 24px;
          z-index: 999;
          width: 400px;
          border: none;
          border-radius: 18px;
          box-shadow: 0 12px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(244,185,66,0.15);
          animation: windowSlide 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
          overflow: hidden;

          /* Responsive height — never clips the top */
          bottom: 96px;
          height: min(640px, calc(100dvh - 110px));
        }

        /* Laptop short screens */
        @media (max-height: 768px) {
          .chat-window {
            height: calc(100dvh - 100px);
            bottom: 86px;
          }
        }

        /* Mobile portrait — full screen */
        @media (max-width: 480px) {
          .chat-window {
            right: 0; left: 0; bottom: 0;
            width: 100%;
            height: 100dvh;
            border-radius: 0;
          }
          .fab {
            bottom: 16px;
            right: 16px;
          }
        }

        /* Tablet */
        @media (max-width: 768px) and (min-width: 481px) {
          .chat-window {
            width: calc(100vw - 48px);
            max-width: 400px;
          }
        }
      `}</style>

      <main style={{ minHeight: '100vh', background: 'transparent' }}>
        {/* Floating action button */}
        <button
          className="fab"
          aria-label={open ? 'Close InkanyeziBot' : 'Open InkanyeziBot'}
          onClick={() => setOpen((v) => !v)}
        >
          <div className="orbit-ring">
            <div className="orbit-dot" />
          </div>
          <span style={{ position: 'relative', zIndex: 1, transition: 'transform 0.3s' }}>
            {open ? '✕' : '⭐'}
          </span>
        </button>

        {/* Chat iframe */}
        {open && (
          <iframe
            className="chat-window"
            src="/embed"
            title="InkanyeziBot"
            allow="microphone"
          />
        )}
      </main>
    </>
  );
}
