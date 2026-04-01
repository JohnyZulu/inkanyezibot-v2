// app/api/sheet/route.js  v2
// Reads Inkanyezi Leads CRM Google Sheet — includes project tracking fields
// Env vars: GOOGLE_SHEETS_API_KEY, GOOGLE_SHEET_ID

import { NextResponse } from 'next/server';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SHEET_ID  = process.env.GOOGLE_SHEET_ID  || '1HbPcOop63ENb6Lcv0NVDhATP8RWmFwk4Vgqf6gE4Upk';
const API_KEY   = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_TAB = 'Table1';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

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
      console.error('[Sheet] Fetch error:', err);
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
        // Project fields — read from sheet if columns exist, else default
        projectStarted: obj.project_started || obj.started || 'No',
        startDate:      obj.start_date || obj.project_start || '',
        endDate:        obj.end_date || obj.project_end || obj.target_end_date || '',
        deliverables:   obj.deliverables || '',
        invoiceStatus:  obj.invoice_status || 'Not Sent',
        invoiceAmount:  obj.invoice_amount || obj.amount || '',
      };
    }).filter(l => l.name);

    return NextResponse.json({ leads, source: 'sheet' }, { headers: CORS });

  } catch (e) {
    console.error('[Sheet] Error:', e.message);
    return NextResponse.json({ leads: getMockLeads(), source: 'mock' }, { headers: CORS });
  }
}

function getMockLeads() {
  return [
    {
      _row:2, name:'Daryl', email:'sanelesishange@outlook.com', phone:'', company:'',
      service:'automate', message:'', status:'New', progress:'10', notes:'',
      ref:'INK-GEN-2026-1001', created:'2026-03-25',
      projectStarted:'No', startDate:'', endDate:'', deliverables:'', invoiceStatus:'Not Sent', invoiceAmount:'',
    },
    {
      _row:3, name:'Pisces', email:'sanelesishange@outlook.com', phone:'27658804122', company:'',
      service:'learn', message:'Low AI literacy among staff', status:'Contacted', progress:'35', notes:'',
      ref:'INK-GEN-2026-9539', created:'2026-03-26',
      projectStarted:'No', startDate:'', endDate:'', deliverables:'', invoiceStatus:'Not Sent', invoiceAmount:'',
    },
    {
      _row:4, name:'Garry', email:'sanelesishange@outlook.com', phone:'27658804122', company:'',
      service:'automate', message:'Getting leads and spending money on ads with no ROI', status:'Contacted', progress:'35', notes:'Interested in WhatsApp automation',
      ref:'INK-GEN-2026-2233', created:'2026-03-27',
      projectStarted:'No', startDate:'', endDate:'', deliverables:'', invoiceStatus:'Sent', invoiceAmount:'8500',
    },
    {
      _row:5, name:'James', email:'sanelesishange@outlook.com', phone:'658804122', company:'Shandu Attorneys',
      service:'learn', message:'Staff cannot use AI tools effectively', status:'Contacted', progress:'35', notes:'',
      ref:'INK-GEN-2026-3344', created:'2026-03-28',
      projectStarted:'No', startDate:'', endDate:'', deliverables:'', invoiceStatus:'Not Sent', invoiceAmount:'',
    },
    {
      _row:6, name:'Lenovo', email:'sanelesishange@outlook.com', phone:'27658804122', company:'Ocean Hardware Repairs',
      service:'automate', message:'No documented knowledge base or consistent SOPs for repair operations', status:'In Progress', progress:'65', notes:'Client approved proposal — building WhatsApp bot + CRM',
      ref:'INK-GEN-2026-8994', created:'2026-03-30',
      projectStarted:'Yes', startDate:'2026-04-01', endDate:'2026-04-30', deliverables:'WhatsApp AI agent + Google Sheets CRM + staff training', invoiceStatus:'Sent', invoiceAmount:'22000',
    },
    {
      _row:7, name:'Jeffery', email:'sanelesishange@outlook.com', phone:'27658804122', company:'',
      service:'learn', message:'Administration and lead generation is manual and slow', status:'New', progress:'10', notes:'',
      ref:'INK-GEN-2026-4567', created:'2026-03-31',
      projectStarted:'No', startDate:'', endDate:'', deliverables:'', invoiceStatus:'Not Sent', invoiceAmount:'',
    },
    {
      _row:8, name:'Thabo', email:'sishangesanele@gmail.com', phone:'27658804122', company:'Shandu Civils',
      service:'automate', message:'Manual invoicing and admin paperwork consuming team hours', status:'Won', progress:'100', notes:'Contract signed — project delivered successfully',
      ref:'INK-CON-2026-4827', created:'2026-03-30',
      projectStarted:'Yes', startDate:'2026-03-15', endDate:'2026-03-30', deliverables:'WhatsApp AI bot + Make.com automation + Google Sheets CRM', invoiceStatus:'Paid', invoiceAmount:'18500',
    },
  ];
}
