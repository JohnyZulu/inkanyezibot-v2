'use client';

// app/dashboard/UserMenu.tsx
// Profile avatar + sign-out menu for the dashboard header.
// Shows who is signed in (from /api/me) and signs out via the Auth.js endpoint.

import { useState, useEffect, useRef } from 'react';

type Theme = {
  bg: string; card: string; border: string; borderHover: string;
  gold: string; orange: string; text: string; muted: string; dimmed: string;
  inputBg: string; modalBg: string; trackBg: string;
};

export default function UserMenu({ C, dark }: { C: Theme; dark: boolean }) {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : { email: null }))
      .then(d => { if (alive) setEmail(d.email); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/auth/csrf');
      const { csrfToken } = await r.json();
      await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, callbackUrl: '/dashboard' }),
      });
    } catch { /* fall through to redirect */ }
    window.location.href = '/dashboard'; // session cleared → bounces to login
  }

  const initial = (email || '?').trim().charAt(0).toUpperCase();

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account"
        title={email || 'Account'}
        style={{
          width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`,
          color: '#0A1628', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {initial}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, zIndex: 650, minWidth: 220,
          background: C.modalBg, border: `1px solid ${C.borderHover}`, borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.muted }}>Signed in as</div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600, wordBreak: 'break-all', marginTop: 2 }}>
              {email || '—'}
            </div>
          </div>
          <button
            onClick={signOut}
            disabled={busy}
            style={{
              width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none',
              background: 'transparent', color: C.text, fontSize: 13,
              cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = C.inputBg)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 14 }}>⏻</span>{busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
