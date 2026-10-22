// app/api/sheet/route.js  v5 — hardened
// GET reads all leads; PUT saves one edit (→ Make webhook). Both require a signed-in session.
// No hardcoded fallbacks, no mock data, CORS restricted to the dashboard origin.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const SHEET_TAB = 'Lead Data';
const ALLOWED_ORIGIN = process.env.DASHBOARD_ORIGIN || 'https://inkanyezibot-v2.vercel.app';

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
}
function configError(missing) {
  console.error('[Sheet] Missing required env var:', missing);
  return NextResponse.json({ error: 'Server not configured' }, { status: 500, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── GET — read all leads (signed-in users only) ───────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const API_KEY  = process.env.GOOGLE_SHEETS_API_KEY;
  if (!SHEET_ID) return configError('GOOGLE_SHEET_ID');
  if (!API_KEY)  return configError('GOOGLE_SHEETS_API_KEY');

  try {
    const range = encodeURIComponent(`${SHEET_TAB}!A:Z`);
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
    const res   = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Sheet GET] Sheets API error:', res.status, err.slice(0, 300));
      return NextResponse.json({ error: 'Could not read the sheet' }, { status: 502, headers: CORS });
    }

    const data = await res.json();
    const rows = data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ leads: [], source: 'sheet', total: 0 }, { headers: CORS });
    }

    const headers = rows[0].map((h, i) => {
      const norm = h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (!norm || norm === 'tr') return `_col_${i}`;
      return norm;
    });

    const PHONE_COL = 2; // phone is always column C
    const leads = rows.slice(1).map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => { obj[h] = (row[j] || '').trim(); });
      return {
        _row: obj._row,
        name: obj.name || obj.lead_name || '',
        email: obj.email || '',
        phone: (row[PHONE_COL] || '').trim(),
        company: obj.company || '',
        service: (obj.service_interest || obj.service || '').toLowerCase(),
        message: obj.message || obj.pain_point || '',
        status: obj.status || obj.meeting_status || 'New',
        progress: obj.progress || '',
        notes: obj.notes || '',
        ref: obj.reference || obj.reference_number || obj.ref || '',
        created: obj.timestamp || obj.date_added || obj.created || '',
        projectStarted: obj.project_started || obj.started || 'No',
        startDate: obj.start_date || obj.project_start || '',
        endDate: obj.end_date || obj.project_end || obj.target_end_date || '',
        deliverables: obj.deliverables || '',
        invoiceStatus: obj.invoice_status || 'Not Sent',
        invoiceAmount: obj.invoice_amount || obj.amount || '',
        meetingStatus: obj.meeting_status || '',
        meetingDate: obj.meeeting_date || obj.meeting_date || '',
        meetingTime: obj.meeting_time || '',
        source: obj.source || '',
        has_email: (obj.has_email || '').toLowerCase() === 'true',
        has_whatsapp: (obj.has_whatsapp || '').toLowerCase() === 'true',
      };
    }).filter(l => l.name);

    return NextResponse.json({ leads, source: 'sheet', total: leads.length }, { headers: CORS });
  } catch (e) {
    console.error('[Sheet GET] Exception:', e.message);
    return NextResponse.json({ error: 'Could not read the sheet' }, { status: 500, headers: CORS });
  }
}

// ── PUT — save a lead edit (signed-in users only) ─────────────────────────────
export async function PUT(request) {
  const session = await auth();
  if (!session?.user?.email) return unauthorized();

  const MAKE_CRM_WEBHOOK = process.env.MAKE_CRM_WEBHOOK_URL;
  if (!MAKE_CRM_WEBHOOK) return configError('MAKE_CRM_WEBHOOK_URL');

  try {
    const body = await request.json();
    if (!body._row || body._row < 2) {
      return NextResponse.json({ success: false, error: 'Missing or invalid _row number' }, { status: 400, headers: CORS });
    }

    const payload = {
      _row: body._row,
      name: body.name || '', email: body.email || '', phone: body.phone || '',
      company: body.company || '', service: body.service || '', message: body.message || '',
      status: body.status || 'New', progress: body.progress || '', notes: body.notes || '',
      projectStarted: body.projectStarted || 'No', startDate: body.startDate || '', endDate: body.endDate || '',
      deliverables: body.deliverables || '', invoiceStatus: body.invoiceStatus || 'Not Sent',
      invoiceAmount: body.invoiceAmount || '', meetingStatus: body.meetingStatus || '',
      meetingDate: body.meetingDate || '', meetingTime: body.meetingTime || '',
      _source: 'dashboard', _timestamp: new Date().toISOString(),
    };

    const makeRes = await fetch(MAKE_CRM_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!makeRes.ok) {
      const errText = await makeRes.text();
      console.error('[Sheet PUT] Make webhook error:', errText);
      return NextResponse.json({ success: false, error: 'Make webhook failed' }, { status: 502, headers: CORS });
    }

    return NextResponse.json({ success: true, row: body._row }, { headers: CORS });
  } catch (e) {
    console.error('[Sheet PUT] Exception:', e.message);
    return NextResponse.json({ success: false, error: 'Update failed' }, { status: 500, headers: CORS });
  }
}
