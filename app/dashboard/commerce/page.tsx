'use client';
// app/dashboard/commerce/page.tsx — Milestone 1 owner test harness (behind Google login + OWNER_EMAILS).
// Lets you run the headless paid-order core end-to-end from a browser:
// pick items → see server prices → confirm total → Paystack TEST checkout → watch status/tasks.

import { useCallback, useEffect, useMemo, useState } from 'react';

type Product = { sku: string; name: string; price_cents: number; on_hand: number; available: number; active: boolean };
type Order = { order_number: string; status: string; fulfilment_status: string; total_cents: number; currency: string;
               flags: string[]; created_at: string; paid_at: string | null; email: string };
type Task = { kind: string; role: string; assignee: string; priority: string; status: string; reason: string;
              created_at: string; order_number: string | null };
type Overview = { store: { name: string; currency: string; flat_delivery_cents: number | null; reservation_minutes: number } | null;
                  products: Product[]; orders: Order[]; open_tasks: Task[]; testMode: boolean; error?: string };

const C = { bg: '#060e1d', card: '#0d1e35', border: 'rgba(244,185,66,0.15)', gold: '#F4B942', text: '#e8eaf0',
            muted: 'rgba(232,234,240,0.55)', input: 'rgba(255,255,255,0.05)', red: '#e24b4a', green: '#3d9e6e' };
const rand = (c: number) => `R ${(c / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random());

const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 };
const inp: React.CSSProperties = { background: C.input, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', width: '100%' };
const btn: React.CSSProperties = { background: C.gold, color: '#0A1628', border: 0, borderRadius: 8, padding: '10px 14px', fontWeight: 600, cursor: 'pointer' };
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', color: C.muted, fontWeight: 500, fontSize: 12 };
const td: React.CSSProperties = { padding: '6px 8px', borderTop: `1px solid ${C.border}`, fontSize: 13 };

export default function CommerceTestPage() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'collect' | 'courier'>('collect');
  const [addr, setAddr] = useState({ line1: '', city: 'Durban', postal_code: '' });
  const [idemKey, setIdemKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');
  const [checkoutUrl, setCheckoutUrl] = useState<string>('');

  const load = useCallback(async () => {
    const r = await fetch('/api/commerce/admin/overview', { cache: 'no-store' });
    setOv(await r.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const lines = useMemo(() => (ov?.products || []).filter((p) => (qty[p.sku] || 0) > 0)
    .map((p) => ({ sku: p.sku, qty: qty[p.sku], line: p.price_cents * qty[p.sku], name: p.name })), [ov, qty]);
  const subtotal = lines.reduce((s, l) => s + l.line, 0);
  const delivery = method === 'courier' ? (ov?.store?.flat_delivery_cents ?? null) : 0;
  const total = subtotal + (delivery ?? 0);

  async function submit() {
    setBusy(true); setResult(''); setCheckoutUrl('');
    try {
      const r = await fetch('/api/commerce/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { email, ...(name ? { name } : {}) },
          items: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
          delivery: method === 'courier' ? { method, ...addr } : { method },
          expectedTotalCents: total,          // what you confirmed on screen — server rejects if it differs
          idempotencyKey: idemKey,
        }),
      });
      const j = await r.json();
      setResult(JSON.stringify(j, null, 2));
      if (j?.checkout?.checkoutUrl) setCheckoutUrl(j.checkout.checkoutUrl);
      if (r.ok || r.status === 409) setIdemKey(newKey());   // next submission = a new order
    } finally { setBusy(false); load(); }
  }

  async function runWorker() {
    setBusy(true);
    try {
      const r = await fetch('/api/commerce/cron', { method: 'POST' });
      setResult(JSON.stringify(await r.json(), null, 2));
    } finally { setBusy(false); load(); }
  }

  if (!ov) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 24 }}>Loading…</main>;
  if (ov.error) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 24 }}>
    <p style={{ color: C.red }}>{ov.error}</p><p style={{ color: C.muted }}>Check the Vercel env vars and that you are listed in OWNER_EMAILS.</p></main>;

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <div>
            <a href="/dashboard" style={{ color: C.muted, fontSize: 13 }}>← Dashboard</a>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>Commerce core — Milestone 1</h1>
            <div style={{ color: C.muted, fontSize: 13 }}>{ov.store?.name || 'Store not found — run 003_seed_test_store.sql'}</div>
          </div>
          <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                         background: ov.testMode ? 'rgba(61,158,110,0.2)' : 'rgba(226,75,74,0.25)', color: ov.testMode ? C.green : C.red }}>
            {ov.testMode ? 'PAYSTACK TEST MODE' : 'LIVE KEY — STOP'}
          </span>
        </div>

        <section style={card}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>1 · Build a test order</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>SKU</th><th style={th}>Product</th><th style={th}>Price</th><th style={th}>Available / on hand</th><th style={th}>Qty</th></tr></thead>
              <tbody>{ov.products.map((p) => (
                <tr key={p.sku}>
                  <td style={td}>{p.sku}</td><td style={td}>{p.name}</td><td style={td}>{rand(p.price_cents)}</td>
                  <td style={td}>{p.available} / {p.on_hand}</td>
                  <td style={td}><input type="number" min={0} max={10} value={qty[p.sku] || 0} style={{ ...inp, width: 70 }}
                    onChange={(e) => setQty({ ...qty, [p.sku]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 12 }}>
            <input style={inp} placeholder="Customer email (required by Paystack)" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input style={inp} placeholder="Customer name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <select style={inp} value={method} onChange={(e) => setMethod(e.target.value as 'collect' | 'courier')}>
              <option value="collect">Collect (no delivery fee)</option>
              <option value="courier">Courier</option>
            </select>
          </div>
          {method === 'courier' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 10 }}>
              <input style={inp} placeholder="Street address" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
              <input style={inp} placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              <input style={inp} placeholder="Postal code" value={addr.postal_code} onChange={(e) => setAddr({ ...addr, postal_code: e.target.value })} />
            </div>
          )}
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: C.input, fontSize: 14 }}>
            {lines.length === 0 ? <span style={{ color: C.muted }}>Choose at least one item.</span> : <>
              {lines.map((l) => <div key={l.sku}>{l.qty} × {l.name} — {rand(l.line)}</div>)}
              <div>Delivery — {delivery === null ? <span style={{ color: C.red }}>not priced (order will be refused + task)</span> : rand(delivery)}</div>
              <div style={{ fontWeight: 700, marginTop: 6 }}>Total to confirm: {rand(total)}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>Display only — the server recalculates and refuses the order if this differs.</div>
            </>}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button style={{ ...btn, opacity: busy || !lines.length || !email ? 0.5 : 1 }} disabled={busy || !lines.length || !email} onClick={submit}>
              Confirm total &amp; create checkout</button>
            <button style={{ ...btn, background: 'transparent', color: C.gold, border: `1px solid ${C.gold}` }} disabled={busy} onClick={runWorker}>
              Run worker now (reconcile + alerts)</button>
            <button style={{ ...btn, background: 'transparent', color: C.muted, border: `1px solid ${C.border}` }} onClick={load}>Refresh</button>
          </div>
          {checkoutUrl && <p style={{ marginTop: 12 }}>
            <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, fontWeight: 600 }}>
              Open Paystack test checkout →</a></p>}
          {result && <pre style={{ marginTop: 12, padding: 12, background: '#030812', borderRadius: 8, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{result}</pre>}
        </section>

        <section style={card}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>2 · Orders</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Order</th><th style={th}>Status</th><th style={th}>Fulfilment</th><th style={th}>Total</th><th style={th}>Flags</th><th style={th}>Created</th></tr></thead>
              <tbody>{ov.orders.map((o) => (
                <tr key={o.order_number}>
                  <td style={td}>{o.order_number}</td>
                  <td style={{ ...td, color: o.status === 'confirmed' ? C.green : C.text }}>{o.status}</td>
                  <td style={td}>{o.fulfilment_status}</td><td style={td}>{rand(o.total_cents)}</td>
                  <td style={{ ...td, color: o.flags.length ? C.red : C.muted }}>{o.flags.join(', ') || '—'}</td>
                  <td style={td}>{new Date(o.created_at).toLocaleString('en-ZA')}</td>
                </tr>))}
                {!ov.orders.length && <tr><td style={td} colSpan={6}>No orders yet.</td></tr>}</tbody>
            </table>
          </div>
        </section>

        <section style={card}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>3 · Open owner tasks</h2>
          {ov.open_tasks.length === 0 ? <p style={{ color: C.muted, margin: 0 }}>Nothing needs you right now.</p> :
            ov.open_tasks.map((t, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ fontWeight: 600 }}>{t.kind}{t.order_number ? ` · ${t.order_number}` : ''}
                  <span style={{ marginLeft: 8, fontSize: 12, color: t.priority === 'urgent' ? C.red : C.gold }}>{t.priority}</span></div>
                <div style={{ fontSize: 13, color: C.muted }}>{t.reason} — {t.role} · {t.assignee} · {t.status}</div>
              </div>))}
        </section>
      </div>
    </main>
  );
}
