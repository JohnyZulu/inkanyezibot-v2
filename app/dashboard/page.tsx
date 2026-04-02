'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type Lead = {
  _row:number; name:string; email:string; phone:string;
  company:string; service:string; message:string; status:string;
  progress:string; notes:string; ref:string; created:string;
  projectStarted:string; startDate:string; endDate:string;
  deliverables:string; invoiceStatus:string; invoiceAmount:string;
};
type View = 'overview'|'leads'|'kanban'|'projects'|'revenue'|'analytics';

const STATUSES     = ['New','Contacted','In Progress','Won','Lost'];
const INV_STATUSES = ['Not Sent','Sent','Paid','Overdue'];
const STATUS_PCT   :Record<string,number> = {New:10,Contacted:35,'In Progress':65,Won:100,Lost:0};
const STATUS_CLR   :Record<string,string> = {New:'#378add',Contacted:'#ef9f27','In Progress':'#d4537e',Won:'#3d9e6e',Lost:'#6b7280'};
const INV_CLR      :Record<string,string> = {'Not Sent':'#6b7280',Sent:'#378add',Paid:'#3d9e6e',Overdue:'#e24b4a'};
const SVC_CLR      :Record<string,string> = {automate:'#378add',learn:'#3d9e6e',grow:'#ef9f27',multiple:'#9b6fc8'};
const SVC_LABEL    :Record<string,string> = {automate:'Automate',learn:'Learn',grow:'Grow',multiple:'Multiple'};

const DARK_THEME  = {
  bg:'#060e1d',card:'#0d1e35',sidebar:'rgba(6,14,29,0.97)',bottomNav:'rgba(6,14,29,0.98)',
  border:'rgba(244,185,66,0.12)',borderHover:'rgba(244,185,66,0.3)',
  gold:'#F4B942',orange:'#FF6B35',text:'#e8eaf0',
  muted:'rgba(232,234,240,0.5)',dimmed:'rgba(232,234,240,0.25)',
  inputBg:'rgba(255,255,255,0.04)',selBg:'#0d1e35',modalBg:'#0a1624',tableBg:'#0d1e35',
  trackBg:'rgba(255,255,255,0.06)',rowHover:'rgba(244,185,66,0.04)',
};
const LIGHT_THEME = {
  bg:'#f0f2f7',card:'#ffffff',sidebar:'rgba(10,22,40,0.97)',bottomNav:'rgba(10,22,40,0.98)',
  border:'rgba(10,22,40,0.1)',borderHover:'rgba(244,185,66,0.5)',
  gold:'#c9941a',orange:'#e55a1c',text:'#0A1628',
  muted:'rgba(10,22,40,0.5)',dimmed:'rgba(10,22,40,0.3)',
  inputBg:'rgba(10,22,40,0.05)',selBg:'#ffffff',modalBg:'#ffffff',tableBg:'#ffffff',
  trackBg:'rgba(10,22,40,0.06)',rowHover:'rgba(10,22,40,0.03)',
};

const ini  = (n:string)=>{const p=n.trim().split(' ');return(p.length>1?p[0][0]+p[1][0]:n.substring(0,2)).toUpperCase();};
const sc   = (s:string)=>SVC_CLR[s?.toLowerCase()]||'#888';
const stc  = (s:string)=>STATUS_CLR[s]||'#888';
const ivc  = (s:string)=>INV_CLR[s]||'#888';
const pct  = (s:string)=>STATUS_PCT[s]??10;
const fmt  = (n:number)=>`R${n.toLocaleString('en-ZA')}`;
const blank= ():Lead=>({
  _row:Date.now(),name:'',email:'',phone:'',company:'',
  service:'automate',message:'',status:'New',progress:'10',
  notes:'',ref:`INK-MAN-${new Date().getFullYear()}-${Math.floor(1000+Math.random()*9000)}`,
  created:new Date().toISOString().split('T')[0],
  projectStarted:'No',startDate:'',endDate:'',deliverables:'',invoiceStatus:'Not Sent',invoiceAmount:'',
});

const STARS = Array.from({length:60},(_,i)=>({
  x:(i*137.508)%100,y:(i*73.137)%100,
  r:i%5===0?2:i%3===0?1.5:1,
  o:0.1+((i*47)%10)*0.025,
  d:2+((i*31)%40)*0.1,
}));

export default function Dashboard() {
  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState<View>('overview');
  const [dark,     setDark]     = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [filter,   setFilter]   = useState({service:'',status:'',q:''});
  const [modal,    setModal]    = useState<Lead|null>(null);
  const [editForm, setEditForm] = useState<Lead|null>(null);
  const [addOpen,  setAddOpen]  = useState(false);
  const [newLead,  setNewLead]  = useState<Lead>(blank());
  const [source,   setSource]   = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const C = dark ? DARK_THEME : LIGHT_THEME;

  // ── Responsive detection ──────────────────────────────────────────────────
  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check();
    window.addEventListener('resize',check);
    return ()=>window.removeEventListener('resize',check);
  },[]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{const r=await fetch('/api/sheet');const d=await r.json();setLeads(d.leads||[]);setSource(d.source||'');}
    catch{setLeads([]);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{load();},[load]);

  // ── Computed ──────────────────────────────────────────────────────────────
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

  const filtered=leads.filter(l=>{
    if(filter.service&&l.service!==filter.service)return false;
    if(filter.status&&l.status!==filter.status)return false;
    if(filter.q){const q=filter.q.toLowerCase();if(![l.name,l.company,l.message,l.email].join(' ').toLowerCase().includes(q))return false;}
    return true;
  });
  const byStatus=STATUSES.reduce((a,s)=>{a[s]=filtered.filter(l=>l.status===s);return a;},{} as Record<string,Lead[]>);

  // Analytics data
  const weeklyLeads=(()=>{
    const weeks:{label:string,count:number}[]=[];
    for(let i=7;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i*7);
      const ws=new Date(d);ws.setDate(d.getDate()-d.getDay());
      const we=new Date(ws);we.setDate(ws.getDate()+7);
      weeks.push({label:`W${8-i}`,count:leads.filter(l=>{if(!l.created)return false;const ld=new Date(l.created);return ld>=ws&&ld<we;}).length});
    }
    return weeks;
  })();

  const winByService=Object.keys(SVC_CLR).map(s=>({
    service:s,
    total:leads.filter(l=>l.service===s).length,
    won:leads.filter(l=>l.service===s&&l.status==='Won').length,
  })).filter(s=>s.total>0);

  const monthlyRevenue=(()=>{
    const months:{label:string,invoiced:number,paid:number}[]=[];
    for(let i=5;i>=0;i--){
      const d=new Date();d.setMonth(d.getMonth()-i);
      const y=d.getFullYear();const m=d.getMonth();
      const ml=leads.filter(l=>{if(!l.created)return false;const ld=new Date(l.created);return ld.getFullYear()===y&&ld.getMonth()===m;});
      months.push({label:d.toLocaleString('en-ZA',{month:'short'}),invoiced:ml.reduce((s,l)=>s+(parseFloat(l.invoiceAmount)||0),0),paid:ml.filter(l=>l.invoiceStatus==='Paid').reduce((s,l)=>s+(parseFloat(l.invoiceAmount)||0),0)});
    }
    return months;
  })();

  const navTo=(v:View)=>{setView(v);scrollRef.current?.scrollTo(0,0);};
  const cycleStatus=(lead:Lead,e?:React.MouseEvent)=>{e?.stopPropagation();const idx=STATUSES.indexOf(lead.status);const next=STATUSES[(idx+1)%STATUSES.length];setLeads(prev=>prev.map(l=>l._row===lead._row?{...l,status:next,progress:String(STATUS_PCT[next]??10)}:l));};
  const saveEdit=()=>{if(!editForm)return;setLeads(prev=>prev.map(l=>l._row===editForm._row?{...editForm}:l));if(modal)setModal(editForm);setEditForm(null);};
  const saveNew=()=>{if(!newLead.name.trim())return;setLeads(prev=>[...prev,{...newLead,_row:Date.now()}]);setAddOpen(false);setNewLead(blank());};
  const deleteLead=(lead:Lead)=>{setLeads(prev=>prev.filter(l=>l._row!==lead._row));setModal(null);setEditForm(null);};
  const ef=editForm||newLead;
  const setEf=(f:Partial<Lead>)=>editForm?setEditForm({...editForm,...f}):setNewLead({...newLead,...f});

  // ── Sub-components ────────────────────────────────────────────────────────
  const Badge=({label,color}:{label:string,color:string})=>(
    <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,background:`${color}22`,color,whiteSpace:'nowrap'}}>{label}</span>
  );
  const Bar=({value,color,h=5}:{value:number,color:string,h?:number})=>(
    <div style={{height:h,background:C.trackBg,borderRadius:h,overflow:'hidden'}}>
      <div style={{height:'100%',width:`${Math.min(100,Math.max(0,value))}%`,background:color,borderRadius:h,transition:'width 0.6s ease'}}/>
    </div>
  );
  const Inp=({value,onChange,placeholder,type='text'}:{value:string,onChange:(v:string)=>void,placeholder?:string,type?:string})=>(
    <input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)}
      style={{width:'100%',background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',boxSizing:'border-box'}}/>
  );
  const Sel=({value,onChange,options,w}:{value:string,onChange:(v:string)=>void,options:{v:string,l:string}[],w?:string})=>(
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{width:w||'100%',background:C.selBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',boxSizing:'border-box'}}>
      {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );

  const NAV:{id:View,icon:string,label:string}[]=[
    {id:'overview',  icon:'◈',label:'Overview'},
    {id:'leads',     icon:'◉',label:'Leads'},
    {id:'kanban',    icon:'▦',label:'Kanban'},
    {id:'projects',  icon:'◐',label:'Projects'},
    {id:'revenue',   icon:'◆',label:'Revenue'},
    {id:'analytics', icon:'◎',label:'Analytics'},
  ];

  const KPIS=[
    {label:'Total Leads',  value:total,        sub:'all time',                    accent:'#F4B942',nav:'leads'    as View},
    {label:'Active',       value:active,       sub:'in pipeline',                 accent:'#378add',nav:'kanban'   as View},
    {label:'Won',          value:won,          sub:`${conversion}% conversion`,   accent:'#3d9e6e',nav:'projects' as View},
    {label:'Revenue Paid', value:fmt(paidInv), sub:`${fmt(totalInv)} pipeline`,   accent:'#FF6B35',nav:'revenue'  as View},
  ];

  // ── Lead card for mobile list view ────────────────────────────────────────
  const LeadCard=({l}:{l:Lead})=>(
    <div onClick={()=>setModal(l)} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${stc(l.status)}`,borderRadius:10,padding:'14px 16px',marginBottom:10,cursor:'pointer'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#F4B942',flexShrink:0}}>{ini(l.name)}</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:C.text}}>{l.name}</div>
            {l.company&&<div style={{fontSize:12,color:C.muted}}>{l.company}</div>}
          </div>
        </div>
        <Badge label={l.status} color={stc(l.status)}/>
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:l.message?8:0}}>
        <Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/>
        <Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/>
      </div>
      {l.message&&<div style={{fontSize:12,color:C.muted,lineHeight:1.5,marginTop:6,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{l.message}</div>}
      <Bar value={pct(l.status)} color={stc(l.status)} h={3}/>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:'100vh',background:C.bg,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:C.text,display:'flex',flexDirection:isMobile?'column':'row',overflow:'hidden',height:'100vh',transition:'background 0.3s'}}>

      {/* Stars */}
      {dark&&(
        <svg style={{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:0}} aria-hidden>
          {STARS.map((s,i)=>(
            <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white" opacity={s.o}>
              <animate attributeName="opacity" values={`${s.o};${Math.min(0.6,s.o*3)};${s.o}`} dur={`${s.d}s`} repeatCount="indefinite"/>
            </circle>
          ))}
        </svg>
      )}

      {/* ── DESKTOP SIDEBAR ── */}
      {!isMobile&&(
        <aside style={{width:220,flexShrink:0,background:C.sidebar,borderRight:'1px solid rgba(244,185,66,0.2)',zIndex:100,display:'flex',flexDirection:'column',height:'100vh',position:'relative',transition:'background 0.3s'}}>
          <div style={{padding:'24px 20px 20px',borderBottom:'1px solid rgba(244,185,66,0.15)'}}>
            <div style={{fontSize:10,letterSpacing:'0.25em',color:'#F4B942',fontWeight:700,marginBottom:6}}>INKANYEZI</div>
            <div style={{fontSize:17,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:'#ffffff',lineHeight:1.2}}>CRM &amp; Project<br/>Dashboard</div>
            <div style={{fontSize:10,color:'rgba(232,234,240,0.5)',marginTop:8,display:'flex',alignItems:'center',gap:6}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:source==='sheet'?'#3d9e6e':'#FF6B35',display:'inline-block',flexShrink:0}}/>
              {source==='sheet'?'Live · Google Sheets':'Demo data'}
            </div>
          </div>
          <nav style={{flex:1,padding:'16px 12px',overflowY:'auto'}}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>navTo(n.id)} style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:'none',cursor:'pointer',fontSize:13,textAlign:'left',marginBottom:4,transition:'all 0.15s',fontFamily:'inherit',background:view===n.id?'rgba(244,185,66,0.15)':'transparent',color:view===n.id?'#F4B942':'rgba(232,234,240,0.55)',borderLeft:view===n.id?'2px solid #F4B942':'2px solid transparent'}}>
                <span style={{fontSize:15,width:20,textAlign:'center'}}>{n.icon}</span>{n.label}
              </button>
            ))}
          </nav>
          <div style={{padding:'12px 16px',borderTop:'1px solid rgba(244,185,66,0.15)'}}>
            {[{l:'Total',v:total},{l:'Active',v:active},{l:'Won',v:won},{l:'Revenue',v:fmt(paidInv)}].map(s=>(
              <div key={s.l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:11}}>
                <span style={{color:'rgba(232,234,240,0.5)'}}>{s.l}</span>
                <span style={{color:'#F4B942',fontWeight:700}}>{s.v}</span>
              </div>
            ))}
          </div>
          <div style={{padding:'12px 16px',borderTop:'1px solid rgba(244,185,66,0.15)'}}>
            <button onClick={()=>setAddOpen(true)} style={{width:'100%',background:'linear-gradient(135deg,#F4B942,#FF6B35)',border:'none',color:'#0A1628',padding:'10px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>+ New Lead</button>
          </div>
        </aside>
      )}

      {/* ── MOBILE TOP BAR ── */}
      {isMobile&&(
        <div style={{background:C.sidebar,borderBottom:'1px solid rgba(244,185,66,0.2)',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',zIndex:100,flexShrink:0}}>
          <div>
            <div style={{fontSize:9,letterSpacing:'0.2em',color:'#F4B942',fontWeight:700}}>INKANYEZI</div>
            <div style={{fontSize:15,fontWeight:700,fontFamily:"'Playfair Display',Georgia,serif",color:'#fff',lineHeight:1.1}}>CRM Dashboard</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:source==='sheet'?'#3d9e6e':'#FF6B35',display:'inline-block'}}/>
              <span style={{fontSize:10,color:'rgba(232,234,240,0.5)'}}>{source==='sheet'?'Live':'Demo'}</span>
            </div>
            <button onClick={()=>setDark(d=>!d)} style={{background:'rgba(244,185,66,0.1)',border:'1px solid rgba(244,185,66,0.3)',color:'#F4B942',padding:'6px 10px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>
              {dark?'☀':'🌙'}
            </button>
            <button onClick={()=>setAddOpen(true)} style={{background:'linear-gradient(135deg,#F4B942,#FF6B35)',border:'none',color:'#0A1628',padding:'6px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>+ Lead</button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main ref={scrollRef} style={{flex:1,overflowY:'auto',position:'relative',zIndex:1,paddingBottom:isMobile?72:0}}>
        <div style={{padding:isMobile?'16px 14px':'28px 32px',maxWidth:1200}}>

          {/* Desktop top bar */}
          {!isMobile&&(
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
              <div>
                <h1 style={{fontSize:22,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,color:C.text,margin:0}}>{NAV.find(n=>n.id===view)?.label}</h1>
                <p style={{fontSize:12,color:C.muted,margin:'5px 0 0'}}>{new Date().toLocaleDateString('en-ZA',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <button onClick={()=>setDark(d=>!d)} style={{background:dark?'rgba(244,185,66,0.1)':'rgba(10,22,40,0.08)',border:`1px solid ${C.border}`,color:dark?'#F4B942':C.text,padding:'7px 14px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:14}}>{dark?'☀':'🌙'}</span><span>{dark?'Light':'Dark'}</span>
                </button>
                <button onClick={load} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'7px 16px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>↻ Refresh</button>
              </div>
            </div>
          )}

          {/* Mobile page title */}
          {isMobile&&(
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h1 style={{fontSize:18,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,color:C.text,margin:0}}>{NAV.find(n=>n.id===view)?.label}</h1>
              <button onClick={load} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>↻</button>
            </div>
          )}

          {loading?(
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300,color:C.muted}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:36,marginBottom:12,display:'inline-block',animation:'spin 2s linear infinite'}}>✦</div>
                <div style={{fontSize:14}}>Loading data...</div>
              </div>
            </div>
          ):(
            <>
            {/* ════ OVERVIEW ════ */}
            {view==='overview'&&(
              <div style={{display:'flex',flexDirection:'column',gap:isMobile?12:20}}>

                {/* KPI grid — 2 cols mobile, 4 cols desktop */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:isMobile?10:14}}>
                  {KPIS.map(k=>(
                    <button key={k.label} onClick={()=>navTo(k.nav)} style={{all:'unset',cursor:'pointer',display:'block',width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:isMobile?'14px':'18px 20px',borderTop:`3px solid ${k.accent}`,transition:'transform 0.15s',boxSizing:'border-box'}}
                      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-2px)';el.style.borderColor=k.accent;}}
                      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(0)';el.style.borderColor=C.border;}}>
                      <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6,display:'flex',justifyContent:'space-between'}}>
                        {k.label}<span style={{color:k.accent}}>→</span>
                      </div>
                      <div style={{fontSize:isMobile?20:26,fontWeight:700,color:C.text,fontFamily:"'Playfair Display',Georgia,serif"}}>{k.value}</div>
                      <div style={{fontSize:10,color:k.accent,marginTop:3}}>{k.sub}</div>
                    </button>
                  ))}
                </div>

                {/* Charts — stack on mobile */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?12:14}}>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:14}}>Service Breakdown</div>
                    {Object.entries(svcCounts).length===0?<div style={{fontSize:13,color:C.dimmed}}>No data yet</div>:
                      Object.entries(svcCounts).map(([s,n])=>{const p=total?Math.round(n/total*100):0;return(
                        <div key={s} style={{marginBottom:12}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                            <span style={{color:sc(s),fontWeight:600}}>{SVC_LABEL[s]||s}</span>
                            <span style={{color:C.muted}}>{n} · {p}%</span>
                          </div>
                          <Bar value={p} color={sc(s)}/>
                        </div>
                      );})}
                  </div>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:14}}>Pipeline Funnel</div>
                    {STATUSES.map(s=>{const n=stCounts[s]||0;const p=total?Math.round(n/total*100):0;return(
                      <div key={s} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                          <span style={{color:stc(s),fontWeight:600}}>{s}</span>
                          <span style={{color:C.muted}}>{n}</span>
                        </div>
                        <Bar value={p} color={stc(s)}/>
                      </div>
                    );})}
                  </div>
                </div>

                {/* Recent leads */}
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:14}}>Recent Leads</div>
                  {leads.length===0?<div style={{fontSize:13,color:C.dimmed}}>No leads yet</div>:
                    leads.slice(-5).reverse().map(l=>(
                      <div key={l._row} onClick={()=>setModal(l)} style={{display:'flex',alignItems:'center',gap:12,padding:'8px 0',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#F4B942',flexShrink:0}}>{ini(l.name)}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.name}{l.company?` · ${l.company}`:''}</div>
                          <Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/>
                        </div>
                        <Badge label={l.status} color={stc(l.status)}/>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}

            {/* ════ ALL LEADS ════ */}
            {view==='leads'&&(
              <div>
                {/* Filters */}
                <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                  <input value={filter.q} onChange={e=>setFilter(f=>({...f,q:e.target.value}))} placeholder="Search..."
                    style={{flex:1,minWidth:140,background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit'}}/>
                  <Sel value={filter.service} onChange={v=>setFilter(f=>({...f,service:v}))} w="140px"
                    options={[{v:'',l:'All Services'},{v:'automate',l:'Automate'},{v:'learn',l:'Learn'},{v:'grow',l:'Grow'}]}/>
                  <Sel value={filter.status} onChange={v=>setFilter(f=>({...f,status:v}))} w="140px"
                    options={[{v:'',l:'All Statuses'},...STATUSES.map(s=>({v:s,l:s}))]}/>
                </div>

                {/* Mobile: card list. Desktop: table */}
                {isMobile?(
                  <div>
                    {filtered.length===0?<div style={{padding:40,textAlign:'center',color:C.muted,fontSize:13}}>No leads match filters</div>:
                      filtered.map(l=><LeadCard key={l._row} l={l}/>)}
                  </div>
                ):(
                  <div style={{background:C.tableBg,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',minWidth:700}}>
                        <thead>
                          <tr style={{borderBottom:`1px solid ${C.border}`}}>
                            {['Lead','Service','Pain Point','Status','Progress','Invoice','Ref'].map(h=>(
                              <th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.length===0?(
                            <tr><td colSpan={7} style={{padding:40,textAlign:'center',color:C.muted,fontSize:13}}>No leads match filters</td></tr>
                          ):filtered.map(l=>(
                            <tr key={l._row} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background 0.15s'}}
                              onClick={()=>setModal(l)}
                              onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)}
                              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                              <td style={{padding:'12px 16px'}}>
                                <div style={{display:'flex',alignItems:'center',gap:10}}>
                                  <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#F4B942',flexShrink:0}}>{ini(l.name)}</div>
                                  <div><div style={{fontSize:13,fontWeight:600,color:C.text}}>{l.name}</div>{l.company&&<div style={{fontSize:11,color:C.muted}}>{l.company}</div>}</div>
                                </div>
                              </td>
                              <td style={{padding:'12px 16px'}}><Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/></td>
                              <td style={{padding:'12px 16px',fontSize:12,color:C.muted,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.message||'—'}</td>
                              <td style={{padding:'12px 16px'}}>
                                <button onClick={e=>cycleStatus(l,e)} style={{fontSize:11,fontWeight:700,padding:'4px 12px',borderRadius:20,background:`${stc(l.status)}22`,color:stc(l.status),border:`1px solid ${stc(l.status)}44`,cursor:'pointer',fontFamily:'inherit'}}>{l.status}</button>
                              </td>
                              <td style={{padding:'12px 16px',minWidth:90}}><Bar value={pct(l.status)} color={stc(l.status)}/><div style={{fontSize:10,color:C.muted,marginTop:3}}>{pct(l.status)}%</div></td>
                              <td style={{padding:'12px 16px'}}><Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/></td>
                              <td style={{padding:'12px 16px',fontSize:11,color:C.muted,fontFamily:'monospace'}}>{l.ref||'—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════ KANBAN ════ */}
            {view==='kanban'&&(
              isMobile?(
                /* Mobile kanban: vertical status groups */
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  {STATUSES.filter(s=>byStatus[s].length>0).map(s=>(
                    <div key={s}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                        <span style={{fontSize:11,fontWeight:700,color:stc(s),letterSpacing:'0.08em',textTransform:'uppercase'}}>{s}</span>
                        <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:`${stc(s)}22`,color:stc(s)}}>{byStatus[s].length}</span>
                      </div>
                      {byStatus[s].map(l=><LeadCard key={l._row} l={l}/>)}
                    </div>
                  ))}
                  {STATUSES.every(s=>byStatus[s].length===0)&&<div style={{padding:40,textAlign:'center',color:C.muted,fontSize:13}}>No leads yet</div>}
                </div>
              ):(
                /* Desktop kanban: 5-column grid */
                <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,alignItems:'start'}}>
                  {STATUSES.map(s=>(
                    <div key={s}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,padding:'0 4px'}}>
                        <span style={{fontSize:10,fontWeight:700,color:stc(s),letterSpacing:'0.1em',textTransform:'uppercase'}}>{s}</span>
                        <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:`${stc(s)}22`,color:stc(s)}}>{byStatus[s].length}</span>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:10}}>
                        {byStatus[s].map(l=>(
                          <div key={l._row} onClick={()=>setModal(l)} style={{background:C.card,border:`1px solid ${C.border}`,borderLeft:`3px solid ${stc(s)}`,borderRadius:10,padding:'12px 14px',cursor:'pointer'}}
                            onMouseEnter={e=>(e.currentTarget.style.borderColor=stc(s))}
                            onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3}}>{l.name}</div>
                            {l.company&&<div style={{fontSize:11,color:C.muted,marginBottom:6}}>{l.company}</div>}
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                              <Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/>
                            </div>
                          </div>
                        ))}
                        {byStatus[s].length===0&&<div style={{background:dark?'rgba(255,255,255,0.02)':'rgba(10,22,40,0.03)',border:`1px dashed ${C.border}`,borderRadius:10,padding:16,textAlign:'center',fontSize:11,color:C.dimmed}}>Empty</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ════ PROJECTS ════ */}
            {view==='projects'&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {/* KPIs */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:isMobile?10:14}}>
                  {[{label:'Total Projects',value:projects.length,sub:'active + won',accent:'#F4B942'},
                    {label:'In Progress',value:leads.filter(l=>l.status==='In Progress').length,sub:'active',accent:'#d4537e'},
                    {label:'Completed',value:won,sub:'delivered',accent:'#3d9e6e'},
                    {label:'Started',value:projects.filter(l=>l.projectStarted==='Yes').length,sub:'kicked off',accent:'#378add'},
                  ].map(k=>(
                    <div key={k.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',borderTop:`3px solid ${k.accent}`}}>
                      <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6}}>{k.label}</div>
                      <div style={{fontSize:24,fontWeight:700,color:C.text,fontFamily:"'Playfair Display',Georgia,serif"}}>{k.value}</div>
                      <div style={{fontSize:10,color:k.accent,marginTop:3}}>{k.sub}</div>
                    </div>
                  ))}
                </div>
                {projects.length===0?(
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:40,textAlign:'center',color:C.muted,fontSize:13}}>
                    No projects yet — move leads to <strong style={{color:'#F4B942'}}>In Progress</strong> or <strong style={{color:'#3d9e6e'}}>Won</strong>
                  </div>
                ):projects.map(l=>{
                  const pv=parseFloat(l.progress)||pct(l.status);
                  const ht=l.startDate&&l.endDate;
                  const dl=ht?Math.ceil((new Date(l.endDate).getTime()-Date.now())/86400000):null;
                  return(
                    <div key={l._row} onClick={()=>setModal(l)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px 20px',cursor:'pointer',transition:'border-color 0.2s'}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(244,185,66,0.4)')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=C.border)}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,gap:12,flexWrap:'wrap'}}>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#F4B942',flexShrink:0}}>{ini(l.name)}</div>
                          <div>
                            <div style={{fontSize:14,fontWeight:700,color:C.text}}>{l.name}{l.company?` · ${l.company}`:''}</div>
                            <div style={{display:'flex',gap:5,marginTop:4,flexWrap:'wrap'}}>
                              <Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/>
                              <Badge label={l.status} color={stc(l.status)}/>
                            </div>
                          </div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/>
                          {l.invoiceAmount&&<div style={{fontSize:12,color:'#F4B942',fontWeight:700,marginTop:4}}>{fmt(parseFloat(l.invoiceAmount))}</div>}
                        </div>
                      </div>
                      <div style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}>
                          <span style={{color:C.muted}}>Progress</span>
                          <span style={{color:stc(l.status),fontWeight:700}}>{pv}%</span>
                        </div>
                        <Bar value={pv} color={stc(l.status)} h={7}/>
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:12}}>
                        <div>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Timeline</div>
                          {ht?<div style={{color:C.text}}>{l.startDate} → {l.endDate}{dl!==null&&<div style={{color:dl<0?'#e24b4a':dl<7?'#FF6B35':'#3d9e6e',fontWeight:600,marginTop:2}}>{dl<0?`${Math.abs(dl)}d overdue`:dl===0?'Due today':`${dl}d left`}</div>}</div>:<span style={{color:C.dimmed}}>No dates set</span>}
                        </div>
                        <div>
                          <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>Deliverables</div>
                          <div style={{color:l.deliverables?C.text:C.dimmed}}>{l.deliverables||'Not specified'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ════ REVENUE ════ */}
            {view==='revenue'&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:isMobile?10:14}}>
                  {[{label:'Total Pipeline',value:fmt(totalInv),sub:'all invoices',accent:'#F4B942'},
                    {label:'Paid',value:fmt(paidInv),sub:'collected',accent:'#3d9e6e'},
                    {label:'Pending',value:fmt(leads.filter(l=>l.invoiceStatus==='Sent').reduce((s,l)=>s+(parseFloat(l.invoiceAmount)||0),0)),sub:'awaiting payment',accent:'#378add'},
                    {label:'Overdue',value:fmt(overdueInv),sub:'needs follow-up',accent:'#e24b4a'},
                  ].map(k=>(
                    <div key={k.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',borderTop:`3px solid ${k.accent}`}}>
                      <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6}}>{k.label}</div>
                      <div style={{fontSize:isMobile?18:24,fontWeight:700,color:C.text,fontFamily:"'Playfair Display',Georgia,serif"}}>{k.value}</div>
                      <div style={{fontSize:10,color:k.accent,marginTop:3}}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Invoice breakdown bars */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12}}>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:14}}>By Invoice Status</div>
                    {INV_STATUSES.map(s=>{const amt=leads.filter(l=>(l.invoiceStatus||'Not Sent')===s).reduce((sum,l)=>sum+(parseFloat(l.invoiceAmount)||0),0);const p=totalInv?Math.round(amt/totalInv*100):0;return(
                      <div key={s} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}><span style={{color:ivc(s),fontWeight:600}}>{s}</span><span style={{color:C.muted}}>{fmt(amt)}</span></div>
                        <Bar value={p} color={ivc(s)}/>
                      </div>
                    );})}
                  </div>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:14}}>By Service</div>
                    {Object.keys(SVC_CLR).map(s=>{const amt=leads.filter(l=>l.service===s).reduce((sum,l)=>sum+(parseFloat(l.invoiceAmount)||0),0);if(!amt)return null;const p=totalInv?Math.round(amt/totalInv*100):0;return(
                      <div key={s} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}><span style={{color:sc(s),fontWeight:600}}>{SVC_LABEL[s]}</span><span style={{color:C.muted}}>{fmt(amt)}</span></div>
                        <Bar value={p} color={sc(s)}/>
                      </div>
                    );})}
                    {totalInv===0&&<div style={{fontSize:13,color:C.dimmed}}>No invoice amounts yet</div>}
                  </div>
                </div>

                {/* Invoice ledger — cards on mobile, table on desktop */}
                <div style={{background:C.tableBg,border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}}>
                  <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase'}}>Invoice Ledger</div>
                  {isMobile?(
                    <div style={{padding:'10px 14px'}}>
                      {leads.filter(l=>l.invoiceAmount||l.invoiceStatus).map(l=>(
                        <div key={l._row} onClick={()=>setModal(l)} style={{padding:'12px 0',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
                            <div><div style={{fontSize:13,fontWeight:600,color:C.text}}>{l.name}</div>{l.company&&<div style={{fontSize:11,color:C.muted}}>{l.company}</div>}</div>
                            <div style={{fontSize:14,fontWeight:700,color:l.invoiceAmount?'#F4B942':C.dimmed}}>{l.invoiceAmount?fmt(parseFloat(l.invoiceAmount)):'—'}</div>
                          </div>
                          <div style={{display:'flex',gap:6}}><Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/><Badge label={l.status} color={stc(l.status)}/></div>
                        </div>
                      ))}
                      {leads.filter(l=>l.invoiceAmount||l.invoiceStatus).length===0&&<div style={{padding:30,textAlign:'center',color:C.muted,fontSize:13}}>No invoice data yet</div>}
                    </div>
                  ):(
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse'}}>
                        <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>{['Client','Service','Ref','Amount','Invoice','Status'].map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                        <tbody>
                          {leads.filter(l=>l.invoiceAmount||l.invoiceStatus).map(l=>(
                            <tr key={l._row} style={{borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background 0.15s'}} onClick={()=>setModal(l)} onMouseEnter={e=>(e.currentTarget.style.background=C.rowHover)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                              <td style={{padding:'11px 16px'}}><div style={{fontSize:13,fontWeight:600,color:C.text}}>{l.name}</div>{l.company&&<div style={{fontSize:11,color:C.muted}}>{l.company}</div>}</td>
                              <td style={{padding:'11px 16px'}}><Badge label={SVC_LABEL[l.service]||l.service||'—'} color={sc(l.service)}/></td>
                              <td style={{padding:'11px 16px',fontSize:11,color:C.muted,fontFamily:'monospace'}}>{l.ref||'—'}</td>
                              <td style={{padding:'11px 16px',fontSize:13,fontWeight:700,color:l.invoiceAmount?'#F4B942':C.dimmed}}>{l.invoiceAmount?fmt(parseFloat(l.invoiceAmount)):'—'}</td>
                              <td style={{padding:'11px 16px'}}><Badge label={l.invoiceStatus||'Not Sent'} color={ivc(l.invoiceStatus||'Not Sent')}/></td>
                              <td style={{padding:'11px 16px'}}><Badge label={l.status} color={stc(l.status)}/></td>
                            </tr>
                          ))}
                          {leads.filter(l=>l.invoiceAmount||l.invoiceStatus).length===0&&<tr><td colSpan={6} style={{padding:40,textAlign:'center',color:C.muted,fontSize:13}}>No invoice data yet</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ ANALYTICS ════ */}
            {view==='analytics'&&(
              <div style={{display:'flex',flexDirection:'column',gap:isMobile?12:20}}>

                {/* Analytics KPIs */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(4,1fr)',gap:isMobile?10:14}}>
                  {[
                    {label:'Lead Velocity',   value:`${weeklyLeads.reduce((s,w)=>s+w.count,0)}`,              sub:'last 8 weeks',              accent:'#F4B942'},
                    {label:'Conversion',      value:`${conversion}%`,                                         sub:`${won} of ${total} leads`,  accent:'#3d9e6e'},
                    {label:'Avg Deal Size',   value:won>0?fmt(Math.round(paidInv/Math.max(won,1))):'R0',      sub:'per won lead',              accent:'#378add'},
                    {label:'Pipeline Health', value:`${active>0?Math.round((won/(won+active))*100):0}%`,      sub:'won vs active',             accent:'#ef9f27'},
                  ].map(k=>(
                    <div key={k.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 16px',borderTop:`3px solid ${k.accent}`}}>
                      <div style={{fontSize:9,color:C.muted,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6}}>{k.label}</div>
                      <div style={{fontSize:isMobile?20:26,fontWeight:700,color:C.text,fontFamily:"'Playfair Display',Georgia,serif"}}>{k.value}</div>
                      <div style={{fontSize:10,color:k.accent,marginTop:3}}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Lead velocity + Revenue trend */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?12:14}}>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:4}}>Lead Velocity — Last 8 Weeks</div>
                    <div style={{fontSize:11,color:C.dimmed,marginBottom:16}}>New leads per week</div>
                    <div style={{display:'flex',alignItems:'flex-end',gap:4,height:120}}>
                      {weeklyLeads.map((w,i)=>{const maxC=Math.max(...weeklyLeads.map(x=>x.count),1);const h=Math.round((w.count/maxC)*100);return(
                        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600}}>{w.count||''}</div>
                          <div style={{width:'100%',height:h||3,background:w.count>0?'#F4B942':C.trackBg,borderRadius:'3px 3px 0 0',minHeight:3,transition:'height 0.6s ease'}}/>
                          <div style={{fontSize:9,color:C.dimmed}}>{w.label}</div>
                        </div>
                      );})}
                    </div>
                  </div>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:4}}>Revenue — Last 6 Months</div>
                    <div style={{fontSize:11,color:C.dimmed,marginBottom:16}}>Invoiced vs Paid</div>
                    <div style={{display:'flex',alignItems:'flex-end',gap:6,height:120}}>
                      {monthlyRevenue.map((m,i)=>{const maxR=Math.max(...monthlyRevenue.map(x=>x.invoiced),1);const hI=Math.round((m.invoiced/maxR)*100);const hP=Math.round((m.paid/maxR)*100);return(
                        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                          <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:108}}>
                            <div style={{flex:1,height:hI||2,background:'rgba(244,185,66,0.4)',borderRadius:'3px 3px 0 0',minHeight:2}}/>
                            <div style={{flex:1,height:hP||2,background:'#3d9e6e',borderRadius:'3px 3px 0 0',minHeight:2}}/>
                          </div>
                          <div style={{fontSize:9,color:C.dimmed}}>{m.label}</div>
                        </div>
                      );})}
                    </div>
                    <div style={{display:'flex',gap:14,marginTop:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:C.muted}}><div style={{width:8,height:8,borderRadius:2,background:'rgba(244,185,66,0.4)'}}/> Invoiced</div>
                      <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:C.muted}}><div style={{width:8,height:8,borderRadius:2,background:'#3d9e6e'}}/> Paid</div>
                    </div>
                  </div>
                </div>

                {/* Service demand + Funnel */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?12:14}}>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:4}}>Service Demand</div>
                    <div style={{fontSize:11,color:C.dimmed,marginBottom:16}}>Most requested services</div>
                    {Object.entries(svcCounts).length===0?<div style={{fontSize:13,color:C.dimmed}}>No data yet</div>:(()=>{
                      const sorted=Object.entries(svcCounts).sort((a,b)=>b[1]-a[1]);const max=sorted[0][1];
                      return sorted.map(([s,n])=>{const p=total?Math.round(n/total*100):0;return(
                        <div key={s} style={{marginBottom:14}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                            <div style={{display:'flex',alignItems:'center',gap:7}}><div style={{width:7,height:7,borderRadius:'50%',background:sc(s)}}/><span style={{fontSize:13,fontWeight:600,color:C.text}}>{SVC_LABEL[s]||s}</span></div>
                            <div style={{display:'flex',gap:7}}><span style={{fontSize:13,fontWeight:700,color:sc(s)}}>{n}</span><span style={{fontSize:11,color:C.dimmed}}>{p}%</span></div>
                          </div>
                          <Bar value={Math.round(n/max*100)} color={sc(s)} h={7}/>
                        </div>
                      );});
                    })()}
                  </div>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:4}}>Conversion Funnel</div>
                    <div style={{fontSize:11,color:C.dimmed,marginBottom:16}}>Where leads drop off</div>
                    {STATUSES.map((s,i)=>{const n=stCounts[s]||0;const p=total?Math.round(n/total*100):0;const w=100-i*12;return(
                      <div key={s} style={{marginBottom:8,display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:isMobile?60:80,flexShrink:0,fontSize:11,fontWeight:600,color:stc(s)}}>{s}</div>
                        <div style={{flex:1,height:28,background:C.trackBg,borderRadius:6,overflow:'hidden',position:'relative'}}>
                          <div style={{position:'absolute',inset:0,width:`${w}%`,background:`${stc(s)}22`,borderRadius:6}}/>
                          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 10px'}}>
                            <span style={{fontSize:12,fontWeight:700,color:stc(s)}}>{n}</span>
                            <span style={{fontSize:11,color:C.muted}}>{p}%</span>
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>
                </div>

                {/* Win rate + Insights */}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?12:14}}>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:4}}>Win Rate by Service</div>
                    <div style={{fontSize:11,color:C.dimmed,marginBottom:16}}>Which service closes best</div>
                    {winByService.length===0?<div style={{fontSize:13,color:C.dimmed}}>No data yet</div>:winByService.map(s=>{const rate=s.total?Math.round(s.won/s.total*100):0;return(
                      <div key={s.service} style={{marginBottom:14}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:5,fontSize:13}}>
                          <span style={{fontWeight:600,color:C.text}}>{SVC_LABEL[s.service]||s.service}</span>
                          <span style={{color:rate>=50?'#3d9e6e':rate>=25?'#ef9f27':'#e24b4a',fontWeight:700}}>{rate}%</span>
                        </div>
                        <Bar value={rate} color={rate>=50?'#3d9e6e':rate>=25?'#ef9f27':'#e24b4a'} h={6}/>
                        <div style={{fontSize:10,color:C.dimmed,marginTop:3}}>{s.won} won of {s.total}</div>
                      </div>
                    );})}
                  </div>
                  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'18px'}}>
                    <div style={{fontSize:10,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:4}}>Key Insights</div>
                    <div style={{fontSize:11,color:C.dimmed,marginBottom:16}}>What your data says</div>
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {[
                        {icon:'◆',color:'#F4B942',title:'Top Service',value:Object.entries(svcCounts).sort((a,b)=>b[1]-a[1])[0]?`${SVC_LABEL[Object.entries(svcCounts).sort((a,b)=>b[1]-a[1])[0][0]]||'—'} (${Object.entries(svcCounts).sort((a,b)=>b[1]-a[1])[0][1]} leads)`:'No data yet'},
                        {icon:'◆',color:'#3d9e6e',title:'Conversion',value:total>0?`${conversion}% — ${won} of ${total} leads`:'No leads yet'},
                        {icon:'◆',color:'#378add',title:'Revenue Collected',value:paidInv>0?`${fmt(paidInv)} of ${fmt(totalInv)} invoiced`:'No invoices yet'},
                        {icon:'◆',color:'#e24b4a',title:'Needs Attention',value:leads.filter(l=>l.invoiceStatus==='Overdue').length>0?`${leads.filter(l=>l.invoiceStatus==='Overdue').length} overdue invoice(s) — ${fmt(overdueInv)}`:leads.filter(l=>l.status==='New').length>0?`${leads.filter(l=>l.status==='New').length} new lead(s) not yet contacted`:'All clear ✓'},
                      ].map(ins=>(
                        <div key={ins.title} style={{display:'flex',gap:10,padding:'10px 12px',background:dark?'rgba(255,255,255,0.02)':'rgba(10,22,40,0.02)',borderRadius:8,border:`1px solid ${ins.color}22`}}>
                          <span style={{color:ins.color,fontSize:13,flexShrink:0,marginTop:1}}>{ins.icon}</span>
                          <div>
                            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:2}}>{ins.title}</div>
                            <div style={{fontSize:13,color:C.text,fontWeight:500,lineHeight:1.4}}>{ins.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      {isMobile&&(
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:C.bottomNav,borderTop:'1px solid rgba(244,185,66,0.2)',display:'flex',zIndex:200,paddingBottom:'env(safe-area-inset-bottom,0px)'}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>navTo(n.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'10px 4px',border:'none',cursor:'pointer',fontFamily:'inherit',background:'transparent',transition:'all 0.15s',gap:3}}>
              <span style={{fontSize:16,color:view===n.id?'#F4B942':'rgba(232,234,240,0.4)'}}>{n.icon}</span>
              <span style={{fontSize:9,fontWeight:view===n.id?700:400,color:view===n.id?'#F4B942':'rgba(232,234,240,0.4)',letterSpacing:'0.04em'}}>{n.label}</span>
              {view===n.id&&<div style={{width:20,height:2,background:'#F4B942',borderRadius:1,position:'absolute',bottom:8}}/>}
            </button>
          ))}
        </div>
      )}

      {/* ── LEAD DETAIL MODAL ── */}
      {modal&&(
        <div onClick={()=>{setModal(null);setEditForm(null);}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:500,display:'flex',alignItems:isMobile?'flex-end':'center',justifyContent:'center',padding:isMobile?0:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.modalBg,border:`1px solid ${C.border}`,borderRadius:isMobile?'16px 16px 0 0':'16px',width:'100%',maxWidth:isMobile?'100%':580,maxHeight:isMobile?'90vh':'92vh',overflowY:'auto'}}>
            <div style={{padding:'18px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:C.modalBg,zIndex:2}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(244,185,66,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#F4B942'}}>{ini(modal.name)}</div>
                <div><div style={{fontSize:15,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,color:C.text}}>{modal.name}</div>{modal.company&&<div style={{fontSize:12,color:C.muted}}>{modal.company}</div>}</div>
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
                {!editForm&&<button onClick={()=>setEditForm({...modal})} style={{background:'rgba(244,185,66,0.1)',border:'1px solid #F4B942',color:'#F4B942',padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>✏ Edit</button>}
                {editForm&&<button onClick={saveEdit} style={{background:'linear-gradient(135deg,#F4B942,#FF6B35)',border:'none',color:'#0A1628',padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>Save</button>}
                <button onClick={()=>deleteLead(modal)} style={{background:'rgba(229,62,62,0.08)',border:'1px solid rgba(229,62,62,0.3)',color:'#f87171',padding:'5px 12px',borderRadius:8,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Delete</button>
                <button onClick={()=>{setModal(null);setEditForm(null);}} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'5px 10px',borderRadius:8,cursor:'pointer',fontSize:14}}>✕</button>
              </div>
            </div>
            <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:16}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{background:dark?'rgba(244,185,66,0.05)':'rgba(244,185,66,0.08)',borderLeft:'3px solid #F4B942',padding:'10px 14px',borderRadius:'0 8px 8px 0'}}>
                  <div style={{fontSize:9,color:'#F4B942',letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:3}}>Reference</div>
                  <div style={{fontSize:11,fontFamily:'monospace',color:'#F4B942',fontWeight:700,wordBreak:'break-all'}}>{modal.ref||'—'}</div>
                </div>
                <div style={{background:`${stc(modal.status)}11`,borderLeft:`3px solid ${stc(modal.status)}`,padding:'10px 14px',borderRadius:'0 8px 8px 0'}}>
                  <div style={{fontSize:9,color:stc(modal.status),letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:3}}>Status</div>
                  <div style={{fontSize:12,fontWeight:700,color:stc(modal.status)}}>{modal.status}</div>
                </div>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:5}}><span style={{color:C.muted}}>Progress</span><span style={{color:stc(modal.status),fontWeight:700}}>{pct(modal.status)}%</span></div>
                <Bar value={pct(modal.status)} color={stc(modal.status)} h={5}/>
              </div>
              {!editForm&&(
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {[{l:'Email',v:modal.email},{l:'Phone',v:modal.phone},{l:'Service',v:SVC_LABEL[modal.service]||modal.service},{l:'Pain Point',v:modal.message},{l:'Notes',v:modal.notes},{l:'Date Added',v:modal.created}].filter(f=>f.v).map(f=>(
                      <div key={f.l}><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:3}}>{f.l}</div><div style={{fontSize:13,color:C.text,lineHeight:1.5,wordBreak:'break-word'}}>{f.v}</div></div>
                    ))}
                  </div>
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
                    <div style={{fontSize:9,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:12}}>Project Details</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      {[{l:'Started',v:modal.projectStarted||'No'},{l:'Start Date',v:modal.startDate||'—'},{l:'End Date',v:modal.endDate||'—'},{l:'Invoice Status',v:modal.invoiceStatus||'Not Sent'},{l:'Invoice Amount',v:modal.invoiceAmount?fmt(parseFloat(modal.invoiceAmount)):'—'},{l:'Deliverables',v:modal.deliverables||'—'}].map(f=>(
                        <div key={f.l}><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:3}}>{f.l}</div><div style={{fontSize:13,color:C.text}}>{f.v}</div></div>
                      ))}
                    </div>
                  </div>
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
                    <div style={{fontSize:9,color:C.muted,marginBottom:8,letterSpacing:'0.08em',textTransform:'uppercase'}}>Move to stage</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      {STATUSES.map(s=>(
                        <button key={s} onClick={()=>{setLeads(prev=>prev.map(l=>l._row===modal._row?{...l,status:s,progress:String(STATUS_PCT[s]??10)}:l));setModal(prev=>prev?{...prev,status:s,progress:String(STATUS_PCT[s]??10)}:null);}}
                          style={{fontSize:11,padding:'5px 12px',borderRadius:20,border:`1px solid ${stc(s)}44`,background:modal.status===s?`${stc(s)}22`:'transparent',color:stc(s),cursor:'pointer',fontFamily:'inherit',fontWeight:modal.status===s?700:400}}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {editForm&&(
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    {[{l:'Name *',k:'name',t:'text'},{l:'Company',k:'company',t:'text'},{l:'Email',k:'email',t:'email'},{l:'Phone',k:'phone',t:'text'}].map(f=>(
                      <div key={f.k}><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{f.l}</div><Inp value={(ef as any)[f.k]} onChange={v=>setEf({[f.k]:v})} type={f.t}/></div>
                    ))}
                    <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Service</div><Sel value={ef.service} onChange={v=>setEf({service:v})} options={[{v:'automate',l:'Automate'},{v:'learn',l:'Learn'},{v:'grow',l:'Grow'}]}/></div>
                    <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Status</div><Sel value={ef.status} onChange={v=>setEf({status:v,progress:String(STATUS_PCT[v]??10)})} options={STATUSES.map(s=>({v:s,l:s}))}/></div>
                  </div>
                  <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Pain Point</div>
                    <textarea value={ef.message} onChange={e=>setEf({message:e.target.value})} style={{width:'100%',background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',height:65,resize:'vertical',boxSizing:'border-box'}}/>
                  </div>
                  <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Notes</div><Inp value={ef.notes} onChange={v=>setEf({notes:v})}/></div>
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
                    <div style={{fontSize:9,color:'#F4B942',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:12}}>Project Details</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Project Started</div><Sel value={ef.projectStarted||'No'} onChange={v=>setEf({projectStarted:v})} options={[{v:'No',l:'No'},{v:'Yes',l:'Yes'}]}/></div>
                      <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Invoice Status</div><Sel value={ef.invoiceStatus||'Not Sent'} onChange={v=>setEf({invoiceStatus:v})} options={INV_STATUSES.map(s=>({v:s,l:s}))}/></div>
                      <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Start Date</div><Inp value={ef.startDate} onChange={v=>setEf({startDate:v})} type="date"/></div>
                      <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>End Date</div><Inp value={ef.endDate} onChange={v=>setEf({endDate:v})} type="date"/></div>
                      <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Invoice Amount (R)</div><Inp value={ef.invoiceAmount} onChange={v=>setEf({invoiceAmount:v})} placeholder="e.g. 15000"/></div>
                      <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Deliverables</div><Inp value={ef.deliverables} onChange={v=>setEf({deliverables:v})} placeholder="e.g. WhatsApp bot"/></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD LEAD MODAL ── */}
      {addOpen&&(
        <div onClick={()=>setAddOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:500,display:'flex',alignItems:isMobile?'flex-end':'center',justifyContent:'center',padding:isMobile?0:20}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.modalBg,border:`1px solid ${C.border}`,borderRadius:isMobile?'16px 16px 0 0':'16px',padding:'22px 20px',width:'100%',maxWidth:isMobile?'100%':520,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
              <div style={{fontSize:17,fontFamily:"'Playfair Display',Georgia,serif",fontWeight:700,color:C.text}}>Add New Lead</div>
              <button onClick={()=>setAddOpen(false)} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'4px 10px',borderRadius:8,cursor:'pointer',fontSize:14}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[{l:'Name *',k:'name',t:'text',ph:'Thabo Nkosi'},{l:'Company',k:'company',t:'text',ph:'Shandu Civils'},{l:'Email',k:'email',t:'email',ph:'email@company.co.za'},{l:'Phone',k:'phone',t:'text',ph:'27658804122'}].map(f=>(
                <div key={f.k}><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>{f.l}</div><Inp value={(newLead as any)[f.k]} onChange={v=>setNewLead(l=>({...l,[f.k]:v}))} placeholder={f.ph} type={f.t}/></div>
              ))}
              <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Service</div><Sel value={newLead.service} onChange={v=>setNewLead(l=>({...l,service:v}))} options={[{v:'automate',l:'Automate'},{v:'learn',l:'Learn'},{v:'grow',l:'Grow'}]}/></div>
              <div><div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Status</div><Sel value={newLead.status} onChange={v=>setNewLead(l=>({...l,status:v,progress:String(STATUS_PCT[v]??10)}))} options={STATUSES.map(s=>({v:s,l:s}))}/></div>
            </div>
            <div style={{marginTop:12}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Pain Point</div>
              <textarea value={newLead.message} onChange={e=>setNewLead(l=>({...l,message:e.target.value}))} placeholder="What challenge did they share?"
                style={{width:'100%',background:C.inputBg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'9px 14px',fontSize:13,fontFamily:'inherit',height:65,resize:'vertical',boxSizing:'border-box'}}/>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}>
              <button onClick={()=>setAddOpen(false)} style={{background:'transparent',border:`1px solid ${C.border}`,color:C.muted,padding:'9px 18px',borderRadius:8,cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Cancel</button>
              <button onClick={saveNew} style={{background:'linear-gradient(135deg,#F4B942,#FF6B35)',border:'none',color:'#0A1628',padding:'9px 20px',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'}}>Save Lead</button>
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
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);}
        @keyframes spin{to{transform:rotate(360deg);}}
      `}</style>
    </div>
  );
}
