import { useState, useRef, useEffect, useCallback } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ProblemSection from "@/components/ProblemSection";
import SolutionSection from "@/components/SolutionSection";
import HowItWorks from "@/components/HowItWorks";
import ROICalculator from "@/components/ROICalculator";
import ChatDemoFixed from "@/components/ChatDemoFixed";
import PhilosophySection from "@/components/PhilosophySection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import CustomCursor from "@/components/CustomCursor";
import GlobalStarfield from "@/components/GlobalStarfield";
import ShootingStars from "@/components/ShootingStars";

// ════════════════════════════════════════════════════════════════════
// DESIGN TOKENS — Afrofuturist Cosmos × SA Heritage × Dark Matter
// ════════════════════════════════════════════════════════════════════
const C = {
  void:     '#04080F',
  midnight: '#0A1628',
  deep:     '#0D1E35',
  gold:     '#F4B942',
  orange:   '#FF6B35',
  white:    '#FFFFFF',
  saGreen:  '#007A4D',
  saGold:   '#FFB612',
  saRed:    '#DE3831',
  saBlue:   '#002395',
};

// ── CONSTELLATION CANVAS ─────────────────────────────────────────────
function CosmosCanvas({ width, height }: { width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = width; canvas.height = height;
    let raf: number;
    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.4 + 0.2,
      pulse: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.015 + 0.003,
      gold: Math.random() > 0.85,
      twinkle: Math.random() * 0.5 + 0.5,
    }));
    const lines = [[0,7],[7,15],[15,22],[22,8],[8,3],[3,17],[17,31],[31,42],[12,28],[28,44]];
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lines.forEach(([a,b]) => {
        if (!stars[a] || !stars[b]) return;
        ctx.beginPath();
        ctx.moveTo(stars[a].x * canvas.width, stars[a].y * canvas.height);
        ctx.lineTo(stars[b].x * canvas.width, stars[b].y * canvas.height);
        ctx.strokeStyle = 'rgba(244,185,66,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();
      });
      stars.forEach(s => {
        s.pulse += s.speed;
        const op = s.twinkle * (0.5 + 0.5 * Math.sin(s.pulse));
        const grd = ctx.createRadialGradient(s.x*canvas.width, s.y*canvas.height, 0, s.x*canvas.width, s.y*canvas.height, s.r*3);
        grd.addColorStop(0, s.gold ? `rgba(244,185,66,${op})` : `rgba(255,255,255,${op*0.7})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(s.x*canvas.width, s.y*canvas.height, s.r*1.5, 0, Math.PI*2);
        ctx.fillStyle = grd; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [width, height]);
  return <canvas ref={ref} style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', borderRadius:'inherit' }} />;
}

// ── SA HERITAGE STRIP ────────────────────────────────────────────────
function HeritageStrip({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{ display:'flex', gap:3, alignItems:'center', ...style }}>
      {[C.saGreen,C.saGold,C.saRed,C.saBlue,C.white].map((c,i) => (
        <div key={i} style={{ width:i===2?18:11, height:2.5, background:c, borderRadius:2, opacity:0.7 }} />
      ))}
    </div>
  );
}

// ── SIGNAL DOT ───────────────────────────────────────────────────────
function SignalDot() {
  return (
    <span style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ position:'absolute', width:8, height:8, borderRadius:'50%', background:'#22C55E', animation:'ping 2s ease-out infinite' }} />
      <span style={{ width:8, height:8, borderRadius:'50%', background:'#22C55E', display:'block' }} />
    </span>
  );
}

// ── TRIGGER SCORING ──────────────────────────────────────────────────
const SIGNALS = {
  STAGES: { interested:30, ready:60, exploring:10, objecting:5, new:0 } as Record<string,number>,
  PAIN:20, INDUSTRY:15, STAFF:10,
  BUDGET: { high:25, medium:15, low:5 } as Record<string,number>,
  DEPTH:5, DEMO:100, EXPLICIT:80,
};
const THRESHOLD = 45; const MIN_MSGS = 3;
const TRIGGERS = ['get in touch','contact','speak to someone','call me','reach out','book a demo','schedule','sign up','get started','how much','pricing','cost','quote','proposal','sounds good',"let's do it",'ready to','can you help','interested'];

function scoreConversation(ctx: any, userCount: number, lastMsg: string) {
  let score = 0;
  if (!ctx) return { score:0, shouldShow:false };
  score += SIGNALS.STAGES[ctx.qualification_stage||'new']||0;
  if (ctx.pain_point)    score += SIGNALS.PAIN;
  if (ctx.industry)      score += SIGNALS.INDUSTRY;
  if (ctx.staff_count)   score += SIGNALS.STAFF;
  if (ctx.budget_signal) score += SIGNALS.BUDGET[ctx.budget_signal]||0;
  if (userCount > 4)     score += Math.floor((userCount-4)/3)*SIGNALS.DEPTH;
  if (ctx.demo_booked)   score += SIGNALS.DEMO;
  if (lastMsg && TRIGGERS.some(p => lastMsg.toLowerCase().includes(p))) score += SIGNALS.EXPLICIT;
  return { score, shouldShow: score >= THRESHOLD && userCount >= MIN_MSGS };
}

const CHIPS = [
  { label:'📊 Calculate my ROI',         msg:'Calculate my ROI' },
  { label:"🚀 Show me what you've built", msg:"Show me what you've built" },
  { label:'📅 Book a free demo',          msg:'Book a free demo' },
  { label:'💬 Automate my WhatsApp',      msg:'Automate my WhatsApp' },
];

const INDUSTRIES = [
  { value:'plumbing',      label:'🔧 Plumbing & Trade' },
  { value:'electrical',    label:'⚡ Electrical & HVAC' },
  { value:'construction',  label:'🏗️ Construction' },
  { value:'healthcare',    label:'🏥 Healthcare' },
  { value:'property',      label:'🏘️ Property & Real Estate' },
  { value:'retail',        label:'🛒 Retail & Wholesale' },
  { value:'transport',     label:'🚛 Transport & Logistics' },
  { value:'hospitality',   label:'🍽️ Hospitality & Food' },
  { value:'professional',  label:'💼 Professional Services' },
  { value:'education',     label:'📚 Education & Training' },
  { value:'technology',    label:'💻 Technology' },
  { value:'other',         label:'◎ Other' },
];
const SERVICES = [
  { value:'automate', label:'⚙️ Automate — Business Automation' },
  { value:'learn',    label:'🎓 Learn — AI Training' },
  { value:'grow',     label:'📈 Grow — AI Strategy' },
  { value:'unsure',   label:'✦ Just exploring' },
];

// ── LEAD FORM FIELD ──────────────────────────────────────────────────
function LeadField({ label, name, type='text', placeholder, value, onChange, required }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex:1, minWidth:0 }}>
      <label style={{ display:'block', fontSize:'0.56rem', letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:"'Space Mono',monospace", color:focused?C.gold:'rgba(255,255,255,0.35)', marginBottom:'0.25rem', transition:'color 0.2s' }}>
        {label}{required&&<span style={{color:C.orange}}> *</span>}
      </label>
      <input type={type} name={name} value={value} onChange={onChange} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} placeholder={placeholder} required={required}
        style={{ width:'100%', boxSizing:'border-box', background:focused?'rgba(244,185,66,0.05)':'rgba(255,255,255,0.03)', border:`1px solid ${focused?'rgba(244,185,66,0.45)':'rgba(255,255,255,0.08)'}`, borderRadius:'5px', padding:'0.48rem 0.65rem', color:'#fff', fontSize:'0.8rem', fontFamily:"'DM Sans',sans-serif", outline:'none', transition:'all 0.2s' }} />
    </div>
  );
}

function LeadSelect({ label, name, value, onChange, options, required }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex:1, minWidth:0, position:'relative' }}>
      <label style={{ display:'block', fontSize:'0.56rem', letterSpacing:'0.14em', textTransform:'uppercase', fontFamily:"'Space Mono',monospace", color:focused?C.gold:'rgba(255,255,255,0.35)', marginBottom:'0.25rem', transition:'color 0.2s' }}>
        {label}{required&&<span style={{color:C.orange}}> *</span>}
      </label>
      <div style={{ position:'relative' }}>
        <select name={name} value={value} onChange={onChange} required={required} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
          style={{ width:'100%', appearance:'none', boxSizing:'border-box', background:'rgba(10,22,40,0.98)', border:`1px solid ${focused?'rgba(244,185,66,0.45)':'rgba(255,255,255,0.08)'}`, borderRadius:'5px', padding:'0.48rem 1.8rem 0.48rem 0.65rem', color:value?'#fff':'rgba(255,255,255,0.25)', fontSize:'0.8rem', fontFamily:"'DM Sans',sans-serif", outline:'none', cursor:'pointer', transition:'all 0.2s' }}>
          <option value="" disabled style={{background:'#0A1628'}}>Select...</option>
          {options.map((o: any) => <option key={o.value} value={o.value} style={{background:'#0A1628',color:'#fff'}}>{o.label}</option>)}
        </select>
        <span style={{ position:'absolute', right:'0.55rem', top:'50%', transform:'translateY(-50%)', fontSize:'0.5rem', color:'rgba(255,255,255,0.3)', pointerEvents:'none' }}>▼</span>
      </div>
    </div>
  );
}

// ── CHAT LEAD FORM ───────────────────────────────────────────────────
function ChatLeadForm({ onSubmit, onDismiss, sessionContext={}, submitting }: any) {
  const [submitted, setSubmitted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [visible, setVisible] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', phone:'', company:'', industry:'', service_interest:'', message:'' });
  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);
  useEffect(() => {
    setForm(f => ({ ...f,
      name:    f.name    || sessionContext?.name     || '',
      email:   f.email   || sessionContext?.email    || '',
      phone:   f.phone   || sessionContext?.whatsapp || '',
      company: f.company || sessionContext?.business || '',
      industry:f.industry|| sessionContext?.industry || '',
      message: f.message || sessionContext?.pain_point || '',
    }));
  }, [sessionContext]);
  const handle = (e: any) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const submit = async (e: any) => {
    e.preventDefault(); if (!consent) return;
    const r = await onSubmit?.(form);
    if (r?.success !== false) setSubmitted(true);
  };
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', opacity:visible?1:0, transform:visible?'translateY(0)':'translateY(12px)', transition:'opacity 0.45s ease, transform 0.45s ease' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'5px' }}>
        <div style={{ width:20, height:20, borderRadius:'50%', background:`linear-gradient(135deg, ${C.gold}, ${C.orange})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', color:C.midnight }}>✦</div>
        <span style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.28)', fontFamily:"'Space Mono',monospace", letterSpacing:'0.08em' }}>InkanyeziBot</span>
      </div>
      <div style={{ width:'100%', position:'relative', overflow:'hidden', background:'linear-gradient(145deg, rgba(10,22,40,0.96), rgba(4,8,15,0.98))', border:'1px solid rgba(244,185,66,0.18)', borderRadius:'14px', borderTopLeftRadius:'3px', boxShadow:'0 8px 32px rgba(0,0,0,0.6)' }}>
        <CosmosCanvas width={340} height={280} />
        <div style={{ height:'2px', position:'relative', zIndex:2, background:`linear-gradient(90deg, transparent, ${C.gold}, ${C.orange}, ${C.gold}, transparent)`, backgroundSize:'200% 100%', animation:'shimmerBar 3s linear infinite' }} />
        {onDismiss && !submitted && (
          <button onClick={onDismiss} style={{ position:'absolute', top:'0.55rem', right:'0.55rem', zIndex:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'4px', padding:'2px 6px', color:'rgba(255,255,255,0.3)', fontSize:'0.6rem', cursor:'pointer', fontFamily:"'Space Mono',monospace" }}>✕</button>
        )}
        <div style={{ padding:'0.9rem 1rem 1rem', position:'relative', zIndex:1 }}>
          {submitted ? (
            <div style={{ textAlign:'center', padding:'0.75rem 0 0.25rem' }}>
              <div style={{ width:44, height:44, borderRadius:'50%', margin:'0 auto 0.65rem', background:'rgba(244,185,66,0.1)', border:'1px solid rgba(244,185,66,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>✦</div>
              <p style={{ fontFamily:"'Syne',sans-serif", fontSize:'1rem', fontWeight:800, color:'#fff', margin:'0 0 0.35rem', lineHeight:1.2 }}>
                Signal received,{' '}
                <span style={{ background:`linear-gradient(90deg, ${C.gold}, ${C.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{form.name?.split(' ')[0]||'friend'}</span>
              </p>
              <p style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.4)', margin:'0 0 0.75rem', lineHeight:1.55, fontFamily:"'DM Sans',sans-serif" }}>
                {form.company ? `Sanele will reach out to ${form.company} within 24 hours.` : 'Sanele will be in touch within 24 hours.'}
              </p>
              <HeritageStrip style={{ justifyContent:'center' }} />
            </div>
          ) : (
            <>
              <div style={{ marginBottom:'0.8rem' }}>
                <div style={{ fontSize:'0.52rem', letterSpacing:'0.22em', textTransform:'uppercase', color:C.gold, fontFamily:"'Space Mono',monospace", marginBottom:'0.22rem' }}>✦ Inkanyezi Technologies</div>
                <h3 style={{ margin:0, fontFamily:"'Syne',sans-serif", fontSize:'0.95rem', fontWeight:800, color:'#fff', lineHeight:1.2 }}>
                  Let's make this{' '}
                  <span style={{ background:`linear-gradient(90deg, ${C.gold}, ${C.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>official</span>
                </h3>
                <p style={{ margin:'0.22rem 0 0', fontSize:'0.7rem', color:'rgba(255,255,255,0.35)', lineHeight:1.5, fontFamily:"'DM Sans',sans-serif" }}>Sanele will personally follow up within 24 hours.</p>
                <HeritageStrip style={{ marginTop:'0.5rem' }} />
              </div>
              <form onSubmit={submit}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginBottom:'0.48rem' }}>
                  <LeadField label="Your Name" name="name" placeholder="e.g. Sipho" value={form.name} onChange={handle} required />
                  <LeadField label="Business" name="company" placeholder="Company name" value={form.company} onChange={handle} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginBottom:'0.48rem' }}>
                  <LeadField label="Email" name="email" type="email" placeholder="you@business.co.za" value={form.email} onChange={handle} required />
                  <LeadField label="WhatsApp" name="phone" type="tel" placeholder="+27 82..." value={form.phone} onChange={handle} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', marginBottom:'0.48rem' }}>
                  <LeadSelect label="Industry" name="industry" value={form.industry} onChange={handle} options={INDUSTRIES} required />
                  <LeadSelect label="How we help" name="service_interest" value={form.service_interest} onChange={handle} options={SERVICES} required />
                </div>
                <label style={{ display:'flex', gap:'0.5rem', cursor:'pointer', alignItems:'flex-start', marginBottom:'0.65rem' }}>
                  <div onClick={()=>setConsent(c=>!c)} style={{ width:14, height:14, flexShrink:0, marginTop:2, border:`1px solid ${consent?C.gold:'rgba(255,255,255,0.2)'}`, borderRadius:'3px', background:consent?'rgba(244,185,66,0.12)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', cursor:'pointer' }}>
                    {consent && <span style={{ color:C.gold, fontSize:'9px', lineHeight:1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize:'0.63rem', color:'rgba(255,255,255,0.32)', lineHeight:1.5, fontFamily:"'DM Sans',sans-serif" }}>
                    I consent to Inkanyezi Technologies contacting me per <span style={{color:C.gold}}>POPIA</span>. <span style={{color:C.orange}}>*</span>
                  </span>
                </label>
                <button type="submit" disabled={submitting||!consent} style={{ width:'100%', padding:'0.6rem', background:submitting||!consent?'rgba(244,185,66,0.1)':`linear-gradient(90deg, ${C.gold}, ${C.orange})`, border:'none', borderRadius:'6px', color:submitting||!consent?'rgba(255,255,255,0.2)':C.midnight, fontFamily:"'Space Mono',monospace", fontSize:'0.65rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', cursor:submitting||!consent?'not-allowed':'pointer', transition:'all 0.25s' }}>
                  {submitting ? 'Transmitting...' : '✦ Send My Details'}
                </button>
                <p style={{ textAlign:'center', fontSize:'0.56rem', color:'rgba(255,255,255,0.18)', margin:'0.5rem 0 0', fontFamily:"'Space Mono',monospace" }}>Durban, KZN 🇿🇦 · We are the signal in the noise.</p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FORMAT MESSAGE ───────────────────────────────────────────────────
function formatMessage(text: string) {
  if (!text) return '';
  return text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br/>');
}


// ════════════════════════════════════════════════════════════════════
// INKANYEZI DOOR — Pure tech, holographic, plasma energy
// ════════════════════════════════════════════════════════════════════
function DoorAnimationInline({ onComplete }: { onComplete: () => void }) {
  const leftRef  = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);
  const brainRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase]     = useState<'brain'|'opening'>('brain');
  const [doorPct, setDoorPct] = useState(0);
  const animRef  = useRef<number>(0);
  const tkRef    = useRef(0);

  const paintPanel = (canvas: HTMLCanvasElement, side: 'left'|'right', tk: number, op: number) => {
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const isL = side === 'left';
    ctx.clearRect(0, 0, W, H);

    // Base — void black
    ctx.fillStyle = '#0a1628'; ctx.fillRect(0,0,W,H);
    // Radial brightness boost — centre lit, edges dark like a real door
    const radial=ctx.createRadialGradient(W*0.5,H*0.5,0,W*0.5,H*0.5,W*0.9);
    radial.addColorStop(0,'rgba(30,60,110,0.55)');
    radial.addColorStop(0.6,'rgba(15,35,70,0.3)');
    radial.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=radial; ctx.fillRect(0,0,W,H);

    // Fine grid — holographic blueprint
    ctx.strokeStyle = 'rgba(120,180,255,0.14)'; ctx.lineWidth = 0.5;
    for(let x=0;x<W;x+=20){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=20){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Coarser accent grid
    ctx.strokeStyle = 'rgba(120,180,255,0.08)'; ctx.lineWidth = 1;
    for(let x=0;x<W;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    // Hexagonal microchip pattern
    const hr = 15, hw = hr*Math.sqrt(3);
    ctx.strokeStyle = 'rgba(244,185,66,0.14)'; ctx.lineWidth = 0.7;
    for(let row=-1;row<H/(hr*1.5)+1;row++){
      for(let col=-1;col<W/hw+1;col++){
        const cx=col*hw+(row%2===0?0:hw/2), cy=row*hr*1.5;
        ctx.beginPath();
        for(let i=0;i<6;i++){const a=(Math.PI/3)*i-Math.PI/6;ctx.lineTo(cx+hr*Math.cos(a),cy+hr*Math.sin(a));}
        ctx.closePath(); ctx.stroke();
      }
    }

    // Vertical data streams — falling code
    const cols = isL ? [W*0.18,W*0.38,W*0.62,W*0.82] : [W*0.18,W*0.38,W*0.62,W*0.82];
    cols.forEach((sx,ci) => {
      const chars=['01','10','AI','∑','λ','π','∞','⟨⟩','11','00','NN','ML'];
      for(let i=0;i<7;i++){
        const yPos=((tk*55*(0.7+ci*0.2)+i*(H/7))%H);
        const alpha=(0.08+0.1*Math.sin(tk+i+ci*2))*Math.max(0,1-op*2);
        ctx.fillStyle=`rgba(140,200,255,${alpha})`;
        ctx.font=`${7+i%2}px monospace`; ctx.textAlign='center';
        ctx.fillText(chars[(Math.floor(tk*2+i+ci*5))%chars.length],sx,yPos);
      }
    });

    // Horizontal circuit traces with pulse
    [H*0.15,H*0.3,H*0.5,H*0.7,H*0.85].forEach((y,i)=>{
      const p=0.4+0.5*Math.sin(tk*2+i*1.3);
      ctx.strokeStyle=`rgba(244,185,66,${0.18+p*0.22})`; ctx.lineWidth=1;
      ctx.beginPath();
      const mid=W/2;
      ctx.moveTo(0,y);
      ctx.lineTo(mid-30,y); ctx.lineTo(mid-18,y-9); ctx.lineTo(mid+18,y-9); ctx.lineTo(mid+30,y);
      ctx.lineTo(W,y); ctx.stroke();
      // Junction nodes
      [W*0.1, mid, W*0.9].forEach(nx=>{
        ctx.beginPath(); ctx.arc(nx,y,2,0,Math.PI*2);
        ctx.fillStyle=`rgba(244,185,66,${0.35+p*0.55})`; ctx.fill();
      });
    });

    // Scan line — system initialising
    const scanY=((tk*40)%(H+80))-40;
    const sg=ctx.createLinearGradient(0,scanY-25,0,scanY+25);
    sg.addColorStop(0,'rgba(100,160,255,0)');
    sg.addColorStop(0.4,`rgba(100,200,255,${0.05+op*0.03})`);
    sg.addColorStop(0.5,`rgba(180,220,255,${0.18+op*0.1})`);
    sg.addColorStop(0.6,`rgba(100,200,255,${0.05+op*0.03})`);
    sg.addColorStop(1,'rgba(100,160,255,0)');
    ctx.fillStyle=sg; ctx.fillRect(0,scanY-25,W,50);

    // Plasma energy conduit — fades to zero as door opens (eliminates trace line)
    const conduitAlpha = Math.max(0, 1 - op * 3);
    if (conduitAlpha > 0) {
      const cg=ctx.createLinearGradient(0,0,0,H);
      cg.addColorStop(0,'rgba(244,185,66,0)');
      cg.addColorStop(0.25,`rgba(244,185,66,${0.6*conduitAlpha})`);
      cg.addColorStop(0.5,`rgba(255,140,60,${0.8*conduitAlpha})`);
      cg.addColorStop(0.75,`rgba(244,185,66,${0.5*conduitAlpha})`);
      cg.addColorStop(1,'rgba(244,185,66,0)');
      ctx.fillStyle=cg; ctx.fillRect(isL?W-4:0,0,4,H);
    }

    // Edge bloom as doors open
    // Edge bloom — fades away completely as door opens to leave clean reveal
    const bloomAlpha = Math.max(0, 1 - op * 2.5);
    const eg=ctx.createLinearGradient(isL?W:0,0,isL?W-80:80,0);
    eg.addColorStop(0,`rgba(255,107,53,${(0.12+op*0.3)*bloomAlpha})`);
    eg.addColorStop(0.5,`rgba(244,185,66,${(0.05+op*0.1)*bloomAlpha})`);
    eg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=eg; ctx.fillRect(isL?W-80:0,0,80,H);

    // Precision frame — double line
    ctx.strokeStyle='rgba(244,185,66,0.35)'; ctx.lineWidth=1;
    ctx.strokeRect(5,5,W-10,H-10);
    ctx.strokeStyle='rgba(100,160,255,0.08)'; ctx.lineWidth=0.5;
    ctx.strokeRect(11,11,W-22,H-22);

    // Corner brackets — engineering precision
    const b=18;
    [[5,5],[5,H-5],[W-5,5],[W-5,H-5]].forEach(([bx,by])=>{
      ctx.strokeStyle='rgba(244,185,66,0.75)'; ctx.lineWidth=2;
      const mx=bx>W/2?-b:b, my=by>H/2?-b:b;
      ctx.beginPath(); ctx.moveTo(bx+mx,by); ctx.lineTo(bx,by); ctx.lineTo(bx,by+my); ctx.stroke();
    });

    // Panel ID — bottom
    ctx.font='7px monospace'; ctx.textAlign='center';
    ctx.fillStyle=`rgba(140,190,255,${0.5+0.15*Math.sin(tk*4)})`;
    ctx.fillText(isL?'◈ INK-L':'◈ INK-R',W/2,H-16);
    ctx.fillStyle='rgba(244,185,66,0.45)';
    ctx.fillText(isL?'UNIT·ALPHA':'UNIT·SIGMA',W/2,H-8);

    // ── LETTER — A on left panel (right side near seam), I on right panel (left side near seam)
    // Only appears during opening phase, fades out as doors slide away
    if(op > 0) {
      const letter = isL ? 'A' : 'I';
      // Position: near the inner seam edge of each panel
      // Left panel: letter on right side (near center seam) — x = rightmost quarter
      // Right panel: letter on left side (near center seam) — x = leftmost quarter
      const lx = isL ? W * 0.78 : W * 0.22;
      const ly = H * 0.5;
      const letterAlpha = Math.min(op * 3, 1) * Math.max(0, 1 - op * 1.2);
      if(letterAlpha > 0) {
        // Glow halo behind letter
        const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 55);
        lg.addColorStop(0, `rgba(244,185,66,${letterAlpha * 0.25})`);
        lg.addColorStop(0.5, `rgba(255,107,53,${letterAlpha * 0.1})`);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(lx, ly, 55, 0, Math.PI*2);
        ctx.fillStyle = lg; ctx.fill();
        // Letter itself
        ctx.save();
        ctx.font = 'bold 72px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#F4B942';
        ctx.shadowBlur = 20 * letterAlpha;
        ctx.fillStyle = `rgba(255,255,255,${letterAlpha})`;
        ctx.fillText(letter, lx, ly);
        ctx.restore();
        // Underline accent — tech style
        const uw = letter === 'I' ? 28 : 44;
        const ug = ctx.createLinearGradient(lx-uw/2, ly+44, lx+uw/2, ly+44);
        ug.addColorStop(0, 'rgba(244,185,66,0)');
        ug.addColorStop(0.5, `rgba(244,185,66,${letterAlpha * 0.8})`);
        ug.addColorStop(1, 'rgba(244,185,66,0)');
        ctx.fillStyle = ug; ctx.fillRect(lx-uw/2, ly+38, uw, 2);
      }
    }
  };

  useEffect(()=>{
    let raf:number;
    const loop=()=>{
      tkRef.current+=0.022;
      const op=phase==='opening'?doorPct:0;
      if(leftRef.current) paintPanel(leftRef.current,'left',tkRef.current,op);
      if(rightRef.current) paintPanel(rightRef.current,'right',tkRef.current,op);
      raf=requestAnimationFrame(loop);
    };
    loop(); return ()=>cancelAnimationFrame(raf);
  },[phase,doorPct]);

  // Brain / AI loading canvas
  useEffect(()=>{
    const canvas=brainRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d')!;
    const W=280,H=220; canvas.width=W; canvas.height=H;
    const CX=W/2,CY=H/2-10;
    const Ln=[{x:CX-52,y:CY-62},{x:CX-82,y:CY-32},{x:CX-88,y:CY+5},{x:CX-74,y:CY+40},{x:CX-48,y:CY+58},{x:CX-28,y:CY-28},{x:CX-38,y:CY+14},{x:CX-18,y:CY-55}];
    const Rn=[{x:CX+52,y:CY-62},{x:CX+82,y:CY-32},{x:CX+88,y:CY+5},{x:CX+74,y:CY+40},{x:CX+48,y:CY+58},{x:CX+28,y:CY-28},{x:CX+38,y:CY+14},{x:CX+18,y:CY-55}];
    const all=[...Ln,...Rn];
    const cs=[[0,5],[5,7],[7,0],[1,2],[2,3],[3,4],[4,6],[5,6],[8,13],[13,15],[15,8],[9,10],[10,11],[11,12],[12,14],[13,14],[5,13],[6,14]];
    const ps:{a:number;b:number;t:number;s:number}[]=[];
    const seed=()=>{const c=cs[Math.floor(Math.random()*cs.length)];ps.push({a:c[0],b:c[1],t:0,s:0.022+Math.random()*0.025});};
    for(let i=0;i<9;i++) seed();
    let tk=0; let raf2:number;
    const draw=()=>{
      ctx.clearRect(0,0,W,H); tk+=0.025;
      const ag=ctx.createRadialGradient(CX,CY,0,CX,CY,100);
      ag.addColorStop(0,'rgba(244,185,66,0.07)'); ag.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=ag; ctx.fillRect(0,0,W,H);
      cs.forEach(([a,b])=>{
        ctx.beginPath(); ctx.moveTo(all[a].x,all[a].y); ctx.lineTo(all[b].x,all[b].y);
        ctx.strokeStyle='rgba(244,185,66,0.18)'; ctx.lineWidth=0.8; ctx.stroke();
      });
      ctx.beginPath(); ctx.moveTo(CX,CY-78); ctx.lineTo(CX,CY+68);
      ctx.strokeStyle='rgba(244,185,66,0.1)'; ctx.lineWidth=1.5; ctx.stroke();
      for(let i=ps.length-1;i>=0;i--){
        const p=ps[i]; p.t+=p.s;
        if(p.t>=1){ps.splice(i,1);seed();continue;}
        const n1=all[p.a],n2=all[p.b]; if(!n1||!n2) continue;
        const px=n1.x+(n2.x-n1.x)*p.t,py=n1.y+(n2.y-n1.y)*p.t;
        const pg=ctx.createRadialGradient(px,py,0,px,py,9);
        pg.addColorStop(0,'#F4B942'); pg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(px,py,9,0,Math.PI*2); ctx.fillStyle=pg; ctx.fill();
        ctx.beginPath(); ctx.arc(px,py,2.5,0,Math.PI*2); ctx.fillStyle='#F4B942'; ctx.fill();
      }
      all.forEach((n,i)=>{
        const pls=0.4+0.5*Math.sin(tk*2.5+i*0.85);
        const ng=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,7);
        ng.addColorStop(0,`rgba(244,185,66,${pls*0.85})`); ng.addColorStop(1,'rgba(0,0,0,0)');
        ctx.beginPath(); ctx.arc(n.x,n.y,7,0,Math.PI*2); ctx.fillStyle=ng; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x,n.y,2.8,0,Math.PI*2);
        ctx.fillStyle=`rgba(255,220,120,${0.7+pls*0.3})`; ctx.fill();
      });
      ctx.save();
      ctx.shadowColor='#F4B942'; ctx.shadowBlur=20+7*Math.sin(tk);
      ctx.font='bold 60px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=`rgba(255,255,255,${0.82+0.18*Math.sin(tk*1.5)})`;
      ctx.fillText('AI',CX,CY+4); ctx.restore();
      ctx.font='9px monospace'; ctx.textAlign='center';
      ctx.fillStyle='rgba(244,185,66,0.5)';
      const bar='▮'.repeat((Math.floor(tk*4)%4)+1);
      ctx.fillText(`INKANYEZI OS  ${bar}`,CX,CY+82);
      raf2=requestAnimationFrame(draw);
    };
    draw();
    const t=setTimeout(()=>{cancelAnimationFrame(raf2);setPhase('opening');},2500);
    return ()=>{cancelAnimationFrame(raf2);clearTimeout(t);};
  },[]);

  useEffect(()=>{
    if(phase!=='opening') return;
    const dur=900,start=performance.now();
    const run=(now:number)=>{
      const p=Math.min((now-start)/dur,1);
      setDoorPct(1-Math.pow(1-p,3));
      if(p<1) animRef.current=requestAnimationFrame(run);
      else setTimeout(onComplete,60);
    };
    animRef.current=requestAnimationFrame(run); return ()=>cancelAnimationFrame(animRef.current);
  },[phase,onComplete]);

  const slide=doorPct*52;
  const brainFade=phase==='brain'?1:Math.max(0,1-doorPct*2.2);

  return (
    <div style={{position:'absolute',inset:0,display:'flex',overflow:'hidden',borderRadius:20}}>
      {/* LEFT DOOR */}
      <div style={{position:'absolute',top:0,left:0,bottom:0,width:'50%',zIndex:6,transform:`translateX(-${slide}%)`,overflow:'hidden'}}>
        <canvas ref={leftRef} width={185} height={580} style={{display:'block',width:'100%',height:'100%'}}/>

      </div>
      {/* RIGHT DOOR */}
      <div style={{position:'absolute',top:0,right:0,bottom:0,width:'50%',zIndex:6,transform:`translateX(${slide}%)`,overflow:'hidden'}}>
        <canvas ref={rightRef} width={185} height={580} style={{display:'block',width:'100%',height:'100%'}}/>

      </div>
      {/* BRAIN */}
      <div style={{position:'absolute',inset:0,zIndex:7,opacity:brainFade,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <canvas ref={brainRef} style={{width:280,height:220}}/>
      </div>
      {/* No center seam — panel plasma conduits provide the visual separation */}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════
function InkanyeziBotWidget() {
  const [isOpen, setIsOpen]   = useState(false);
  const [messages, setMessages] = useState([{
    role:'assistant',
    content:"Sawubona! 👋 I'm InkanyeziBot — your AI guide to automation for South African businesses.\n\nBy chatting, you agree to our POPIA-compliant data policy.\n\nWhat does your business do, and what's the biggest challenge slowing you down right now?",
  }]);
  const [input, setInput]             = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [sessionContext, setSessionContext] = useState<any>(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2,9)}`);
  const [showLeadForm, setShowLeadForm]           = useState(false);
  const [leadFormSubmitted, setLeadFormSubmitted] = useState(false);
  const [leadSubmitting, setLeadSubmitting]       = useState(false);
  const [showChips, setShowChips]   = useState(true);
  const [showGreeting, setShowGreeting]       = useState(false);
  const [greetingVisible, setGreetingVisible] = useState(false);
  const [showDoor, setShowDoor]               = useState(false);
  const [openKey, setOpenKey]                 = useState(0);

  const hasTriggered = useRef(false);
  const messagesEnd  = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior:'smooth' }); }, [messages, showLeadForm, isLoading]);

  // ════════════════════════════════════════════════════════════════════
  // MODERN SESSION MANAGEMENT
  // Best practices: sessionStorage, Visibility API, scroll depth,
  // returning visitor detection, active-time-only inactivity timer
  // ════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const STORAGE_KEY = 'inkanyezi_chat_session';
    const VISITOR_KEY = 'inkanyezi_visitor';
    const INACTIVITY_MS = 20 * 60 * 1000;  // 20min of ACTIVE time
    const GREETING_SCROLL = 0.35;           // trigger greeting at 35% scroll depth

    // ── 1. RETURNING VISITOR DETECTION ─────────────────────────────
    // localStorage persists across sessions — detects returning visitors
    const visitCount = parseInt(localStorage.getItem(VISITOR_KEY) || '0') + 1;
    localStorage.setItem(VISITOR_KEY, String(visitCount));

    // Returning visitor gets a more personalised proactive greeting
    if (visitCount > 1) {
      const savedName = localStorage.getItem('inkanyezi_name');
      // Will be used by the greeting popup to personalise the message
      (window as any).__inkanyezi_returning = { count: visitCount, name: savedName };
    }

    // ── 2. SESSION STATE PERSISTENCE (sessionStorage) ──────────────
    // sessionStorage clears when the tab is closed — ideal for chat
    // Restore any in-progress conversation if user refreshed the page
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.messages?.length > 1) {
          setMessages(parsed.messages);
          setShowChips(false);
          if (parsed.sessionContext) setSessionContext(parsed.sessionContext);
          // Don't auto-reopen — user can click the bubble to continue
        }
      }
    } catch {}

    // ── 3. ACTIVE-TIME-ONLY INACTIVITY TIMER ───────────────────────
    // Only count time when the page is VISIBLE and FOCUSED
    // Prevents resetting just because user left the tab open overnight
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let isPageVisible = !document.hidden;
    let isPageFocused = document.hasFocus();

    const doReset = () => {
      setIsOpen(false);
      setShowDoor(false);
      setShowGreeting(false);
      setGreetingVisible(false);
      setMessages([{
        role: 'assistant',
        content: "Sawubona! 👋 I'm InkanyeziBot — your AI guide to automation for South African businesses.\n\nBy chatting, you agree to our POPIA-compliant data policy.\n\nWhat does your business do, and what's the biggest challenge slowing you down right now?",
      }]);
      setInput('');
      setShowLeadForm(false);
      setLeadFormSubmitted(false);
      setShowChips(true);
      setSessionContext(null);
      hasTriggered.current = false;
      sessionStorage.removeItem(STORAGE_KEY);
    };

    const startTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (isPageVisible && isPageFocused) {
        inactivityTimer = setTimeout(doReset, INACTIVITY_MS);
      }
    };

    const stopTimer = () => {
      if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
    };

    // Activity events — restart the timer on any interaction
    const onActivity = () => { if (isPageVisible && isPageFocused) startTimer(); };
    const activityEvents = ['mousedown','keydown','touchstart','scroll','click'];
    activityEvents.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    // ── 4. VISIBILITY API — pause timer when tab is hidden ─────────
    const onVisibilityChange = () => {
      isPageVisible = !document.hidden;
      if (isPageVisible && isPageFocused) startTimer();
      else stopTimer();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // ── 5. WINDOW FOCUS/BLUR — pause when window loses focus ───────
    const onFocus = () => { isPageFocused = true; startTimer(); };
    const onBlur  = () => { isPageFocused = false; stopTimer(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);

    // ── 6. SCROLL DEPTH TRIGGER — smarter than time-only ───────────
    // Trigger proactive greeting when user scrolls 35% of page
    // Shows genuine interest — more relevant than just time on page
    let greetingFired = false;
    const onScroll = () => {
      if (greetingFired) return;
      const scrolled = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      if (scrolled >= GREETING_SCROLL) {
        greetingFired = true;
        // Only show if chat isn't already open
        // (The existing 8s timer will handle this via setShowGreeting)
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // ── 7. SAVE SESSION ON MESSAGE CHANGE ──────────────────────────
    // Will be called from a separate effect below

    startTimer(); // Begin tracking

    return () => {
      stopTimer();
      activityEvents.forEach(e => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // ── SAVE CONVERSATION TO sessionStorage on every message ─────────
  // Allows page refresh to restore the conversation seamlessly
  useEffect(() => {
    if (messages.length <= 1) return; // Don't save just the greeting
    try {
      sessionStorage.setItem('inkanyezi_chat_session', JSON.stringify({
        messages: messages.slice(-20), // Keep last 20 messages only
        sessionContext,
        savedAt: Date.now(),
      }));
      // Save customer name to localStorage for returning visitor greeting
      if (sessionContext?.name) {
        localStorage.setItem('inkanyezi_name', sessionContext.name);
      }
    } catch {}
  }, [messages, sessionContext]);

  // Proactive greeting after 8s
  useEffect(() => {
    const show = setTimeout(() => { if (!isOpen) { setShowGreeting(true); setTimeout(() => setGreetingVisible(true), 50); } }, 8000);
    const hide = setTimeout(() => { setGreetingVisible(false); setTimeout(() => setShowGreeting(false), 400); }, 20000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  useEffect(() => {
    if (isOpen) { setGreetingVisible(false); setTimeout(() => setShowGreeting(false), 400); }
  }, [isOpen]);

  // Lead form trigger
  useEffect(() => {
    if (hasTriggered.current || leadFormSubmitted || !sessionContext) return;
    const userMsgs = messages.filter(m => m.role==='user');
    const lastMsg  = userMsgs[userMsgs.length-1]?.content||'';
    const { shouldShow } = scoreConversation(sessionContext, userMsgs.length, lastMsg);
    if (shouldShow) { hasTriggered.current = true; setTimeout(() => setShowLeadForm(true), 1200); }
  }, [messages, sessionContext, leadFormSubmitted]);

  const sendMessage = async (text?: string) => {
    const content = (text||input).trim();
    if (!content||isLoading) return;
    setShowChips(false);
    const userMessage  = { role:'user', content };
    const newMessages  = [...messages, userMessage];
    setMessages(newMessages); setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);
    try {
      const res  = await fetch('https://inkanyezibot-v2.vercel.app/api/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ messages:newMessages, sessionId }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role:'assistant', content:data.message }]);
      if (data.context) setSessionContext(data.context);
    } catch {
      setMessages([...newMessages, { role:'assistant', content:'Something went wrong — please try again.' }]);
    } finally { setIsLoading(false); }
  };

  const handleLeadSubmit = useCallback(async (formData: any) => {
    setLeadSubmitting(true);
    try {
      const userMsgs = messages.filter(m => m.role==='user');
      const lastMsg  = userMsgs[userMsgs.length-1]?.content||'';
      const { score } = scoreConversation(sessionContext, userMsgs.length, lastMsg);
      const payload = {
        name:             formData.name    || sessionContext?.name     || '',
        email:            formData.email   || sessionContext?.email    || '',
        phone:            formData.phone   || sessionContext?.whatsapp || '',
        company:          formData.company || sessionContext?.business || '',
        industry:         formData.industry|| sessionContext?.industry || '',
        service_interest: formData.service_interest || '',
        message:          formData.message || sessionContext?.pain_point || '',
        has_email:        (formData.email||sessionContext?.email)    ? 'true':'false',
        has_whatsapp:     (formData.phone||sessionContext?.whatsapp) ? 'true':'false',
        source:           'lovable-site-lead-form',
        session_id:       sessionId,
        message_count:    userMsgs.length,
        conversation_summary: messages.slice(-6).map(m=>`${m.role==='user'?'Customer':'Bot'}: ${m.content}`).join('\n'),
        qualification_stage: sessionContext?.qualification_stage||'new',
        pain_point:          sessionContext?.pain_point||'',
        budget_signal:       sessionContext?.budget_signal||'',
        demo_booked:         sessionContext?.demo_booked||false,
        reference_number:    sessionContext?.referenceNumber||'',
        trigger_score:       score,
        timestamp:           new Date().toISOString(),
        sast_time:           new Date().toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}),
      };
      const url = 'https://hook.eu1.make.com/rq1e6yppdpa6orvw87fg1xabekvq4id8';
      await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      setLeadFormSubmitted(true); setShowLeadForm(false);
      setTimeout(() => {
        setMessages(prev => [...prev, { role:'assistant', content:`✦ Signal locked in${formData.name?`, ${formData.name.split(' ')[0]}`:''}! Sanele will personally reach out within 24 hours.\n\nIs there anything else you'd like to know about how we can transform ${formData.company||'your business'}?` }]);
      }, 700);
      return { success:true };
    } catch { return { success:false }; }
    finally { setLeadSubmitting(false); }
  }, [messages, sessionContext, sessionId]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        @keyframes ping { 0%{transform:scale(1);opacity:0.8;} 70%{transform:scale(2.2);opacity:0;} 100%{transform:scale(2.2);opacity:0;} }
        @keyframes floatBubble { 0%,100%{transform:translateY(0) scale(1);box-shadow:0 0 30px rgba(249,115,22,0.55),0 0 60px rgba(249,115,22,0.2);} 50%{transform:translateY(-6px) scale(1.03);box-shadow:0 0 40px rgba(249,115,22,0.7),0 0 80px rgba(249,115,22,0.3);} }
        @keyframes orbitRing { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
        @keyframes windowSlide { 
          0%  { opacity:0; transform:translateY(30px) scaleY(0.05) scaleX(0.8); transform-origin: bottom center; }
          40% { opacity:1; transform:translateY(0) scaleY(0.6) scaleX(1); transform-origin: bottom center; }
          70% { transform:translateY(0) scaleY(1.02) scaleX(1); transform-origin: bottom center; }
          100%{ transform:translateY(0) scaleY(1) scaleX(1); transform-origin: bottom center; }
        }
        @keyframes headerShimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
        @keyframes shimmerBar { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
        @keyframes msgFadeUp { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
        @keyframes thinkPulse { 0%,80%,100%{opacity:0.15;transform:scale(0.8);} 40%{opacity:1;transform:scale(1);} }
        @keyframes chipAppear { from{opacity:0;transform:translateX(-6px);} to{opacity:1;transform:translateX(0);} }
        @keyframes rocketGlow { 0%,100%{box-shadow:0 0 14px rgba(249,115,22,0.5);} 50%{box-shadow:0 0 22px rgba(249,115,22,0.8),0 0 40px rgba(249,115,22,0.3);} }
        @keyframes greetingPop { from{opacity:0;transform:translateY(10px) scale(0.95);} to{opacity:1;transform:translateY(0) scale(1);} }
        .ink-msg { animation: msgFadeUp 0.3s ease forwards; }
        .ink-chip { animation: chipAppear 0.3s ease forwards; transition: all 0.2s !important; }
        .ink-chip:hover { background: rgba(244,185,66,0.12) !important; border-color: #F4B942 !important; color: #1a1a2e !important; transform: translateX(2px); }
        .ink-rocket { animation: rocketGlow 2s ease infinite; }
        .ink-rocket:hover:not(:disabled) { transform: scale(1.08) rotate(-5deg) !important; box-shadow: 0 0 30px rgba(249,115,22,0.9) !important; }
        .ink-msgs::-webkit-scrollbar { width: 3px; }
        .ink-msgs::-webkit-scrollbar-track { background: transparent; }
        .ink-msgs::-webkit-scrollbar-thumb { background: rgba(244,185,66,0.4); border-radius: 2px; }
        .ink-textarea::placeholder { color: rgba(100,110,130,0.5) !important; }
        @keyframes closePulse {
          0%   { box-shadow: 0 0 0 0 rgba(229,62,62,0.6), 0 4px 20px rgba(229,62,62,0.4); transform: scale(1); }
          50%  { box-shadow: 0 0 0 10px rgba(229,62,62,0), 0 4px 20px rgba(229,62,62,0.4); transform: scale(1.06); }
          100% { box-shadow: 0 0 0 0 rgba(229,62,62,0), 0 4px 20px rgba(229,62,62,0.4); transform: scale(1); }
        }
      `}</style>

      {/* ── PROACTIVE GREETING ── */}
      {showGreeting && !isOpen && (
        <div onClick={()=>{ setShowDoor(true); setOpenKey(k=>k+1); }} style={{ position:'fixed', bottom:100, right:24, zIndex:10001, maxWidth:260, cursor:'pointer', opacity:greetingVisible?1:0, transform:greetingVisible?'translateY(0) scale(1)':'translateY(10px) scale(0.95)', transition:'opacity 0.35s ease, transform 0.35s ease' }}>
          <div style={{ background:'linear-gradient(145deg, rgba(15,27,53,0.98), rgba(10,22,40,0.98))', border:'1px solid rgba(249,115,22,0.25)', borderRadius:16, borderBottomRightRadius:4, padding:'12px 14px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:1.5, background:'linear-gradient(90deg, transparent, rgba(244,185,66,0.6), transparent)' }} />
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg, #FF6B35, #c2410c)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, boxShadow:'0 0 10px rgba(249,115,22,0.5)' }}>⭐</div>
              <div>
                <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#fff', fontFamily:"'Syne',sans-serif" }}>InkanyeziBot</div>
                <div style={{ fontSize:'0.55rem', color:'#f97316', fontFamily:"'Space Mono',monospace", display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', display:'inline-block' }} /> Online now
                </div>
              </div>
            </div>
            <p style={{ margin:0, fontSize:'0.78rem', color:'rgba(255,255,255,0.85)', lineHeight:1.55, fontFamily:"'DM Sans',sans-serif" }}>
              {(() => {
                const r = (window as any).__inkanyezi_returning;
                if (r?.count > 1 && r?.name) {
                  return <>Welcome back, <span style={{color:'#F4B942',fontWeight:600}}>{r.name}</span>! 👋 Ready to continue where we left off?</>;
                } else if (r?.count > 1) {
                  return <>Welcome back! 👋 <span style={{color:'#F4B942',fontWeight:600}}>Shall we continue exploring AI for your business?</span></>;
                } else {
                  return <>Sawubona! 👋 Automating a South African business?{' '}<span style={{color:'#F4B942',fontWeight:600}}>I can show you how in 3 minutes.</span></>;
                }
              })()}
            </p>
            <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:4, fontSize:'0.65rem', color:'rgba(255,255,255,0.4)', fontFamily:"'Space Mono',monospace" }}>
              <span>Tap to chat</span><span style={{color:'#F4B942'}}>→</span>
            </div>
          </div>
          <div style={{ position:'absolute', bottom:-7, right:18, width:0, height:0, borderLeft:'8px solid transparent', borderRight:'8px solid transparent', borderTop:'8px solid rgba(15,27,53,0.98)' }} />
        </div>
      )}

      {/* ── FLOATING BUBBLE ── */}
      <button
        onClick={()=>{ if(!isOpen){ setShowDoor(true); setOpenKey(k=>k+1); } else { setIsOpen(false); } }}
        aria-label={isOpen?'Close InkanyeziBot':'Open InkanyeziBot'}
        style={{
          position:'fixed', bottom:24, right:24, zIndex:99999,
          width:64, height:64, borderRadius:'50%',
          background: isOpen
            ? 'linear-gradient(135deg, #e53e3e, #c53030)'
            : 'linear-gradient(135deg, #FF6B35, #c2410c)',
          border: isOpen
            ? '2.5px solid rgba(229,62,62,0.6)'
            : '2px solid rgba(249,115,22,0.45)',
          cursor:'pointer', fontSize: isOpen ? 22 : 26,
          animation: isOpen ? 'closePulse 1.8s ease-in-out infinite' : 'floatBubble 3s ease-in-out infinite',
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'background 0.3s, border 0.3s',
          boxShadow: isOpen
            ? '0 0 0 0 rgba(229,62,62,0.4), 0 4px 20px rgba(229,62,62,0.4)'
            : '0 0 30px rgba(249,115,22,0.55)',
        }}>
        {/* Orbit ring — only when closed */}
        {!isOpen && !showDoor && (
          <div style={{ position:'absolute', width:64, height:64, animation:'orbitRing 4s linear infinite', pointerEvents:'none' }}>
            <div style={{ position:'absolute', top:-3, left:'50%', width:7, height:7, borderRadius:'50%', background:C.gold, transform:'translateX(-50%)', boxShadow:`0 0 10px ${C.gold}` }} />
          </div>
        )}
        {/* Close X — animated spinning lines */}
        {isOpen ? (
          <div style={{ position:'relative', width:24, height:24 }}>
            <div style={{
              position:'absolute', top:'50%', left:0, right:0, height:2.5,
              background:'#fff', borderRadius:2,
              transform:'translateY(-50%) rotate(45deg)',
              boxShadow:'0 0 6px rgba(255,255,255,0.8)',
            }}/>
            <div style={{
              position:'absolute', top:'50%', left:0, right:0, height:2.5,
              background:'#fff', borderRadius:2,
              transform:'translateY(-50%) rotate(-45deg)',
              boxShadow:'0 0 6px rgba(255,255,255,0.8)',
            }}/>
          </div>
        ) : (
          <span style={{ position:'relative', zIndex:1 }}>⭐</span>
        )}
        {/* Close label — appears above button */}
        {isOpen && (
          <div style={{
            position:'absolute', bottom:'calc(100% + 8px)', left:'50%',
            transform:'translateX(-50%)',
            background:'rgba(229,62,62,0.9)',
            color:'#fff', fontSize:'0.55rem', fontFamily:"'Space Mono',monospace",
            letterSpacing:'0.1em', padding:'3px 8px', borderRadius:4,
            whiteSpace:'nowrap', pointerEvents:'none',
            boxShadow:'0 2px 8px rgba(229,62,62,0.4)',
          }}>CLOSE</div>
        )}
      </button>

      {/* ── DOOR ANIMATION — appears over chat while loading ── */}
      {showDoor && !isOpen && (
        <div key={openKey} style={{
          position:'fixed', bottom:100, right:24, width:370, height:580,
          zIndex:99999, borderRadius:20, overflow:'hidden',
          boxShadow:'0 0 0 1px rgba(244,185,66,0.1), 0 25px 70px rgba(0,0,0,0.7)',
        }}>
          <DoorAnimationInline onComplete={() => { setShowDoor(false); setIsOpen(true); }} />
        </div>
      )}

      {/* ── CHAT WINDOW — only mounts when isOpen ── */}
      {isOpen && (
        <div style={{
          position:'fixed', bottom:100, right:24, width:370, height:580,
          display:'flex', flexDirection:'column',
          zIndex:99998, borderRadius:20, overflow:'hidden',
          background:'#FAFBFC',
          boxShadow:'0 0 0 1px rgba(244,185,66,0.15), 0 8px 40px rgba(0,0,0,0.25)',
        }}>

          {/* Header */}
          <div style={{
            position:'relative', zIndex:2, flexShrink:0,
            background:'linear-gradient(135deg, #ffffff 0%, #f8f6f0 100%)',
            borderBottom:'1px solid rgba(244,185,66,0.3)',
            boxShadow:'0 1px 8px rgba(0,0,0,0.06)',
            padding:'12px 16px', display:'flex', alignItems:'center', gap:12,
          }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${C.gold}, ${C.orange}, ${C.gold}, transparent)`, backgroundSize:'200% 100%', animation:'headerShimmer 3s linear infinite' }} />
            <div style={{ position:'relative', flexShrink:0 }}>
              <div style={{ width:42, height:42, borderRadius:'50%', background:'linear-gradient(135deg, #FF6B35, #c2410c)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:'0 0 16px rgba(249,115,22,0.6)' }}>⭐</div>
              <div style={{ position:'absolute', inset:-4, animation:'orbitRing 5s linear infinite', pointerEvents:'none' }}>
                <div style={{ position:'absolute', top:0, left:'50%', width:5, height:5, borderRadius:'50%', background:C.gold, transform:'translateX(-50%)', boxShadow:`0 0 6px ${C.gold}` }} />
              </div>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:15, color:'#1a1a2e', letterSpacing:'-0.01em' }}>InkanyeziBot <span style={{ fontSize:11, color:C.gold, fontFamily:"'Space Mono',monospace", fontWeight:400 }}>✦</span></div>
              <div style={{ fontSize:11, color:'#F4B942', display:'flex', alignItems:'center', gap:5, fontFamily:"'DM Sans',sans-serif" }}>
                <SignalDot /><span>Online · AI Automation · Durban, ZA</span>
              </div>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{ fontSize:10, color:'rgba(100,80,20,0.5)', fontFamily:"'Space Mono',monospace" }}>🇿🇦 SA AI</div>
              <HeritageStrip style={{ justifyContent:'flex-end', marginTop:3 }} />
            </div>
          </div>

          {/* Messages */}
          <div className="ink-msgs" style={{ flex:1, overflowY:'auto', padding:'14px 14px 6px', display:'flex', flexDirection:'column', gap:10, background:'#F5F7FA' }}>
            {messages.map((msg,i) => (
              <div key={i} className="ink-msg" style={{ display:'flex', justifyContent:msg.role==='user'?'flex-end':'flex-start', alignItems:'flex-end', gap:6, animationDelay:`${i*0.03}s` }}>
                {msg.role==='assistant' && (
                  <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg, #FF6B35, #c2410c)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, boxShadow:'0 0 8px rgba(249,115,22,0.4)' }}>⭐</div>
                )}
                <div style={{ maxWidth:'78%', padding:'10px 13px', borderRadius:14, fontSize:13, lineHeight:1.6, wordBreak:'break-word', background:msg.role==='user'?'linear-gradient(135deg, #F4B942, #FF6B35)':'#FFFFFF', color:'#1a1a2e', border:msg.role==='user'?'none':'1px solid rgba(244,185,66,0.3)', boxShadow:msg.role==='user'?'0 2px 12px rgba(244,185,66,0.25)':'0 1px 4px rgba(0,0,0,0.06)', borderBottomLeftRadius:msg.role==='assistant'?3:14, borderBottomRightRadius:msg.role==='user'?3:14, fontFamily:"'DM Sans',sans-serif" }}
                  dangerouslySetInnerHTML={{ __html:formatMessage(msg.content) }} />
              </div>
            ))}

            {/* Quick chips */}
            {showChips && messages.length===1 && (
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
                <div style={{ fontSize:'0.6rem', color:'rgba(100,110,130,0.6)', fontFamily:"'Space Mono',monospace", letterSpacing:'0.1em', textAlign:'center', marginBottom:2 }}>Quick questions:</div>
                {CHIPS.map((chip,i) => (
                  <button key={i} className="ink-chip" onClick={()=>sendMessage(chip.msg)}
                    style={{ background:'#FFFFFF', border:'1px solid rgba(244,185,66,0.35)', borderRadius:8, padding:'8px 12px', color:'#1a1a2e', fontSize:12, cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans',sans-serif", animationDelay:`${i*0.08}s`, opacity:0 }}>
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Lead form */}
            {showLeadForm && !leadFormSubmitted && (
              <ChatLeadForm onSubmit={handleLeadSubmit} onDismiss={()=>setShowLeadForm(false)} sessionContext={sessionContext} submitting={leadSubmitting} />
            )}

            {/* Thinking */}
            {isLoading && (
              <div style={{ display:'flex', alignItems:'flex-end', gap:6 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'linear-gradient(135deg, #FF6B35, #c2410c)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, flexShrink:0 }}>⭐</div>
                <div style={{ background:'#FFFFFF', padding:'12px 16px', borderRadius:14, borderBottomLeftRadius:3, border:'1px solid rgba(244,185,66,0.25)', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', display:'flex', alignItems:'center', gap:5 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#F4B942', opacity:0.4, animation:'thinkPulse 1.2s ease-in-out infinite', animationDelay:`${i*0.2}s` }} />)}
                </div>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          <div style={{ flexShrink:0, padding:'10px 12px 12px', borderTop:'1px solid rgba(244,185,66,0.2)', background:'#FFFFFF' }}>
            <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
              <textarea ref={textareaRef} value={input} className="ink-textarea"
                onChange={e => { setInput(e.target.value); e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,96)+'px'; }}
                onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Type your message..." rows={1}
                style={{ flex:1, padding:'9px 13px', borderRadius:14, background:'#F5F7FA', border:'1px solid rgba(244,185,66,0.3)', color:'#1a1a2e', outline:'none', fontSize:13, resize:'none', lineHeight:1.5, wordBreak:'break-word', overflowY:'auto', maxHeight:96, fontFamily:"'DM Sans',sans-serif", transition:'border-color 0.2s' }}
                onFocus={e=>e.target.style.borderColor='#F4B942'}
                onBlur={e=>e.target.style.borderColor='rgba(244,185,66,0.3)'}
              />
              <button className="ink-rocket" onClick={()=>sendMessage()} disabled={isLoading||!input.trim()}
                style={{ width:42, height:42, borderRadius:'50%', flexShrink:0, background:isLoading||!input.trim()?'rgba(249,115,22,0.3)':'linear-gradient(135deg, #FF6B35, #c2410c)', border:'none', cursor:isLoading||!input.trim()?'not-allowed':'pointer', color:C.white, fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s', opacity:isLoading||!input.trim()?0.5:1 }}>
                🚀
              </button>
            </div>
            <div style={{ marginTop:6, textAlign:'center', fontSize:10, color:'rgba(150,120,60,0.6)', fontFamily:"'Space Mono',monospace", letterSpacing:'0.05em' }}>
              ✦ INKANYEZI TECHNOLOGIES · WE ARE THE SIGNAL IN THE NOISE ✦
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// WHATSAPP WIDGET
// ════════════════════════════════════════════════════════════════════
function WhatsAppWidget() {
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 1500); return () => clearTimeout(t); }, []);
  return (
    <>
      <style>{`
        @keyframes waPulse { 0%{box-shadow:0 0 0 0 rgba(37,211,102,0.6);} 70%{box-shadow:0 0 0 14px rgba(37,211,102,0);} 100%{box-shadow:0 0 0 0 rgba(37,211,102,0);} }
        @keyframes waFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-4px);} }
        @keyframes waFade { from{opacity:0;transform:translateX(8px);} to{opacity:1;transform:translateX(0);} }
        .wa-btn { animation: waPulse 2.5s ease-out infinite, waFloat 3s ease-in-out infinite; transition: all 0.25s ease !important; }
        .wa-btn:hover { transform: scale(1.1) !important; box-shadow: 0 8px 30px rgba(37,211,102,0.6) !important; animation: none !important; }
        .wa-tip { animation: waFade 0.2s ease forwards; }
      `}</style>
      <div style={{ position:'fixed', bottom:96, right:28, zIndex:10002, display:'flex', alignItems:'center', gap:10, opacity:visible?1:0, transform:visible?'scale(1)':'scale(0.8)', transition:'opacity 0.4s ease, transform 0.4s ease' }}>
        {hovered && (
          <div className="wa-tip" style={{ background:'linear-gradient(135deg, rgba(10,22,40,0.98), rgba(4,8,15,0.98))', border:'1px solid rgba(37,211,102,0.3)', borderRadius:10, padding:'8px 14px', whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,0.5)', position:'relative' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#fff', fontFamily:"'Syne',sans-serif", marginBottom:2 }}>Chat with Sanele</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontFamily:"'Space Mono',monospace" }}>+27 65 880 4122</div>
            <div style={{ position:'absolute', right:-6, top:'50%', transform:'translateY(-50%)', width:0, height:0, borderTop:'6px solid transparent', borderBottom:'6px solid transparent', borderLeft:'6px solid rgba(37,211,102,0.3)' }} />
          </div>
        )}
        <a href="https://wa.me/27658804122?text=Sawubona%21%20I%20visited%20Inkanyezi%20Technologies%20and%20would%20like%20to%20know%20more%20about%20AI%20automation%20for%20my%20business." target="_blank" rel="noopener noreferrer" className="wa-btn" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
          style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg, #25D366, #128C7E)', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', flexShrink:0 }} aria-label="Chat with us on WhatsApp">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="28" height="28">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════
const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <CustomCursor />
      <GlobalStarfield />
      <ShootingStars />
      <div className="relative z-10">
        <Header />
        <main>
          <HeroSection />
          <ProblemSection />
          <SolutionSection />
          <HowItWorks />
          <ROICalculator />
          <ChatDemoFixed />
          <PhilosophySection />
          <ContactSection />
        </main>
        <Footer />
      </div>
      {/* Native React widgets — no iframe, fully interactive */}
      <InkanyeziBotWidget />
      <WhatsAppWidget />
    </div>
  );
};

export default Index;
