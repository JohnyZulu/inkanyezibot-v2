'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
type Lead = {
  _row: number; name: string; email: string; phone: string;
  company: string; service: string; message: string; status: string;
  progress: string; notes: string; ref: string; created: string;
  // Project fields
  projectStarted: string; startDate: string; endDate: string;
  deliverables: string; invoiceStatus: string; invoiceAmount: string;
};

type View = 'overview' | 'leads' | 'kanban' | 'projects' | 'revenue';

// ── Constants ──────────────────────────────────────────────────────────────
const STATUSES     = ['New','Contacted','In Progress','Won','Lost'];
const INV_STATUSES = ['Not Sent','Sent','Paid','Overdue'];
const STATUS_PCT   : Record<string,number> = { New:10, Contacted:35, 'In Progress':65, Won:100, Lost:0 };
const STATUS_CLR   : Record<string,string> = { New:'#378add', Contacted:'#ef9f27', 'In Progress':'#d4537e', Won:'#3d9e6e', Lost:'#6b7280' };
const INV_CLR      : Record<string,string> = { 'Not Sent':'#6b7280', Sent:'#378add', Paid:'#3d9e6e', Overdue:'#e24b4a' };
const SVC_CLR      : Record<string,string> = { automate:'#378add', learn:'#3d9e6e', grow:'#ef9f27', multiple:'#9b6fc8' };
const SVC_LABEL    : Record<string,string> = { automate:'Automate', learn:'Learn', grow:'Grow', multiple:'Multiple' };

const C_GOLD = '#F4B942'; // used in theme before C is defined

// ── Helpers ─────────────────────────────────────────────────────────────────
const ini = (n:string) => { const p=n.trim().split(' '); return (p.length>1?p[0][0]+p[1][0]:n.substring(0,2)).toUpperCase(); };
const sc  = (s:string) => SVC_CLR[s?.toLowerCase()]||'#888';
const stc = (s:string) => STATUS_CLR[s]||'#888';
const ivc = (s:string) => INV_CLR[s]||'#888';
const pct = (s:string) => STATUS_PCT[s]??10;
const fmt = (n:number) => `R${n.toLocaleString('en-ZA')}`;
const blank = ():Lead => ({
  _row:Date.now(), name:'', email:'', phone:'', company:'',
  service:'automate', message:'', status:'New', progress:'10',
  notes:'', ref:`INK-MAN-${new Date().getFullYear()}-${Math.floor(1000+Math.random()*9000)}`,
  created:new Date().toISOString().split('T')[0],
  projectStarted:'No', startDate:'', endDate:'', deliverables:'', invoiceStatus:'Not Sent', invoiceAmount:'',
});

// ── Stars ──────────────────────────────────────────────────────────────────
const STARS = Array.from({length:70},(_,i)=>({
  x:(i*137.508)%100, y:(i*73.137)%100,
  r:i%5===0?2:i%3===0?1.5:1,
  o:0.1+((i*47)%10)*0.025,
  d:2+((i*31)%40)*0.1,
}));

// ── Reusable UI ────────────────────────────────────────────────────────────
const Badge = ({label,color}:{label:string,color:string}) => (
  <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,background:`${color}22`,color,whiteSpace:'nowrap'}}>{label}</span>
);

const ProgressBar = ({value,color,height=5}:{value:number,color:string,height?:number}) => (
  <div style={{height,background:'rgba(255,255,255,0.06)',borderRadius:height,overflow:'hidden'}}>
    <div style={{height:'100%',width:`${Math.min(100,Math.max(0,value))}%`,background:color,borderRadius:height,transition:'width 0.6s ease'}}/>
  </div>
);

const Stat = ({label,value,sub,accent}:{label:string,value:string|number,sub:string,accent:string}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px 20px',borderTop:`3px solid ${accent}`}}>
    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>{label}</div>
    <div style={{fontSize:28,fontWeight:700,color:C.text,fontFamily:"'Playfair Display',Georgia,serif"}}>{value}</div>
    <div style={{fontSize:11,color:accent,marginTop:4}}>{sub}</div>
  </div>
);

const Inp = ({value,onChange,placeholder,type='text',style={}}:{value:string,onChange:(v:string)=>void,placeholder?:string,type?:string,style?:React.CSSProperties}) => (
  <input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}
    style={{width:'100%',background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',...style}}/>
);

const Sel = ({value,onChange,options,style={}}:{value:string,onChange:(v:string)=>void,options:{v:string,l:string}[],style?:React.CSSProperties}) => (
  <select value={value} onChange={e=>onChange(e.target.value)}
    style={{width:'100%',background:C.selBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',...style}}>
    {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);

// ── Main ───────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [leads,   setLeads]   = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<View>('overview');
  const [filter,  setFilter]  = useState({service:'',status:'',q:''});
  const [modal,   setModal]   = useState<Lead|null>(null);
  const [editForm,setEditForm]= useState<Lead|null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newLead, setNewLead] = useState<Lead>(blank());
  const [source,  setSource]  = useState('');
  const [dark,     setDark]    = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Dynamic theme based on dark/light mode ────────────────────────────────
  const C = dark ? {
    bg:'#060e1d', card:'#0d1e35', card2:'#0a1828',
    border:'rgba(244,185,66,0.12)', borderHover:'rgba(244,185,66,0.3)',
    gold:'#F4B942', orange:'#FF6B35', text:'#e8eaf0',
    muted:'rgba(232,234,240,0.5)', dimmed:'rgba(232,234,240,0.25)',
    sidebar:'rgba(6,14,29,0.97)', headerBg:'#0a1628',
    inputBg:'rgba(255,255,255,0.04)', tableBg:'#0d1e35',
    selBg:'#0d1e35', statBorder:C_GOLD,
  } : {
    bg:'#f0f2f7', card:'#ffffff', card2:'#f8f9fc',
    border:'rgba(10,22,40,0.12)', borderHover:'rgba(244,185,66,0.5)',
    gold:'#c9941a', orange:'#e55a1c', text:'#0A1628',
    muted:'rgba(10,22,40,0.5)', dimmed:'rgba(10,22,40,0.3)',
    sidebar:'rgba(10,22,40,0.97)', headerBg:'#ffffff',
    inputBg:'rgba(10,22,40,0.04)', tableBg:'#ffffff',
    selBg:'#ffffff', statBorder:C_GOLD,
  };

  const load = useCallback(async()=>{
    setLoading(true);
    try {
      const r = await fetch('/api/sheet');
      const d = await r.json();
      setLeads(d.leads||[]);
      setSource(d.source||'');
    } catch { setLeads([]); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  // ── Computed ─────────────────────────────────────────────────────────────
  const total      = leads.length;
  const won        = leads.filter(l=>l.status==='Won').length;
  const active     = leads.filter(l=>!['Won','Lost'].includes(l.status)).length;
  const conversion = total?Math.round(won/total*100):0;
  const projects   = leads.filter(l=>['In Progress','Won'].includes(l.status));
  const totalInv   = leads.reduce((s,l)=>s+(parseFloat(l.invoiceAmount)||0),0);
  const paidInv    = leads.filter(l=>l.invoiceStatus==='Paid').reduce((s,l)=>s+(parseFloat(l.invoiceAmount)||0),0);
  const overdueInv = leads.filter(l=>l.invoiceStatus==='Overdue').reduce((s,l)=>s+(parseFloat(l.invoiceAmount)||0),0);
  const svcCounts  = leads.reduce((a,l)=>{const s=l.service||'other';a[s]=(a[s]||0)+1;return a;},{} as Record<string,number>);
  const stCounts   = leads.reduce((a,l)=>{a[l.status]=(a[l.status]||0)+1;return a;},{} as Record<string,number>);

  const filtered = leads.filter(l=>{
    if(filter.service && l.service!==filter.service) return false;
    if(filter.status  && l.status!==filter.status)   return false;
    if(filter.q){const q=filter.q.toLowerCase();if(![l.name,l.company,l.message,l.email].join(' ').toLowerCase().includes(q))return false;}
    return true;
  });
  const byStatus = STATUSES.reduce((a,s)=>{a[s]=filtered.filter(l=>l.status===s);return a;},{} as Record<string,Lead[]>);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const cycleStatus = (lead:Lead, e?:React.MouseEvent) => {
    e?.stopPropagation();
    const idx=STATUSES.indexOf(lead.status);
    const next=STATUSES[(idx+1)%STATUSES.length];
    setLeads(prev=>prev.map(l=>l._row===lead._row?{...l,status:next,progress:String(STATUS_PCT[next]??10)}:l));
  };

  const saveEdit = () => {
    if(!editForm) return;
    setLeads(prev=>prev.map(l=>l._row===editForm._row?{...editForm}:l));
    if(modal) setModal(editForm);
    setEditForm(null);
  };

  const saveNew = () => {
    if(!newLead.name.trim()) return;
    setLeads(prev=>[...prev,{...newLead,_row:Date.now()}]);
    setAddOpen(false);
    setNewLead(blank());
  };

  const deleteLead = (lead:Lead) => {
    setLeads(prev=>prev.filter(l=>l._row!==lead._row));
    setModal(null);
    setEditForm(null);
  };

  // ── Nav ───────────────────────────────────────────────────────────────────
  const NAV:{id:View,icon:string,label:string}[] = [
    {id:'overview', icon:'◈', label:'Overview'},
    {id:'leads',    icon:'◉', label:'All Leads'},
    {id:'kanban',   icon:'▦', label:'Kanban'},
    {id:'projects', icon:'◐', label:'Projects'},
    {id:'revenue',  icon:'◆', label:'Revenue'},
  ];

  const navTo = (v:View) => { setView(v); scrollRef.current?.scrollTo(0,0); };

  // ── Field editor helper ───────────────────────────────────────────────────
  const ef = editForm || newLead;
  const setEf = (f:Partial<Lead>) => editForm ? setEditForm({...editForm,...f}) : setNewLead({...newLead,...f});

  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:C.text,display:'flex',overflow:'hidden',height:'100vh'}}>

      {/* Stars */}
      <svg style={{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0}} aria-hidden>
        {STARS.map((s,i)=>(
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" opacity={s.o}>
            <animate attributeName="opacity" values={`${s.o};${Math.min(0.6,s.o*3)};${s.o}`} dur={`${s.d}s`} repeatCount="indefinite"/>
          </circle>
        ))}
      </svg>

      {/* ── SIDEBAR ────────────────────────────────────────────────────────── */}
      <aside style={{width:220,flexShrink:0,background:C.sidebar,borderRight:`1px solid ${C.border}`,zIndex:100,display:'flex',flexDirection:'column',height:'100vh',position:'relative'}}>

        {/* Brand */}
        <div style={{padding:'24px 20px 20px',borderBottom:`1px solid ${C.border}`}}>
          <div style={{fontSize:10,letterSpacing:'0.25em',color:C.gold,fontWeight:700,marginBottom:6}}>INKANYEZI</div>
          <div style={{fontSize:17,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:'#fff',lineHeight:1.2}}>CRM &amp; Project<br/>Dashboard</div>
          <div style={{fontSize:10,color:C.muted,marginTop:8,display:'flex',alignItems:'center',gap:6}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:source==='sheet'?'#3d9e6e':C.orange,display:'inline-block',flexShrink:0}}/>
            {source==='sheet'?'Live · Google Sheets':'Demo data · Add API key'}
          </div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:'16px 12px',overflowY:'auto'}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>navTo(n.id)} style={{
              width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
              borderRadius:8,border:'none',cursor:'pointer',fontSize:13,textAlign:'left',
              marginBottom:4,transition:'all 0.15s',fontFamily:'inherit',
              background:view===n.id?'rgba(244,185,66,0.1)':'transparent',
              color:view===n.id?C.gold:C.muted,
              borderLeft:view===n.id?`2px solid ${C.gold}`:'2px solid transparent',
            }}>
              <span style={{fontSize:15,width:20,textAlign:'center'}}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>

        {/* Mini stats */}
        <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`}}>
          {[{l:'Total',v:total},{l:'Active',v:active},{l:'Won',v:won},{l:'Revenue',v:fmt(paidInv)}].map(s=>(
            <div key={s.l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:11}}>
              <span style={{color:C.muted}}>{s.l}</span>
              <span style={{color:C.gold,fontWeight:700}}>{s.v}</span>
            </div>
          ))}
        </div>

        {/* New lead button */}
        <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`}}>
          <button onClick={()=>setAddOpen(true)} style={{
            width:'100%',background:`linear-gradient(135deg,${C.gold},${C.orange})`,border:'none',
            color:'#0A1628',padding:'10px',borderRadius:8,cursor:'pointer',fontSize:13,
            fontWeight:700,fontFamily:'inherit',letterSpacing:'0.02em',
          }}>+ New Lead</button>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <main ref={scrollRef} style={{flex:1,overflowY:'auto',position:'relative',zIndex:1}}>
        <div style={{padding:'28px 32px',maxWidth:1200}}>

          {/* Top bar */}
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{fontSize:22,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,color:'#fff',margin:0}}>
                {NAV.find(n=>n.id===view)?.label}
              </h1>
              <p style={{fontSize:12,color:C.muted,margin:'5px 0 0'}}>{new Date().toLocaleDateString('en-ZA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {/* Light/Dark toggle */}
              <button onClick={()=>setDark(d=>!d)} title={dark?'Switch to light mode':'Switch to dark mode'} style={{
                background:dark?'rgba(244,185,66,0.1)':'rgba(10,22,40,0.08)',
                border:`1px solid ${C.border}`,
                color:dark?C.gold:C.text,
                padding:'7px 14px',borderRadius:8,cursor:'pointer',
                fontSize:13,fontFamily:'inherit',
                display:'flex',alignItems:'center',gap:6,
                transition:'all 0.2s',
              }}>
                <span style={{fontSize:14}}>{dark?'☀':'🌙'}</span>
                <span style={{fontSize:11}}>{dark?'Light':'Dark'}</span>
              </button>
              <button onClick={load} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'7px 16px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>↻ Refresh</button>
            </div>
          </div>

          {loading ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:C.muted}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:40,marginBottom:12,display:'inline-block',animation:'spin 2s linear infinite'}}>✦</div>
                <div style={{fontSize:14}}>Loading data...</div>
              </div>
            </div>
          ) : (

            <>
            {/* ════════════════════════════════════════════
                OVERVIEW
            ════════════════════════════════════════════ */}
            {view==='overview' && (
              <div style={{display:'flex',flexDirection:'column',gap:20}}>

                {/* KPIs */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
                  {[
                    {label:'Total Leads',  value:total,        sub:'all time',                           accent:C.gold,    nav:'leads'    },
                    {label:'Active',       value:active,       sub:'in pipeline',                        accent:'#378add', nav:'kanban'   },
                    {label:'Won',          value:won,          sub:`${conversion}% conversion`,          accent:'#3d9e6e', nav:'projects' },
                    {label:'Revenue Paid', value:fmt(paidInv), sub:`R${totalInv.toLocaleString()} pipeline`, accent:C.orange,  nav:'revenue'  },
                  ].map(k=>(
                    <button key={k.label} onClick={()=>navTo(k.nav as View)} style={{
                      all:'unset',cursor:'pointer',display:'block',width:'100%',
                      background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                      padding:'18px 20px',borderTop:`3px solid ${k.accent}`,
                      transition:'border-color 0.2s, transform 0.15s',
                      textAlign:'left',
                    }}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=k.accent;(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=C.border;(e.currentTarget as HTMLElement).style.transform='translateY(0)';}}
                    >
                      <div style={{fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        {k.label}<span style={{fontSize:9,color:k.accent,opacity:0.7}}>→</span>
                      </div>
                      <div style={{fontSize:28,fontWeight:700,color:C.text,fontFamily:"'Playfair Display',Georgia,serif"}}>{k.value}</div>
                      <div style={{fontSize:11,color:k.accent,marginTop:4}}>{k.sub}</div>
                    </button>
                  ))}
                </div>

                {/* Charts row */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>

                  {/* Service breakdown */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'22px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:18}}>Service Breakdown</div>
                    {Object.entries(svcCounts).map(([s,n])=>{
                      const p=total?Math.round(n/total*100):0;
                      return <div key={s} style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:6}}>
                          <span style={{color:sc(s),fontWeight:600}}>{SVC_LABEL[s]||s}</span>
                          <span style={{color:C.muted}}>{n} · {p}%</span>
                        </div>
                        <ProgressBar value={p} color={sc(s)}/>
                      </div>;
                    })}
                  </div>

                  {/* Pipeline funnel */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'22px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:18}}>Pipeline Funnel</div>
                    {STATUSES.map(s=>{
                      const n=stCounts[s]||0;
                      const p=total?Math.round(n/total*100):0;
                      return <div key={s} style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:6}}>
                          <span style={{color:stc(s),fontWeight:600}}>{s}</span>
                          <span style={{color:C.muted}}>{n}</span>
                        </div>
                        <ProgressBar value={p} color={stc(s)}/>
                      </div>;
                    })}
                  </div>
                </div>

                {/* Project snapshot + recent leads */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>

                  {/* Project snapshot */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'22px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:18}}>Active Projects</div>
                    {projects.length===0 ? <div style={{fontSize:13,color:C.dimmed}}>No active projects yet</div> :
                      projects.map(l=>(
                        <div key={l._row} onClick={()=>{navTo('projects');setModal(l);}} style={{marginBottom:14,cursor:'pointer'}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5,fontSize:13}}>
                            <span style={{fontWeight:600,color:'#fff'}}>{l.name}{l.company?` · ${l.company}`:''}</span>
                            <Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/>
                          </div>
                          <ProgressBar value={pct(l.status)} color={stc(l.status)}/>
                          <div style={{fontSize:10,color:C.muted,marginTop:4}}>{pct(l.status)}% · {l.status}</div>
                        </div>
                      ))
                    }
                  </div>

                  {/* Recent leads */}
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'22px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:18}}>Recent Leads</div>
                    {leads.slice(-5).reverse().map(l=>(
                      <div key={l._row} onClick={()=>setModal(l)} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderBottom:`1px solid rgba(255,255,255,0.04)`,cursor:'pointer'}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:C.gold,flexShrink:0}}>{ini(l.name)}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.name}{l.company?` · ${l.company}`:''}</div>
                          <div style={{fontSize:11,color:C.muted}}><Badge label={l.service?SVC_LABEL[l.service]||l.service:'—'} color={sc(l.service)}/></div>
                        </div>
                        <Badge label={l.status} color={stc(l.status)}/>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════
                ALL LEADS
            ════════════════════════════════════════════ */}
            {view==='leads' && (
              <div>
                {/* Filters */}
                <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
                  <input value={filter.q} onChange={e=>setFilter(f=>({...f,q:e.target.value}))} placeholder="Search name, company, pain point..."
                    style={{flex:1,minWidth:200,background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit'}}/>
                  <Sel value={filter.service} onChange={v=>setFilter(f=>({...f,service:v}))} style={{width:150}}
                    options={[{v:'',l:'All Services'},{v:'automate',l:'Automate'},{v:'learn',l:'Learn'},{v:'grow',l:'Grow'}]}/>
                  <Sel value={filter.status} onChange={v=>setFilter(f=>({...f,status:v}))} style={{width:150}}
                    options={[{v:'',l:'All Statuses'},...STATUSES.map(s=>({v:s,l:s}))]}/>
                </div>

                <div style={{background:C.tableBg,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:750}}>
                      <thead>
                        <tr style={{borderBottom:`1px solid ${C.border}`}}>
                          {['Lead','Service','Pain Point','Status','Progress','Invoice','Ref'].map(h=>(
                            <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length===0 ? (
                          <tr><td colSpan={7} style={{padding:40,textAlign:'center',color:C.muted,fontSize:13}}>No leads match the current filters</td></tr>
                        ) : filtered.map(l=>(
                          <tr key={l._row} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`,cursor:'pointer',transition:'background 0.15s'}}
                            onClick={()=>setModal(l)}
                            onMouseEnter={e=>(e.currentTarget.style.background='rgba(244,185,66,0.04)')}
                            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                            <td style={{padding:'12px 16px'}}>
                              <div style={{display:'flex',alignItems:'center',gap:10}}>
                                <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:C.gold,flexShrink:0}}>{ini(l.name)}</div>
                                <div>
                                  <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{l.name}</div>
                                  {l.company && <div style={{fontSize:11,color:C.muted}}>{l.company}</div>}
                                </div>
                              </div>
                            </td>
                            <td style={{padding:'12px 16px'}}><Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/></td>
                            <td style={{padding:'12px 16px',fontSize:12,color:C.muted,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.message||'—'}</td>
                            <td style={{padding:'12px 16px'}}>
                              <button onClick={e=>cycleStatus(l,e)} style={{fontSize:11,fontWeight:700,padding:'4px 12px',borderRadius:20,background:`${stc(l.status)}22`,color:stc(l.status),border:`1px solid ${stc(l.status)}44`,cursor:'pointer',fontFamily:'inherit'}}>
                                {l.status}
                              </button>
                            </td>
                            <td style={{padding:'12px 16px',minWidth:100}}>
                              <ProgressBar value={pct(l.status)} color={stc(l.status)}/>
                              <div style={{fontSize:10,color:C.muted,marginTop:3}}>{pct(l.status)}%</div>
                            </td>
                            <td style={{padding:'12px 16px'}}><Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/></td>
                            <td style={{padding:'12px 16px',fontSize:11,color:C.muted,fontFamily:'monospace'}}>{l.ref||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════
                KANBAN
            ════════════════════════════════════════════ */}
            {view==='kanban' && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,alignItems:'start'}}>
                {STATUSES.map(s=>(
                  <div key={s}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,padding:'0 4px'}}>
                      <span style={{fontSize:10,fontWeight:700,color:stc(s),letterSpacing:'0.1em',textTransform:'uppercase'}}>{s}</span>
                      <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:`${stc(s)}22`,color:stc(s)}}>{byStatus[s].length}</span>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {byStatus[s].map(l=>(
                        <div key={l._row} onClick={()=>setModal(l)} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${stc(s)}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',transition:'border-color 0.15s'}}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor=stc(s))}
                          onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                          <div style={{fontSize:13,fontWeight:600,color:'#fff',marginBottom:3}}>{l.name}</div>
                          {l.company && <div style={{fontSize:11,color:C.muted,marginBottom:6}}>{l.company}</div>}
                          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:l.message?8:0}}>
                            <Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/>
                            {l.invoiceStatus && l.invoiceStatus!=='Not Sent' && <Badge label={l.invoiceStatus} color={ivc(l.invoiceStatus)}/>}
                          </div>
                          {l.message && <div style={{fontSize:11,color:C.muted,lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{l.message}</div>}
                        </div>
                      ))}
                      {byStatus[s].length===0 && (
                        <div style={{background:'rgba(255,255,255,0.02)',border:`1px dashed rgba(255,255,255,0.07)`,borderRadius:10,padding:16,textAlign:'center',fontSize:11,color:'rgba(255,255,255,0.15)'}}>Empty</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ════════════════════════════════════════════
                PROJECTS
            ════════════════════════════════════════════ */}
            {view==='projects' && (
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {/* Project KPIs */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
                  <Stat label="Total Projects" value={projects.length}                                         sub="active + won"      accent={C.gold}/>
                  <Stat label="In Progress"    value={leads.filter(l=>l.status==='In Progress').length}        sub="currently active"  accent="#d4537e"/>
                  <Stat label="Completed"      value={won}                                                     sub="delivered"         accent="#3d9e6e"/>
                  <Stat label="Started"        value={projects.filter(l=>l.projectStarted==='Yes').length}     sub="project kickoff"   accent="#378add"/>
                </div>

                {projects.length===0 ? (
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:40,textAlign:'center',color:C.muted,fontSize:13}}>
                    No projects yet — leads become projects when moved to <strong style={{color:C.gold}}>In Progress</strong> or <strong style={{color:'#3d9e6e'}}>Won</strong>
                  </div>
                ) : projects.map(l=>{
                  const progressVal = parseFloat(l.progress)||pct(l.status);
                  const hasTimeline = l.startDate && l.endDate;
                  const daysLeft = hasTimeline ? Math.ceil((new Date(l.endDate).getTime()-Date.now())/86400000) : null;
                  return (
                    <div key={l._row} onClick={()=>setModal(l)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'22px',cursor:'pointer',transition:'border-color 0.2s'}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor=C.borderHover)}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>

                      {/* Header */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
                        <div style={{display:'flex',alignItems:'center',gap:14}}>
                          <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:C.gold,flexShrink:0}}>{ini(l.name)}</div>
                          <div>
                            <div style={{fontSize:15,fontWeight:700,color:'#fff'}}>{l.name}{l.company?` · ${l.company}`:''}</div>
                            <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap',alignItems:'center'}}>
                              <Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/>
                              <Badge label={l.status} color={stc(l.status)}/>
                              <Badge label={l.projectStarted==='Yes'?'Started':'Not Started'} color={l.projectStarted==='Yes'?'#3d9e6e':'#6b7280'}/>
                            </div>
                          </div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/>
                          {l.invoiceAmount && <div style={{fontSize:12,color:C.gold,fontWeight:700,marginTop:4}}>{fmt(parseFloat(l.invoiceAmount))}</div>}
                        </div>
                      </div>

                      {/* Progress */}
                      <div style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6}}>
                          <span style={{color:C.muted}}>Project Progress</span>
                          <span style={{color:stc(l.status),fontWeight:700}}>{progressVal}%</span>
                        </div>
                        <ProgressBar value={progressVal} color={stc(l.status)} height={8}/>
                      </div>

                      {/* Timeline + deliverables */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                        <div>
                          <div style={{fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>Timeline</div>
                          {hasTimeline ? (
                            <div style={{fontSize:12}}>
                              <div style={{color:C.text}}>{l.startDate} → {l.endDate}</div>
                              {daysLeft!==null && (
                                <div style={{color:daysLeft<0?'#e24b4a':daysLeft<7?C.orange:'#3d9e6e',marginTop:3,fontWeight:600}}>
                                  {daysLeft<0?`${Math.abs(daysLeft)}d overdue`:daysLeft===0?'Due today':`${daysLeft}d remaining`}
                                </div>
                              )}
                            </div>
                          ) : <div style={{fontSize:12,color:C.dimmed}}>No dates set</div>}
                        </div>
                        <div>
                          <div style={{fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>Deliverables</div>
                          <div style={{fontSize:12,color:l.deliverables?C.text:C.dimmed,lineHeight:1.5}}>{l.deliverables||'Not specified'}</div>
                        </div>
                      </div>

                      {l.ref && <div style={{marginTop:12,fontSize:10,color:C.dimmed,fontFamily:'monospace'}}>{l.ref}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ════════════════════════════════════════════
                REVENUE
            ════════════════════════════════════════════ */}
            {view==='revenue' && (
              <div style={{display:'flex',flexDirection:'column',gap:14}}>

                {/* Revenue KPIs */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
                  <Stat label="Total Pipeline"  value={fmt(totalInv)}   sub="all invoices"    accent={C.gold}/>
                  <Stat label="Paid"            value={fmt(paidInv)}    sub="collected"       accent="#3d9e6e"/>
                  <Stat label="Pending"         value={fmt(leads.filter(l=>l.invoiceStatus==='Sent').reduce((s,l)=>s+(parseFloat(l.invoiceAmount)||0),0))} sub="awaiting payment" accent="#378add"/>
                  <Stat label="Overdue"         value={fmt(overdueInv)} sub="needs follow-up" accent="#e24b4a"/>
                </div>

                {/* Invoice status breakdown */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'22px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:18}}>By Invoice Status</div>
                    {INV_STATUSES.map(s=>{
                      const amt = leads.filter(l=>(l.invoiceStatus||'Not Sent')===s).reduce((sum,l)=>sum+(parseFloat(l.invoiceAmount)||0),0);
                      const p   = totalInv ? Math.round(amt/totalInv*100) : 0;
                      return <div key={s} style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:6}}>
                          <span style={{color:ivc(s),fontWeight:600}}>{s}</span>
                          <span style={{color:C.muted}}>{fmt(amt)}</span>
                        </div>
                        <ProgressBar value={p} color={ivc(s)}/>
                      </div>;
                    })}
                  </div>

                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'22px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:18}}>By Service</div>
                    {Object.keys(SVC_CLR).map(s=>{
                      const amt = leads.filter(l=>l.service===s).reduce((sum,l)=>sum+(parseFloat(l.invoiceAmount)||0),0);
                      if(!amt) return null;
                      const p = totalInv ? Math.round(amt/totalInv*100) : 0;
                      return <div key={s} style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:6}}>
                          <span style={{color:sc(s),fontWeight:600}}>{SVC_LABEL[s]}</span>
                          <span style={{color:C.muted}}>{fmt(amt)}</span>
                        </div>
                        <ProgressBar value={p} color={sc(s)}/>
                      </div>;
                    })}
                    {totalInv===0 && <div style={{fontSize:13,color:C.dimmed}}>No invoice amounts set yet</div>}
                  </div>
                </div>

                {/* Invoice table */}
                <div style={{background:C.tableBg,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                  <div style={{padding:'16px 20px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase'}}>Invoice Ledger</div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead>
                        <tr style={{borderBottom:`1px solid ${C.border}`}}>
                          {['Client','Service','Ref','Amount','Invoice Status','Project Status'].map(h=>(
                            <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leads.filter(l=>l.invoiceAmount||l.invoiceStatus).map(l=>(
                          <tr key={l._row} style={{borderBottom:`1px solid rgba(255,255,255,0.04)`,cursor:'pointer'}}
                            onClick={()=>setModal(l)}
                            onMouseEnter={e=>(e.currentTarget.style.background='rgba(244,185,66,0.04)')}
                            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                            <td style={{padding:'11px 16px'}}>
                              <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{l.name}</div>
                              {l.company && <div style={{fontSize:11,color:C.muted}}>{l.company}</div>}
                            </td>
                            <td style={{padding:'11px 16px'}}><Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/></td>
                            <td style={{padding:'11px 16px',fontSize:11,color:C.muted,fontFamily:'monospace'}}>{l.ref||'—'}</td>
                            <td style={{padding:'11px 16px',fontSize:13,fontWeight:700,color:l.invoiceAmount?C.gold:C.dimmed}}>{l.invoiceAmount?fmt(parseFloat(l.invoiceAmount)):'—'}</td>
                            <td style={{padding:'11px 16px'}}><Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/></td>
                            <td style={{padding:'11px 16px'}}><Badge label={l.status} color={stc(l.status)}/></td>
                          </tr>
                        ))}
                        {leads.filter(l=>l.invoiceAmount||l.invoiceStatus).length===0 && (
                          <tr><td colSpan={6} style={{padding:40,textAlign:'center',color:C.muted,fontSize:13}}>No invoice data yet — edit a lead to add invoice details</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </main>

      {/* ════════════════════════════════════════════
          LEAD DETAIL / EDIT MODAL
      ════════════════════════════════════════════ */}
      {modal && (
        <div onClick={()=>{setModal(null);setEditForm(null);}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,width:'100%',maxWidth:580,maxHeight:'92vh',overflowY:'auto',position:'relative'}}>

            {/* Modal header */}
            <div style={{padding:'22px 24px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'#0a1624',zIndex:2}}>
              <div style={{display:'flex',alignItems:'center',gap:14}}>
                <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:C.gold}}>{ini(modal.name)}</div>
                <div>
                  <div style={{fontSize:16,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,color:'#fff'}}>{modal.name}</div>
                  {modal.company && <div style={{fontSize:12,color:C.muted}}>{modal.company}</div>}
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                {!editForm && <button onClick={()=>setEditForm({...modal})} style={{background:'rgba(244,185,66,0.1)',border:`1px solid ${C.gold}`,color:C.gold,padding:'6px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>✏ Edit</button>}
                {editForm  && <button onClick={saveEdit} style={{background:`linear-gradient(135deg,${C.gold},${C.orange})`,border:'none',color:'#0A1628',padding:'6px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>Save</button>}
                <button onClick={()=>deleteLead(modal)} style={{background:'rgba(229,62,62,0.08)',border:'1px solid rgba(229,62,62,0.3)',color:'#f87171',padding:'6px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Delete</button>
                <button onClick={()=>{setModal(null);setEditForm(null);}} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:14}}>✕</button>
              </div>
            </div>

            <div style={{padding:'22px 24px',display:'flex',flexDirection:'column',gap:20}}>

              {/* Ref + progress */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div style={{background:'rgba(244,185,66,0.05)',borderLeft:`3px solid ${C.gold}`,padding:'12px 16px',borderRadius:'0 8px 8px 0'}}>
                  <div style={{fontSize:9,color:C.gold,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:4}}>Reference</div>
                  <div style={{fontSize:12,fontFamily:'monospace',color:C.gold,fontWeight:700}}>{modal.ref||'—'}</div>
                </div>
                <div style={{background:`${stc(modal.status)}11`,borderLeft:`3px solid ${stc(modal.status)}`,padding:'12px 16px',borderRadius:'0 8px 8px 0'}}>
                  <div style={{fontSize:9,color:stc(modal.status),letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:4}}>Status</div>
                  <div style={{fontSize:12,fontWeight:700,color:stc(modal.status)}}>{modal.status}</div>
                </div>
              </div>

              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6}}>
                  <span style={{color:C.muted}}>Project Progress</span>
                  <span style={{color:stc(modal.status),fontWeight:700}}>{pct(modal.status)}%</span>
                </div>
                <ProgressBar value={pct(modal.status)} color={stc(modal.status)} height={6}/>
              </div>

              {/* ── VIEW MODE ── */}
              {!editForm && (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[
                      {l:'Email',v:modal.email},{l:'Phone',v:modal.phone},
                      {l:'Service',v:SVC_LABEL[modal.service]||modal.service},
                      {l:'Pain Point',v:modal.message},{l:'Notes',v:modal.notes},
                      {l:'Date Added',v:modal.created},
                    ].filter(f=>f.v).map(f=>(
                      <div key={f.l}>
                        <div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{f.l}</div>
                        <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{f.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Project section */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:18}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:14}}>Project Details</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                      {[
                        {l:'Started',v:modal.projectStarted||'No'},
                        {l:'Start Date',v:modal.startDate||'—'},
                        {l:'End Date',v:modal.endDate||'—'},
                        {l:'Invoice Status',v:modal.invoiceStatus||'Not Sent'},
                        {l:'Invoice Amount',v:modal.invoiceAmount?fmt(parseFloat(modal.invoiceAmount)):'—'},
                        {l:'Deliverables',v:modal.deliverables||'—'},
                      ].map(f=>(
                        <div key={f.l}>
                          <div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{f.l}</div>
                          <div style={{fontSize:13,color:C.text}}>{f.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status cycle */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16}}>
                    <div style={{fontSize:10,color:C.muted,marginBottom:10,letterSpacing:'0.08em',textTransform:'uppercase'}}>Move to stage</div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {STATUSES.map(s=>(
                        <button key={s} onClick={()=>{
                          setLeads(prev=>prev.map(l=>l._row===modal._row?{...l,status:s,progress:String(STATUS_PCT[s]??10)}:l));
                          setModal(prev=>prev?{...prev,status:s,progress:String(STATUS_PCT[s]??10)}:null);
                        }} style={{fontSize:11,padding:'5px 14px',borderRadius:20,border:`1px solid ${stc(s)}44`,background:modal.status===s?`${stc(s)}22`:'transparent',color:stc(s),cursor:'pointer',fontFamily:'inherit',fontWeight:modal.status===s?700:400}}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── EDIT MODE ── */}
              {editForm && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Name *</div><Inp value={ef.name} onChange={v=>setEf({name:v})}/></div>
                    <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Company</div><Inp value={ef.company} onChange={v=>setEf({company:v})}/></div>
                    <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Email</div><Inp value={ef.email} onChange={v=>setEf({email:v})} type="email"/></div>
                    <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Phone</div><Inp value={ef.phone} onChange={v=>setEf({phone:v})}/></div>
                    <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Service</div><Sel value={ef.service} onChange={v=>setEf({service:v})} options={[{v:'automate',l:'Automate'},{v:'learn',l:'Learn'},{v:'grow',l:'Grow'}]}/></div>
                    <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Status</div><Sel value={ef.status} onChange={v=>setEf({status:v,progress:String(STATUS_PCT[v]??10)})} options={STATUSES.map(s=>({v:s,l:s}))}/></div>
                  </div>
                  <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Pain Point / Message</div>
                    <textarea value={ef.message} onChange={e=>setEf({message:e.target.value})} style={{width:'100%',background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',height:70,resize:'vertical'}}/>
                  </div>
                  <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Notes</div><Inp value={ef.notes} onChange={v=>setEf({notes:v})}/></div>

                  {/* Project fields */}
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16}}>
                    <div style={{fontSize:10,color:C.gold,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:14}}>Project Details</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                      <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Project Started</div><Sel value={ef.projectStarted||'No'} onChange={v=>setEf({projectStarted:v})} options={[{v:'No',l:'No'},{v:'Yes',l:'Yes'}]}/></div>
                      <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Invoice Status</div><Sel value={ef.invoiceStatus||'Not Sent'} onChange={v=>setEf({invoiceStatus:v})} options={INV_STATUSES.map(s=>({v:s,l:s}))}/></div>
                      <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Start Date</div><Inp value={ef.startDate} onChange={v=>setEf({startDate:v})} type="date"/></div>
                      <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>End Date</div><Inp value={ef.endDate} onChange={v=>setEf({endDate:v})} type="date"/></div>
                      <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Invoice Amount (R)</div><Inp value={ef.invoiceAmount} onChange={v=>setEf({invoiceAmount:v})} placeholder="e.g. 15000"/></div>
                      <div><div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Deliverables</div><Inp value={ef.deliverables} onChange={v=>setEf({deliverables:v})} placeholder="e.g. WhatsApp bot + CRM"/></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          ADD LEAD MODAL
      ════════════════════════════════════════════ */}
      {addOpen && (
        <div onClick={()=>setAddOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:'28px',width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontSize:18,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,color:'#fff',marginBottom:22}}>Add New Lead</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {[
                {l:'Name *',k:'name',t:'text',ph:'Thabo Nkosi'},
                {l:'Company',k:'company',t:'text',ph:'Shandu Civils'},
                {l:'Email',k:'email',t:'email',ph:'email@company.co.za'},
                {l:'Phone',k:'phone',t:'text',ph:'27658804122'},
              ].map(f=>(
                <div key={f.k}>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>{f.l}</div>
                  <Inp value={(newLead as any)[f.k]} onChange={v=>setNewLead(l=>({...l,[f.k]:v}))} placeholder={f.ph} type={f.t}/>
                </div>
              ))}
              <div>
                <div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Service</div>
                <Sel value={newLead.service} onChange={v=>setNewLead(l=>({...l,service:v}))} options={[{v:'automate',l:'Automate'},{v:'learn',l:'Learn'},{v:'grow',l:'Grow'}]}/>
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Status</div>
                <Sel value={newLead.status} onChange={v=>setNewLead(l=>({...l,status:v,progress:String(STATUS_PCT[v]??10)}))} options={STATUSES.map(s=>({v:s,l:s}))}/>
              </div>
            </div>
            <div style={{marginTop:14}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:5}}>Pain Point</div>
              <textarea value={newLead.message} onChange={e=>setNewLead(l=>({...l,message:e.target.value}))} placeholder="What challenge did they share?"
                style={{width:'100%',background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',height:70,resize:'vertical'}}/>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:22}}>
              <button onClick={()=>setAddOpen(false)} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'9px 20px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={saveNew} style={{background:`linear-gradient(135deg,${C.gold},${C.orange})`,border:'none',color:'#0A1628',padding:'9px 22px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>Save Lead</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(244,185,66,0.3);border-radius:2px;}
        select option{background:${dark?'#0d1e35':'#ffffff'};color:${dark?'#e8eaf0':'#0A1628'};}
        input[type=date]::-webkit-calendar-picker-indicator{filter:${dark?'invert(0.6)':'invert(0.3)'};}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}
      `}</style>
    </div>
  );
}
