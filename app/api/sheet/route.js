// app/api/sheet/route.js  v3
// Reads & writes Inkanyezi Leads CRM Google Sheet
// GET  — reads all leads (API key, read-only)
// PUT  — saves a single lead edit (forwards to Make webhook → Google Sheets OAuth)
// Env vars: GOOGLE_SHEETS_API_KEY, GOOGLE_SHEET_ID, MAKE_CRM_WEBHOOK_URL

import { NextResponse } from 'next/server';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SHEET_ID           = process.env.GOOGLE_SHEET_ID || '1HbPcOop63ENb6Lcv0NVDhATP8RWmFwk4Vgqf6gE4Upk';
const API_KEY            = process.env.GOOGLE_SHEETS_API_KEY;
const MAKE_CRM_WEBHOOK   = process.env.MAKE_CRM_WEBHOOK_URL || 'https://hook.eu1.make.com/hydq8t1uu0ruqujcvp5s389bkwkjl31r';
const SHEET_TAB          = 'Lead Data';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ── GET — read all leads ──────────────────────────────────────────────────────
export async function GET() {
  try {
    if (!API_KEY) {
      return NextResponse.json({ leads: getMockLeads(), source: 'mock' }, { headers: CORS });
    }

    const range = encodeURIComponent(`${SHEET_TAB}!A:Z`);
    const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
    const res   = await fetch(url, { next: { revalidate: 30 } });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Sheet GET] Error:', err);
      return NextResponse.json({ leads: getMockLeads(), source: 'mock', error: err }, { headers: CORS });
    }

    const data    = await res.json();
    const rows    = data.values || [];
    if (rows.length < 2) return NextResponse.json({ leads: [], source: 'sheet' }, { headers: CORS });

    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
    const leads   = rows.slice(1).map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => { obj[h] = (row[j] || '').trim(); });
      return {
        _row:           obj._row,
        name:           obj.name || obj.tr || obj.lead_name || '',
        email:          obj.email || '',
        phone:          obj[''] || obj.phone || obj['#'] || '',
        company:        obj.company || '',
        service:        (obj.service_interest || obj.service || '').toLowerCase(),
        message:        obj.message || obj.pain_point || '',
        status:         obj.status || 'New',
        progress:       obj.progress || '',
        notes:          obj.notes || '',
        ref:            obj.reference_number || obj.ref || '',
        created:        obj.timestamp || obj.date_added || obj.created || '',
        projectStarted: obj.project_started || obj.started || 'No',
        startDate:      obj.start_date || obj.project_start || '',
        endDate:        obj.end_date || obj.project_end || obj.target_end_date || '',
        deliverables:   obj.deliverables || '',
        invoiceStatus:  obj.invoice_status || 'Not Sent',
        invoiceAmount:  obj.invoice_amount || obj.amount || '',
        meetingStatus:  obj.meeting_status || '',
        meetingDate:    obj.meeting_date || '',
        meetingTime:    obj.meeting_time || '',
      };
    }).filter(l => l.name);

    return NextResponse.json({ leads, source: 'sheet' }, { headers: CORS });

  } catch (e) {
    console.error('[Sheet GET] Exception:', e.message);
    return NextResponse.json({ leads: getMockLeads(), source: 'mock' }, { headers: CORS });
  }
}

// ── PUT — save a lead edit back to the sheet via Make webhook ─────────────────
export async function PUT(request) {
  try {
    const body = await request.json();

    // Validate — must have a row number to know which row to update
    if (!body._row || body._row < 2) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid _row number' },
        { status: 400, headers: CORS }
      );
    }

    // Forward to Make webhook — Make will update the Google Sheet row
    const payload = {
      _row:           body._row,
      name:           body.name           || '',
      email:          body.email          || '',
      phone:          body.phone          || '',
      company:        body.company        || '',
      service:        body.service        || '',
      message:        body.message        || '',
      status:         body.status         || 'New',
      progress:       body.progress       || '',
      notes:          body.notes          || '',
      projectStarted: body.projectStarted || 'No',
      startDate:      body.startDate      || '',
      endDate:        body.endDate        || '',
      deliverables:   body.deliverables   || '',
      invoiceStatus:  body.invoiceStatus  || 'Not Sent',
      invoiceAmount:  body.invoiceAmount  || '',
      meetingStatus:  body.meetingStatus  || '',
      meetingDate:    body.meetingDate    || '',
      meetingTime:    body.meetingTime    || '',
      _source:        'dashboard',
      _timestamp:     new Date().toISOString(),
    };

    const makeRes = await fetch(MAKE_CRM_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!makeRes.ok) {
      const errText = await makeRes.text();
      console.error('[Sheet PUT] Make webhook error:', errText);
      return NextResponse.json(
        { success: false, error: 'Make webhook failed', detail: errText },
        { status: 502, headers: CORS }
      );
    }

    return NextResponse.json({ success: true, row: body._row }, { headers: CORS });

  } catch (e) {
    console.error('[Sheet PUT] Exception:', e.message);
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500, headers: CORS }
    );
  }
}

// ── Mock data (dev fallback) ──────────────────────────────────────────────────
function getMockLeads() {
  return [
    { _row:2, name:'Daryl',   email:'sanelesishange@outlook.com', phone:'',           company:'',                   service:'automate', message:'',                                                     status:'New',         progress:'10',  notes:'',                                               ref:'INK-GEN-2026-1001', created:'2026-03-25', projectStarted:'No',  startDate:'',         endDate:'',           deliverables:'',                                              invoiceStatus:'Not Sent', invoiceAmount:'',    meetingStatus:'', meetingDate:'', meetingTime:'' },
    { _row:3, name:'Pisces',  email:'sanelesishange@outlook.com', phone:'27658804122', company:'',                   service:'learn',    message:'Low AI literacy among staff',                          status:'Contacted',   progress:'35',  notes:'',                                               ref:'INK-GEN-2026-9539', created:'2026-03-26', projectStarted:'No',  startDate:'',         endDate:'',           deliverables:'',                                              invoiceStatus:'Not Sent', invoiceAmount:'',    meetingStatus:'', meetingDate:'', meetingTime:'' },
    { _row:4, name:'Garry',   email:'sanelesishange@outlook.com', phone:'27658804122', company:'',                   service:'automate', message:'Getting leads and spending money on ads with no ROI',  status:'Contacted',   progress:'35',  notes:'Interested in WhatsApp automation',              ref:'INK-GEN-2026-2233', created:'2026-03-27', projectStarted:'No',  startDate:'',         endDate:'',           deliverables:'',                                              invoiceStatus:'Sent',     invoiceAmount:'8500',meetingStatus:'', meetingDate:'', meetingTime:'' },
    { _row:5, name:'James',   email:'sanelesishange@outlook.com', phone:'658804122',   company:'Shandu Attorneys',   service:'learn',    message:'Staff cannot use AI tools effectively',                status:'Contacted',   progress:'35',  notes:'',                                               ref:'INK-GEN-2026-3344', created:'2026-03-28', projectStarted:'No',  startDate:'',         endDate:'',           deliverables:'',                                              invoiceStatus:'Not Sent', invoiceAmount:'',    meetingStatus:'Booked', meetingDate:'2026-04-10', meetingTime:'10:00' },
    { _row:6, name:'Lenovo',  email:'sanelesishange@outlook.com', phone:'27658804122', company:'Ocean Hardware',      service:'automate', message:'No documented SOPs for repair operations',             status:'In Progress', progress:'65',  notes:'Client approved proposal',                       ref:'INK-GEN-2026-8994', created:'2026-03-30', projectStarted:'Yes', startDate:'2026-04-01', endDate:'2026-04-30', deliverables:'WhatsApp AI agent + Google Sheets CRM',         invoiceStatus:'Sent',     invoiceAmount:'22000',meetingStatus:'Meeting Held', meetingDate:'2026-04-02', meetingTime:'14:00' },
    { _row:7, name:'Jeffery', email:'sanelesishange@outlook.com', phone:'27658804122', company:'',                   service:'learn',    message:'Administration and lead generation is manual',         status:'New',         progress:'10',  notes:'',                                               ref:'INK-GEN-2026-4567', created:'2026-03-31', projectStarted:'No',  startDate:'',         endDate:'',           deliverables:'',                                              invoiceStatus:'Not Sent', invoiceAmount:'',    meetingStatus:'', meetingDate:'', meetingTime:'' },
    { _row:8, name:'Thabo',   email:'sishangesanele@gmail.com',   phone:'27658804122', company:'Shandu Civils',      service:'automate', message:'Manual invoicing and admin paperwork',                 status:'Won',         progress:'100', notes:'Contract signed — delivered successfully',       ref:'INK-CON-2026-4827', created:'2026-03-30', projectStarted:'Yes', startDate:'2026-03-15', endDate:'2026-03-30', deliverables:'WhatsApp AI bot + Make.com + CRM',              invoiceStatus:'Paid',     invoiceAmount:'18500',meetingStatus:'Meeting Held', meetingDate:'2026-03-18', meetingTime:'09:00' },
  ];
}
