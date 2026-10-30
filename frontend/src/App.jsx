import { Component, useEffect, useMemo, useRef, useState } from "react";
import { api, apiFetch, API_BASE_URL } from "./services/api";
import "./App.css";

const nav = [["Dashboard","D"],["My Papers","P"],["Compare Papers","↔"],["Research Workspace","✧"],["AI Chat","AI"],["Reports","R"],["Voice Review","V"],["Find Papers","S"],["Find Datasets","D"],["Research Guide","G"],["About Us","i"],["Settings","⚙"]];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const signInGuides = [
  { title:"Begin at your dashboard", text:"See your paper library, completed analyses, and what needs attention at a glance.", mark:"HOME", kind:"overview" },
  { title:"Upload a research paper", text:"Choose a PDF or DOCX up to 20 MB. Your file stays in your private workspace.", mark:"PDF", kind:"upload" },
  { title:"Read the analysis", text:"Open a paper to review its research question, method, results, and limitations.", mark:"AI", kind:"analysis" },
  { title:"Check the evidence", text:"Follow source quotes and page references back to the paper before relying on a claim.", mark:"p. 08", kind:"evidence" },
  { title:"Ask questions about a paper", text:"Use AI Chat to ask focused questions and inspect the evidence behind its answer.", mark:"ASK", kind:"chat" },
  { title:"Compare selected papers", text:"Compare methods, datasets, findings, and limitations across papers in your library.", mark:"A / B", kind:"compare" },
  { title:"Save notes and highlights", text:"Keep important quotes and your own page-linked notes with each paper.", mark:"NOTE", kind:"notes" },
  { title:"Plan your research", text:"Use Research Workspace to organize a topic, question, sources, and drafts.", mark:"PLAN", kind:"plan" },
  { title:"Build your research skills", text:"Open Research Guide for a step-by-step path from choosing a topic to publication.", mark:"GUIDE", kind:"guide" },
  { title:"Export and review", text:"Save reports and drafts, then check every citation and important result against its source.", mark:"DONE", kind:"export" },
];
const themeOptions = [["midnight","Midnight",["#080F1B","#111D2E","#C6F36A"]],["light","Light",["#F3F6FB","#FFFFFF","#3478F6"]],["ocean","Ocean",["#061923","#0B2A3B","#56DBC7"]],["red-black","Red Black",["#0D0D0F","#1A1517","#FF4D5A"]],["green-black","Green Black",["#07120D","#102018","#5EE68A"]],["rose-ivory","Rose Ivory",["#FFF5F6","#FFFFFF","#C24166"]],["sky-mist","Sky Mist",["#F0F8FF","#FFFFFF","#1675C7"]],["lavender-cloud","Lavender Cloud",["#F7F4FF","#FFFFFF","#7653C6"]],["sandstone","Sandstone",["#FBF7EF","#FFFDF7","#A35B27"]],["mint-paper","Mint Paper",["#F1FBF6","#FFFFFF","#17845C"]]];
const normalizeTheme = value => value === "violet" ? "lavender-cloud" : value === "forest" ? "green-black" : themeOptions.some(([id]) => id === value) ? value : "midnight";
const sections = [["Research Objective", "research_objective"], ["Research Problem", "research_problem"], ["Methodology", "methodology"], ["Results", "results"], ["Problems Addressed", "problems_solved"], ["Proposed Solution", "proposed_solution"], ["Key Findings", "key_findings"], ["Conclusion", "conclusion"], ["Limitations", "limitations"], ["Future Research", "future_research"], ["Summary", "summary"]];
// Remove credentials left by older builds that stored bearer tokens in localStorage.
localStorage.removeItem("papermind-token");
const initialUser = () => { try { return JSON.parse(localStorage.getItem("papermind-user")); } catch { return null; } };
const normalizeSpeechText = text => String(text || "").replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2");

const makeTask = (kind, name, estimateSeconds) => ({ kind, name, estimateSeconds, startedAt: Date.now() });
const estimateAiSeconds = source => { const chars = typeof source === "number" ? source : source?.length || 18000; return Math.min(75, Math.max(20, Math.ceil(chars / 1400 + 12))); };

function ProcessingBanner({ task }) {
  const [now, setNow] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  const elapsed = Math.max(0, Math.floor((now - task.startedAt) / 1000));
  const progress = Math.min(94, Math.round(100 * (1 - Math.exp(-elapsed / (task.estimateSeconds * 0.58)))));
  const remaining = Math.max(0, task.estimateSeconds - elapsed);
  const timeLabel = remaining >= 60 ? `about ${Math.ceil(remaining / 60)} min left` : `${remaining} sec left`;
  const title = task.kind === "upload" ? "Reading your document" : task.kind === "chat" ? "Finding evidence in your paper" : "Analyzing your paper";
  const subtitle = elapsed > task.estimateSeconds ? "Taking longer than expected — still working" : `Estimated time: ${timeLabel}`;
  return <section className="processing-card" role="status" aria-live="polite">
    <div className="processing-orb">✦</div>
    <div className="processing-copy"><div className="processing-topline"><div><strong>{title}</strong><small>{task.name}</small></div><div className="processing-score"><small>estimated progress</small>{progress}<span>%</span></div></div>
      <div className="processing-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="processing-meta"><span>{subtitle}</span><span>Elapsed {elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`}</span></div>
    </div>
  </section>;
}

function GuideIllustration({ slide }) {
  return <svg className={`signin-guide-art art-${slide.kind}`} viewBox="0 0 380 220" role="img" aria-label={`${slide.title} illustration`}>
    <defs><linearGradient id="guide-card" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f7fbff"/><stop offset="1" stopColor="#dce8f6"/></linearGradient><linearGradient id="guide-accent" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d9ff80"/><stop offset="1" stopColor="#8de3c4"/></linearGradient></defs>
    <circle cx="192" cy="111" r="96" fill="#c6f36a" opacity=".09"/><circle cx="192" cy="111" r="72" fill="none" stroke="#c6f36a" strokeOpacity=".16"/>
    <rect x="81" y="24" width="177" height="174" rx="15" fill="url(#guide-card)"/><rect x="81" y="24" width="177" height="29" rx="15" fill="#eaf0f8"/><path d="M81 43v-4a15 15 0 0 1 15-15h147a15 15 0 0 1 15 15v4" fill="#eaf0f8"/>
    <circle cx="98" cy="39" r="3" fill="#94a3b8"/><circle cx="109" cy="39" r="3" fill="#94a3b8"/><circle cx="120" cy="39" r="3" fill="#94a3b8"/>
    <rect x="98" y="67" width="53" height="53" rx="13" fill="url(#guide-accent)"/><text x="124.5" y="100" textAnchor="middle" fill="#14202b" fontSize="14" fontWeight="800" fontFamily="system-ui,sans-serif">{slide.mark}</text>
    <rect x="163" y="70" width="75" height="7" rx="3.5" fill="#66758b"/><rect x="163" y="84" width="59" height="5" rx="2.5" fill="#a8b5c7"/><rect x="98" y="135" width="140" height="5" rx="2.5" fill="#b6c2d1"/><rect x="98" y="148" width="127" height="5" rx="2.5" fill="#c5cfdb"/><rect x="98" y="161" width="137" height="5" rx="2.5" fill="#c5cfdb"/>
    <rect x="224" y="115" width="111" height="72" rx="13" fill="#101c2c" stroke="#3a4a5e"/><circle cx="244" cy="137" r="8" fill="#c6f36a"/><path d="m240 137 3 3 6-7" fill="none" stroke="#102017" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="260" y="133" width="57" height="5" rx="2.5" fill="#d9e3ef"/><rect x="240" y="153" width="75" height="4" rx="2" fill="#53657a"/><rect x="240" y="164" width="59" height="4" rx="2" fill="#53657a"/>
    <path d="M262 77c26 2 43 12 48 31" fill="none" stroke="#c6f36a" strokeOpacity=".7" strokeWidth="2" strokeDasharray="4 5"/><circle cx="310" cy="108" r="4" fill="#c6f36a"/>
  </svg>;
}

function SignInGuideCarousel() {
  const [active, setActive] = useState(0);
  useEffect(() => { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined; const timer = window.setInterval(() => setActive(index => (index + 1) % signInGuides.length), 5000); return () => window.clearInterval(timer); }, [active]);
  const slide = signInGuides[active];
  return <section className="signin-guide" aria-label="Getting started with PaperMind AI">
    <div className={`signin-guide-visual transition-${active % 3}`} key={slide.kind}><div className="signin-guide-topline"><span>YOUR RESEARCH WORKFLOW</span><b>{String(active + 1).padStart(2,"0")} / 10</b></div><GuideIllustration slide={slide}/><div className="signin-guide-caption"><span>STEP {String(active + 1).padStart(2,"0")}</span><h2>{slide.title}</h2><p>{slide.text}</p></div></div>
    <div className="signin-guide-controls" aria-label="Choose a getting started tip">{signInGuides.map((item,index)=><button key={item.kind} type="button" className={index===active?"active":""} aria-label={`Show tip ${index+1}: ${item.title}`} aria-current={index===active?"step":undefined} onClick={()=>setActive(index)}/>)}</div>
  </section>;
}

function AuthParticles() {
  return <div className="auth-particles" aria-hidden="true">{Array.from({length:16},(_,index)=><i key={index} style={{left:`${(index*37)%94+3}%`,top:`${(index*23)%87+5}%`,"--particle-delay":`${-((index*3)%19)}s`,"--particle-duration":`${13+(index%6)*2}s`,"--particle-size":`${2+(index%3)}px`}} />)}</div>;
}

function PointerTrail() {
  const dotRefs = useRef([]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: no-preference)");
    if (!media.matches) return undefined;
    const points = Array.from({length:12},()=>({x:-100,y:-100}));
    const target = {x:-100,y:-100};
    let active = false, frame = 0;
    const hide = () => { active = false; dotRefs.current.forEach(dot => { if (dot) dot.style.opacity = "0"; }); };
    const draw = () => {
      frame = 0;
      if (!active) return;
      let moving = false;
      points[0].x += (target.x-points[0].x)*.38; points[0].y += (target.y-points[0].y)*.38;
      for (let index=1; index<points.length; index+=1) { points[index].x += (points[index-1].x-points[index].x)*.34; points[index].y += (points[index-1].y-points[index].y)*.34; }
      points.forEach((point,index)=>{const goal=index===0?target:points[index-1];if(Math.abs(point.x-goal.x)+Math.abs(point.y-goal.y)>.18)moving=true;});
      points.forEach((point,index) => { const dot=dotRefs.current[index]; if (!dot) return; dot.style.opacity=String(.78-index*.055); dot.style.transform=`translate3d(${point.x}px,${point.y}px,0) translate(-50%,-50%) scale(${1-index*.047})`; });
      if (moving) frame = window.requestAnimationFrame(draw);
    };
    const onMove = event => {
      if (!(event.target instanceof Element) || !event.target.closest(".auth-shell")) { hide(); return; }
      target.x=event.clientX; target.y=event.clientY;
      if (!active) { points.forEach((point,index)=>{point.x=target.x-index*3;point.y=target.y;}); active=true; }
      if (!frame) frame=window.requestAnimationFrame(draw);
    };
    window.addEventListener("pointermove",onMove,{passive:true}); window.addEventListener("pointerup",hide,{passive:true}); window.addEventListener("pointercancel",hide,{passive:true}); window.addEventListener("blur",hide);
    return () => { window.removeEventListener("pointermove",onMove); window.removeEventListener("pointerup",hide); window.removeEventListener("pointercancel",hide); window.removeEventListener("blur",hide); if(frame) window.cancelAnimationFrame(frame); };
  },[]);
  return <div className="pointer-trail" aria-hidden="true">{Array.from({length:12},(_,index)=><i key={index} ref={node=>{dotRefs.current[index]=node;}} className={index===11?"trail-dot trail-tail":"trail-dot"}/>)}</div>;
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState("login"), [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [successful, setSuccessful] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [verificationUrl, setVerificationUrl] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verify_email") !== "1") return;
    api("/auth/verify-email/", { method: "POST", body: JSON.stringify({ uid: params.get("uid"), token: params.get("token") }) })
      .then(result => { setMode("login"); setNotice(result.message); })
      .catch(x => { setMode("login"); setError(x.message); })
      .finally(() => { setBusy(false); window.history.replaceState({}, "", window.location.pathname); });
  }, []);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "forgot") { const result = await api("/auth/password-reset/", { method: "POST", body: JSON.stringify({ email }) }); setNotice(result.message); setMode("reset"); }
      else if (mode === "register") { const result = await api("/auth/register/", { method: "POST", body: JSON.stringify({ name, email, password }) }); setNotice(result.message); setVerificationUrl(result.verification_url || ""); setMode("login"); }
      else { const result = await api("/auth/login/", { method: "POST", body: JSON.stringify({ email, password }) }); setSuccessful(true); window.setTimeout(() => onLogin(result), 720); }
    } catch (x) { setError(x.message); }
    finally { setBusy(false); }
  }
  async function resendVerification() {
    setBusy(true); setError("");
    try { const result = await api("/auth/verify-email/resend/", { method: "POST", body: JSON.stringify({ email }) }); setNotice(result.message); setVerificationUrl(result.verification_url || ""); }
    catch (x) { setError(x.message); }
    finally { setBusy(false); }
  }
  function parallax(event) { const rect=event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty("--auth-pointer-x",`${((event.clientX-rect.left)/rect.width-.5)*8}px`); event.currentTarget.style.setProperty("--auth-pointer-y",`${((event.clientY-rect.top)/rect.height-.5)*8}px`); }
  return <main className="auth-shell" onPointerMove={parallax}><AuthParticles/><PointerTrail/><section className="auth-brand"><div className="brand-mark">PM</div><h1>PaperMind <span>AI</span></h1><p>Smarter research, faster insights.</p><SignInGuideCarousel /></section><section className="auth-panel"><div className={`auth-box${error?" has-error":""}`}><div className="mini-logo"><b>PaperMind AI</b></div><h2>{mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : mode === "reset" ? "Enter reset code" : "Reset your password"}</h2><p className="muted">{mode === "login" ? "Sign in to continue your research journey." : mode === "register" ? "Verify your email to activate your account." : mode === "reset" ? "Enter the 6-digit code sent to your email, then choose a new password." : "Enter your account email to receive a 6-digit reset code."}</p>
    {error && <div key={error} className="notice error auth-error">{error}</div>}{notice && <div className="notice verification-notice">{notice}{verificationUrl && <a href={verificationUrl}>Open verification link</a>}</div>}
    {mode === "reset" ? <ResetForm email={email} back={() => { setMode("login"); setNotice(""); setError(""); }} /> : <form key={mode} className={`auth-form${error?" has-error":""}`} onSubmit={submit}>{mode === "register" && <label className="auth-field"><span className="auth-field-label">Full name</span><input required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></label>}<label className="auth-field"><span className="auth-field-label">Email address</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label>{mode !== "forgot" && <label className="auth-field"><span className="auth-field-label">Password</span><PasswordInput required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}{mode === "login" && <button type="button" className="forgot" onClick={() => { setMode("forgot"); setNotice(""); setError(""); }}>Forgot password?</button>}<button className="primary full" disabled={busy||successful}>{busy ? <><i className="auth-spinner" aria-hidden="true"/>Please wait...</> : successful ? <><i className="auth-button-check" aria-hidden="true">✓</i>Signed in</> : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset code"}</button></form>}
    {mode === "login" && <button type="button" className="text-button resend-verification" onClick={resendVerification} disabled={busy || !email.includes("@")}>Resend verification email</button>}
    <div className="auth-switch">{mode === "login" ? <>Don't have an account? <button onClick={() => { setMode("register"); setNotice(""); setError(""); }}>Create one</button></> : <button onClick={() => { setMode("login"); setNotice(""); setError(""); }}>Back to sign in</button>}</div></div></section><footer className="app-footer auth-footer">Presented by <strong>Sayed Tauhidul Islam</strong></footer>{successful&&<div className="auth-success-screen" role="status" aria-live="polite"><div className="auth-success-card"><span className="auth-success-check">✓</span><h2>Welcome back</h2><p>Opening your research workspace…</p></div></div>}</main>;
}
function PasswordInput({ value, onChange, required, minLength, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-control"><input type={visible ? "text" : "password"} required={required} minLength={minLength} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete}/><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(current => !current)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m4 4 16 16"/>}</svg></button></span>;
}
function ResetForm({ email, back }) { const [code, setCode] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""); async function submit(e) { e.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const d = await api("/auth/password-reset/confirm/", { method: "POST", body: JSON.stringify({ email, code, password }) }); setMessage(d.message); } catch (x) { setError(x.message); } finally { setBusy(false); } } return <><form onSubmit={submit}><label>Email address<input type="email" value={email} readOnly /></label><label>6-digit email code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0,6))} /></label><label>New password<PasswordInput minLength={8} required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></label>{error && <div className="notice error">{error}</div>}{message && <div className="notice">{message}</div>}<button className="primary full" disabled={busy}>{busy ? "Resetting..." : "Set new password"}</button></form><button className="text-button" onClick={back}>Back to sign in</button></>; }

function App() {
  const [user, setUser] = useState(initialUser), [view, setView] = useState("Dashboard"), [papers, setPapers] = useState([]), [selected, setSelected] = useState(null), [analysis, setAnalysis] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [query, setQuery] = useState(""), [statusFilter, setStatusFilter] = useState("All"), [busy, setBusy] = useState(false), [task, setTask] = useState(null), [profile, setProfile] = useState({ name: "", email: "" }), [usage, setUsage] = useState(null), [readerPaper, setReaderPaper] = useState(null), [chatPaper, setChatPaper] = useState(null), [toast, setToast] = useState(""), [sidebarOpen, setSidebarOpen] = useState(false);
  const fileRef = useRef(); const userId = user?.id;
  const flash = msg => { setToast(msg); setTimeout(() => setToast(""), 2800); };
  const acceptLogin = d => { localStorage.setItem("papermind-user", JSON.stringify(d.user)); setUser(d.user); setProfile({ name: d.user.name, email: d.user.email }); };
  const logout = () => { api("/auth/logout/", { method: "POST" }).catch(() => {}); localStorage.removeItem("papermind-token"); localStorage.removeItem("papermind-user"); setUser(null); setPapers([]); setSelected(null); };
  async function refresh() { setLoading(true); setError(""); try { const [p, me, u] = await Promise.all([api("/papers/"), api("/auth/profile/"), api("/auth/usage/")]); setPapers(p); setUsage(u); setProfile({ name: me.name, email: me.email }); setUser(me); localStorage.setItem("papermind-user", JSON.stringify(me)); } catch (e) { setError(e.message); if (e.message.includes("expired") || e.message.includes("credentials")) logout(); } finally { setLoading(false); } }
  useEffect(() => { if (!userId) return; let active = true; Promise.all([api("/papers/"), api("/auth/profile/")]).then(([p, me]) => { if (!active) return; setPapers(p); setProfile({ name: me.name, email: me.email }); setUser(me); localStorage.setItem("papermind-user", JSON.stringify(me)); }).catch(e => { if (!active) return; setError(e.message); if (e.message.includes("expired") || e.message.includes("credentials")) logout(); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [userId]);
  useEffect(() => { if (!userId) return; api("/auth/usage/").then(setUsage).catch(() => {}); }, [userId]);
  useEffect(() => { const theme = normalizeTheme(localStorage.getItem("papermind-theme")); localStorage.setItem("papermind-theme", theme); document.documentElement.dataset.theme = theme; }, []);
  useEffect(() => { const reader = e => setReaderPaper(e.detail); const chat = e => setChatPaper(e.detail); window.addEventListener("papermind:open-pdf", reader); window.addEventListener("papermind:open-chat", chat); return () => { window.removeEventListener("papermind:open-pdf", reader); window.removeEventListener("papermind:open-chat", chat); }; }, []);
  useEffect(() => { if (!sidebarOpen) return; const closeOnEscape = event => { if (event.key === "Escape") setSidebarOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [sidebarOpen]);
  const filtered = useMemo(() => papers.filter(p => `${p.title} ${(p.tags || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()) && (statusFilter === "All" || (p.analysis_result ? "Analyzed" : "Pending") === statusFilter)), [papers, query, statusFilter]);
  async function upload(file) { if (!file) return; setError(""); const extension = file.name.split(".").pop()?.toLowerCase(); if (!["pdf", "docx"].includes(extension)) { setError("Choose a PDF or DOCX document."); if (fileRef.current) fileRef.current.value = ""; return; } if (file.size > MAX_UPLOAD_BYTES) { setError("This file is larger than 20 MB. Choose a smaller PDF or DOCX file."); if (fileRef.current) fileRef.current.value = ""; return; } setBusy(true); setTask(makeTask("upload", file.name, Math.max(8, Math.ceil(file.size / 1024 / 1024) * 3 + 5))); const body = new FormData(); body.append("pdf", file); try { const r = await api("/papers/", { method: "POST", body }); setPapers(p => [r.paper, ...p]); api("/auth/usage/").then(setUsage).catch(() => {}); setSelected(r.paper); setView("My Papers"); flash(r.ocr_warning || "Document uploaded and text extracted."); } catch (e) { setError(e.message); } finally { setBusy(false); setTask(null); if (fileRef.current) fileRef.current.value = ""; } }
  async function choosePaper(paper, runAnalysis = false) {
    setSelected(paper);
    setAnalysis(paper.analysis_result || null);
    setView("Analysis");
    if (!paper.analysis_result && !runAnalysis) return;
    if (paper.analysis_result && !runAnalysis) {
      try {
        const d = await api(`/papers/${paper.id}/analysis/`);
        setAnalysis(d.analysis);
      } catch (e) { setError(e.message); }
      return;
    }
    setBusy(true);
    setTask(makeTask("analysis", paper.title, estimateAiSeconds(paper.extracted_characters || paper.extracted_text)));
    setError("");
    try {
      const d = await api(`/analyzer/${paper.id}/analyze/`, { method: "POST" });
      setAnalysis(d.analysis);
      setPapers(prev => prev.map(item => item.id === paper.id ? { ...item, analysis_result: { confidence: { score: d.analysis.confidence?.score } } } : item));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setTask(null); }
  }
  async function rebuildPaper(paper) { setBusy(true); setTask(makeTask("analysis", paper.title, estimateAiSeconds(paper.extracted_characters || paper.extracted_text))); setError(""); try { const d=await api(`/analyzer/${paper.id}/analyze/?refresh=1`,{method:"POST"});setAnalysis(d.analysis);setPapers(prev=>prev.map(item=>item.id===paper.id?{...item,analysis_result:{confidence:{score:d.analysis.confidence?.score}}}:item));flash("Paper analysis refreshed."); } catch(e) { setError(e.message); } finally { setBusy(false);setTask(null); } }
  async function downloadSavedReport(paper) { try { const result = await api(`/papers/${paper.id}/analysis/`); downloadReport(paper, result.analysis); } catch (e) { setError(e.message); } }
  async function removePaper(p) { if (!window.confirm(`Delete “${p.title}” and its saved analysis?`)) return; try { await api(`/papers/${p.id}/`, { method: "DELETE" }); setPapers(xs => xs.filter(x => x.id !== p.id)); if (selected?.id === p.id) { setSelected(null); setAnalysis(null); } flash("Paper deleted."); } catch (e) { setError(e.message); } }
  async function savePaperTags(paper, tags) { try { const result = await api(`/papers/${paper.id}/`, { method: "PATCH", body: JSON.stringify({ tags }) }); setPapers(items => items.map(item => item.id === paper.id ? { ...item, tags: result.tags } : item)); } catch (e) { setError(e.message); } }
  if (!user) return <Auth onLogin={acceptLogin} />;
  return <div className="app-shell" data-theme={normalizeTheme(localStorage.getItem("papermind-theme"))}><button type="button" className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`} aria-label="Close navigation" onClick={() => setSidebarOpen(false)} tabIndex={sidebarOpen ? 0 : -1} /><aside className={`sidebar ${sidebarOpen ? "open" : ""}`}><button type="button" className="sidebar-brand" aria-label="PaperMind AI dashboard" title="Go to dashboard" onClick={() => { setView("Dashboard"); setSidebarOpen(false); }}><div className="brand-icon">◉</div><div><b>PaperMind <span>AI</span></b><small>Research workspace</small></div></button><div className="workspace-label">WORKSPACE</div><nav>{nav.map(([label, icon]) => <button key={label} className={view === label || (label === "Reports" && view === "Analysis") ? "active" : ""} onClick={() => { setView(label); setSidebarOpen(false); }}><i>{icon}</i>{label}{label === "My Papers" && papers.length > 0 && <em>{papers.length}</em>}</button>)}</nav><div className="sidebar-bottom"><div className="user-chip"><UserAvatar name={user.name} /><div><b>{user.name}</b><small>{user.email}</small></div><button title="Sign out" onClick={logout}>↪</button></div></div></aside>
  <div className="main-area"><header className="topbar"><button type="button" className="mobile-nav-toggle" aria-label={sidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(open => !open)}><span></span><span></span><span></span></button><div className="crumb">Workspace <span>/</span> <b>{view}</b></div><div className="top-actions"><button className="icon-button" title="Refresh papers" onClick={refresh}>⟳</button><button className="profile-menu" aria-label="Open settings" onClick={() => setView("Settings")}><UserAvatar name={user.name} tiny />{user.name}</button></div></header><main className="content">
    {readerPaper && <PdfReader paper={readerPaper} onClose={() => setReaderPaper(null)} />}
    {chatPaper && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setChatPaper(null)}><section className="chat-modal"><button className="modal-close" onClick={() => setChatPaper(null)}>×</button><ChatErrorBoundary key={chatPaper.id || "no-paper"}><Chat papers={papers} selected={chatPaper} onSelect={setChatPaper} usage={usage} setUsage={setUsage} /></ChatErrorBoundary></section></div>}
    <SelectionVoice />
    {task && <ProcessingBanner task={task} />}
    {error && <div className="notice error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    {view === "Dashboard" && <Dashboard user={user} papers={papers} busy={busy || loading} usage={usage} upload={() => fileRef.current?.click()} open={choosePaper} go={setView} />}
    {view === "Research Guide" && <ResearchGuide />}
    {view === "My Papers" && <Papers papers={filtered} allPapers={papers} total={papers.length} query={query} setQuery={setQuery} filter={statusFilter} setFilter={setStatusFilter} busy={busy || loading} upload={() => fileRef.current?.click()} open={choosePaper} remove={removePaper} saveTags={savePaperTags} />}
    {view === "Compare Papers" && <ComparePapers papers={papers} />}
    {view === "Research Workspace" && <ResearchWorkspace papers={papers} open={choosePaper} />}
    {view === "Analysis" && <AnalysisView paper={selected} analysis={analysis} busy={busy} usage={usage} setUsage={setUsage} rebuild={() => selected && rebuildPaper(selected)} run={() => selected && choosePaper(selected, true)} go={setView} />}
    {view === "AI Chat" && <ChatErrorBoundary key={selected?.id || "no-paper"}><Chat papers={papers} selected={selected} onSelect={setSelected} usage={usage} setUsage={setUsage} /></ChatErrorBoundary>}
    {view === "Find Papers" && <ResourceSearch kind="papers" />}
    {view === "Find Datasets" && <ResourceSearch kind="datasets" />}
    {view === "Reports" && <Reports papers={papers} open={choosePaper} download={downloadSavedReport} />}
    {view === "Voice Review" && <VoiceReview papers={papers} />}
    {view === "About Us" && <AboutUs />}
    {view === "Settings" && <Settings profile={profile} setProfile={setProfile} go={setView} save={async e => { e.preventDefault(); try { let current_password; if (profile.email.toLowerCase() !== user.email.toLowerCase()) { current_password = window.prompt("Confirm your current password to change the account email:"); if (!current_password) return; } const d = await api("/auth/profile/", { method: "PATCH", body: JSON.stringify({ ...profile, ...(current_password ? { current_password } : {}) }) }); setUser(d); localStorage.setItem("papermind-user", JSON.stringify(d)); flash("Profile updated."); } catch (x) { setError(x.message); } }} password={async (current_password, new_password) => { const d = await api("/auth/password/", { method: "POST", body: JSON.stringify({ current_password, new_password }) }); flash(d.message); logout(); }} remove={async password => { await api("/auth/account/", { method: "DELETE", body: JSON.stringify({ password }) }); logout(); }} />}
    <footer className="app-footer">Presented by <strong>Sayed Tauhidul Islam</strong></footer>
  </main></div><input ref={fileRef} type="file" accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx" hidden onChange={e => upload(e.target.files?.[0])} />{toast && <div className="toast">✓ {toast}</div>}</div>;
}

function AboutUs() {
  return <><div className="page-heading"><div><div className="eyebrow">THE STORY BEHIND THE WORKSPACE</div><h1>About PaperMind AI</h1><p>A research workspace designed to make working with scholarly papers clearer and more organized.</p></div></div><section className="about-grid"><article className="panel about-card about-author"><div className="about-mark">PM</div><div><span className="badge neutral">Project creator</span><h2>Sayed Tauhidul Islam</h2><p>Presented by Sayed Tauhidul Islam.</p></div></article><article className="panel about-card"><div className="eyebrow">WHY THIS PROJECT</div><h2>Make research easier to work through</h2><p>Research papers can be dense and time-consuming to review. PaperMind AI brings paper upload, structured analysis, source-linked questions, paper comparison, notes, and research planning into one workspace.</p><p>The goal is to help researchers find relevant evidence and organize their reading while keeping the original paper available for checking AI-generated claims.</p></article><article className="panel about-card"><div className="eyebrow">WHAT IT SUPPORTS</div><h2>From reading to research planning</h2><ul><li>Extract and review PDF and DOCX papers.</li><li>Ask questions grounded in selected papers.</li><li>Compare findings and preserve notes and drafts.</li><li>Keep source evidence visible so researchers can verify conclusions.</li></ul><p className="muted">AI results are research assistance; always verify important claims against the source paper.</p></article></section></>;
}

function Dashboard({ user, papers, busy, usage, upload, open, go }) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  const hour = currentTime.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const complete = papers.filter(p => p.analysis_result).length;
  const pending = papers.length - complete;
  const progress = papers.length ? Math.round(complete / papers.length * 100) : 0;
  const activity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const count = papers.filter(p => new Date(p.uploaded_at).toDateString() === date.toDateString()).length;
    return { label: index === 6 ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date), count };
  });
  const activityMax = Math.max(1, ...activity.map(item => item.count));
  return <>
    <div className="welcome-row"><div><div className="eyebrow">YOUR RESEARCH AT A GLANCE</div><h1>{greeting}, {user.name?.split(" ")[0] || "researcher"}</h1><p>Pick up where you left off or bring a new paper into your workspace.</p></div><div className="upload-cta"><button className="primary" onClick={upload}>{busy ? "Processing…" : "+ Upload document"}</button><small>PDF or DOCX · Maximum file size: 20 MB each</small></div><div className="research-visual" aria-hidden="true"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="analysis-core"><span>✦</span></div><div className="float-card float-paper"><i>PDF</i><span>Paper insight</span><b>Finding detected</b><div className="mini-lines"><i></i><i></i><i></i></div></div><div className="float-card float-score"><small>AI CONFIDENCE</small><strong>94<span>%</span></strong><div className="score-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><span className="spark spark-a">✦</span><span className="spark spark-b">✧</span></div></div>
    <div className="stat-grid"><Stat icon="▤" label="Total papers" value={papers.length} note="In your library" color="blue"/><Stat icon="✓" label="Completed analyses" value={complete} note={`${progress}% of your library`} color="green"/><Stat icon="◷" label="Pending analysis" value={pending} note="Papers to explore" color="orange"/><Stat icon="▧" label="Saved reports" value={complete} note="Available to download" color="purple"/></div>
    <section className="dashboard-charts" aria-label="Research activity charts">
      <article className="panel chart-card progress-chart"><div className="panel-heading"><div><h2>Analysis progress</h2><p>How much of your library has been analyzed</p></div></div><div className="progress-chart-body"><div className="progress-ring" role="img" aria-label={`${progress}% analyzed`} style={{ "--progress": `${progress}%` }}><div><strong>{progress}%</strong><small>analyzed</small></div></div><div className="chart-legend"><span><i className="legend-complete"/>Completed analyses <b>{complete}</b></span><span><i className="legend-pending"/>Awaiting analysis <b>{pending}</b></span><small>{papers.length ? `${papers.length} paper${papers.length === 1 ? "" : "s"} in your library` : "Upload a paper to begin tracking progress."}</small></div></div></article>
      <article className="panel chart-card activity-chart"><div className="panel-heading"><div><h2>Research activity</h2><p>Paper uploads over the last seven days</p></div><span className="activity-total">{activity.reduce((sum, item) => sum + item.count, 0)} uploads</span></div><div className="activity-bars" role="img" aria-label={`Paper uploads in the last seven days: ${activity.map(item => `${item.label} ${item.count}`).join(", ")}`}>
        {activity.map((item, index) => <div className="activity-day" key={`${item.label}-${index}`} title={`${item.label}: ${item.count} upload${item.count === 1 ? "" : "s"}`}><b>{item.count || ""}</b><div className="activity-track"><i style={{ height: `${item.count ? Math.max(12, item.count / activityMax * 100) : 4}%` }}/></div><small>{item.label}</small></div>)}
      </div></article>
    </section>
    {usage && <div className="quota-strip"><b>Today's usage</b><span>PDF uploads <strong>{usage.uploads.used}/{usage.uploads.limit}</strong></span><span>Chat messages <strong>{usage.chat_messages.used}/{usage.chat_messages.limit}</strong></span></div>}
    <div className="dashboard-grid"><section className="panel papers-panel"><div className="panel-heading"><div><h2>Recent papers</h2><p>Your latest additions</p></div><button className="link-button" onClick={() => go("My Papers")}>View all <span>→</span></button></div>{papers.length ? <div className="table-wrap"><table><thead><tr><th>PAPER</th><th>UPLOADED</th><th>STATUS</th><th></th></tr></thead><tbody>{papers.slice(0, 6).map(p => <tr key={p.id}><td><button className="paper-name" onClick={() => open(p, Boolean(!p.analysis_result))}><span className="pdf-icon">PDF</span><span>{p.title}</span></button></td><td>{new Date(p.uploaded_at).toLocaleDateString()}</td><td><span className={`badge ${p.analysis_result ? "done" : "pending"}`}>{p.analysis_result ? "Analyzed" : "Pending"}</span></td><td><button className="row-action" title="Open analysis" onClick={() => open(p, Boolean(!p.analysis_result))}>↗</button></td></tr>)}</tbody></table></div> : <Empty title="Your library is ready" body="Upload a research paper and its analysis will appear here." action="Upload your first PDF" click={upload} />}</section><section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Keep your research moving</p></div></div><button className="quick-action" onClick={upload}><span className="quick-icon blue-bg">↑</span><span><b>Upload a paper</b><small>Extract text from a PDF</small></span><i>→</i></button><button className="quick-action" onClick={() => go("AI Chat")}><span className="quick-icon purple-bg">✧</span><span><b>Ask about a paper</b><small>Get evidence-backed answers</small></span><i>→</i></button><button className="quick-action" onClick={() => go("Reports")}><span className="quick-icon green-bg">▧</span><span><b>Review reports</b><small>Browse completed analyses</small></span><i>→</i></button><div className="privacy-note">🔒 <span>Your papers are private to your account.</span></div></section></div>
  </>;
}
function ResearchGuide() {
  const [language, setLanguage] = useState(() => localStorage.getItem("papermind-guide-language") === "bn" ? "bn" : "en");
  const selectLanguage = value => { setLanguage(value); localStorage.setItem("papermind-guide-language", value); };
  const copy = {
    en: {
      eyebrow: "RESEARCHER’S FIELD GUIDE", title: "From your first research question to publication", intro: "A practical, step-by-step guide for new researchers. Give every stage a clear task, a way to check your work, and a concrete outcome.", jump: "Explore the steps", principlesTitle: "Three habits to guide your work", principles: [["Start with a question", "Good research begins with a clear, answerable question."], ["Follow the evidence", "Keep a source beside every important claim and decision."], ["Start small", "A realistic scope and a pilot help you make steady progress."]], journeyEyebrow: "THE RESEARCH JOURNEY", journeyTitle: "Your research, step by step", journeyIntro: "Save the outcome of each stage; it becomes the starting point for the next.", step: "STEP", output: "Outcome", readingEyebrow: "READING RESEARCH PAPERS", readingTitle: "How to read a research paper", reading: [["First pass — get the map:", "Scan the title, abstract, figures, conclusion, and section headings. Decide whether the paper is relevant to your question."], ["Second pass — understand the method:", "Find the research question, data or sample, method, baseline, and metrics. Write down unfamiliar terms."], ["Third pass — check the evidence:", "Compare figures and tables with the results text. Note limitations, assumptions, and the boundaries of the authors’ claims."]], readingNote: "After each paper, record:", readingFields: "question · method · data · main result · limitation · relevance to my work", topicEyebrow: "CHOOSING A TOPIC", topicTitle: "A quick topic-selection check", topicChecks: [["Interest", "Can you stay engaged with this subject for several months?"], ["Novelty", "Does recent literature support a specific, verifiable gap?"], ["Feasibility", "Can you access the time, skills, approvals, and data you need?"], ["Value", "Whose problem could this address, and why would the result matter?"], ["Scope", "Is the question small enough to answer within one project?"]], speedEyebrow: "WORK SMARTER, KEEP IT RIGOROUS", speedTitle: "A steady routine for better progress", routines: [["Set a weekly target", "For example: read five papers, finish a pilot, or draft one section."], ["Keep a research log", "Record what you did, what changed, and why, with dates."], ["Pilot before scaling up", "Check the method and time needed before a large data collection."], ["Ask for feedback regularly", "Share progress with your supervisor or collaborators before problems pile up."]], closing: "Research rarely follows a perfectly straight path. Revising your question, method, or scope when new evidence appears is part of doing careful research."
    },
    bn: {
      eyebrow: "গবেষকের পথনির্দেশ", title: "গবেষণার প্রথম প্রশ্ন থেকে প্রকাশনা পর্যন্ত", intro: "নতুন গবেষকদের জন্য ধাপে ধাপে ব্যবহারিক নির্দেশনা। প্রতিটি ধাপে কাজ, যাচাইয়ের উপায় এবং একটি নির্দিষ্ট ফল ঠিক রাখুন।", jump: "ধাপগুলো দেখুন", principlesTitle: "গবেষণায় পথ দেখাবে যে অভ্যাসগুলো", principles: [["প্রশ্ন দিয়ে শুরু করুন", "ভালো গবেষণা শুরু হয় পরিষ্কার ও উত্তরযোগ্য প্রশ্ন দিয়ে।"], ["প্রমাণ অনুসরণ করুন", "গুরুত্বপূর্ণ দাবি ও সিদ্ধান্তের পাশে উৎস রাখুন।"], ["ছোট করে শুরু করুন", "বাস্তবসম্মত পরিসর ও pilot কাজকে ধারাবাহিকভাবে এগিয়ে নেয়।"]], journeyEyebrow: "গবেষণার ধাপ", journeyTitle: "ধাপে ধাপে আপনার গবেষণা", journeyIntro: "প্রতিটি ধাপের ফল সংরক্ষণ করুন; পরের ধাপ সেটির ওপর ভিত্তি করে এগোবে।", step: "ধাপ", output: "এই ধাপের ফল", readingEyebrow: "গবেষণাপত্র পড়া", readingTitle: "গবেষণাপত্র কীভাবে পড়বেন", reading: [["প্রথম পাঠ — সামগ্রিক ধারণা নিন:", "শিরোনাম, abstract, figure, conclusion ও section heading দেখুন। paper-টি আপনার প্রশ্নের সঙ্গে প্রাসঙ্গিক কি না ঠিক করুন।"], ["দ্বিতীয় পাঠ — পদ্ধতি বুঝুন:", "গবেষণার প্রশ্ন, data বা sample, method, baseline ও metric খুঁজুন। অপরিচিত শব্দ লিখে রাখুন।"], ["তৃতীয় পাঠ — প্রমাণ যাচাই করুন:", "figure ও table-এর সঙ্গে ফলাফলের লেখা মিলিয়ে দেখুন। সীমাবদ্ধতা, অনুমান এবং লেখকের দাবির পরিসর চিহ্নিত করুন।"]], readingNote: "প্রতিটি paper শেষে লিখুন:", readingFields: "প্রশ্ন · পদ্ধতি · data · মূল ফল · সীমাবদ্ধতা · আমার কাজের সঙ্গে সম্পর্ক", topicEyebrow: "গবেষণার বিষয় নির্বাচন", topicTitle: "বিষয় বাছাইয়ের সংক্ষিপ্ত যাচাই", topicChecks: [["আগ্রহ", "বিষয়টি নিয়ে কয়েক মাস নিয়মিত কাজ করতে পারবেন?"], ["নতুনত্ব", "সাম্প্রতিক literature কি নির্দিষ্ট ও যাচাইযোগ্য gap দেখায়?"], ["সম্ভাব্যতা", "প্রয়োজনীয় সময়, দক্ষতা, অনুমতি ও data পাওয়া সম্ভব?"], ["গুরুত্ব", "কার সমস্যা সমাধানে এটি কাজে লাগবে, এবং কেন?"], ["পরিসর", "একটি project-এর মধ্যে প্রশ্নটির উত্তর দেওয়া সম্ভব?"]], speedEyebrow: "গুছিয়ে কাজ, নির্ভরযোগ্য গবেষণা", speedTitle: "ভালো অগ্রগতির জন্য নিয়মিত কাজের রুটিন", routines: [["সাপ্তাহিক লক্ষ্য ঠিক করুন", "যেমন: পাঁচটি paper পড়া, pilot শেষ করা, বা একটি section-এর খসড়া লেখা।"], ["Research log রাখুন", "কী করলেন, কী বদলালেন এবং কেন—তারিখসহ লিখুন।"], ["বড় কাজের আগে pilot করুন", "বড় পরিসরে data সংগ্রহের আগে পদ্ধতি ও সময় যাচাই করুন।"], ["নিয়মিত feedback নিন", "সমস্যা জমার আগেই supervisor বা সহগবেষকের সঙ্গে অগ্রগতি ভাগ করুন।"]], closing: "গবেষণার পথ সবসময় সরল হয় না। নতুন প্রমাণ পেলে প্রশ্ন, পদ্ধতি বা পরিসর সংশোধন করা সতর্ক গবেষণারই অংশ।"
    }
  };
  const t = copy[language];
  const journey = [
    { icon: "✧", bn: { title: "আগ্রহ থেকে সম্ভাব্য বিষয়", aim: "কৌতূহলকে গবেষণার দিকে নিন", points: ["যে সমস্যা আপনাকে ভাবায়, তা লিখে রাখুন।", "নিজের জ্ঞান, সময়, যন্ত্রপাতি, তথ্য ও পরামর্শকের সহায়তা বিবেচনা করুন।", "বড় ক্ষেত্রকে ছোট করুন: ক্ষেত্র → নির্দিষ্ট সমস্যা → নির্দিষ্ট জনগোষ্ঠী বা data → সময়সীমা।"], output: "৩–৫টি সম্ভাব্য বিষয়" }, en: { title: "Turn an interest into a topic", aim: "Start from a question you care about", points: ["Write down problems that genuinely interest you.", "Consider your knowledge, time, tools, data access, and available supervision.", "Narrow a broad field to a specific problem, population or dataset, and timeframe."], output: "3–5 candidate topics" } },
    { icon: "⌕", bn: { title: "প্রাথমিক literature search", aim: "আগে কী জানা আছে বুঝুন", points: ["Google Scholar, Semantic Scholar বা ক্ষেত্রভিত্তিক database-এ keyword ও synonym দিয়ে খুঁজুন।", "সাম্প্রতিক review দিয়ে বিষয়টির মানচিত্র তৈরি করুন; এরপর মূল ও গুরুত্বপূর্ণ পুরোনো গবেষণা পড়ুন।", "প্রতিটি paper-এর citation, method, dataset, result ও limitation নোট করুন।"], output: "গোছানো reading list" }, en: { title: "Search the literature", aim: "Learn what is already known", points: ["Search Google Scholar, Semantic Scholar, or a trusted field-specific database using keywords and synonyms.", "Use recent reviews to map the field, then read original studies and influential earlier work.", "Record each paper’s citations, methods, datasets, results, and limitations."], output: "An organized reading list" } },
    { icon: "◎", bn: { title: "Research gap যাচাই", aim: "কেন নতুন গবেষণা দরকার খুঁজুন", points: ["একই ফল বারবার এসেছে কি না, data বা population সীমিত কি না, এবং অন্য পরিবেশে ফল কাজ করে কি না দেখুন।", "আগের paper-এর limitation ও future work থেকে সূত্র নিন; উৎস দিয়ে gap যাচাই করুন।", "আপনার কাজ আগের গবেষণা থেকে কীভাবে আলাদা হবে, এক বাক্যে লিখুন।"], output: "প্রমাণসহ research gap" }, en: { title: "Verify the research gap", aim: "Establish why more research is needed", points: ["Check whether findings have been repeated, data or populations are limited, or results transfer to other settings.", "Use earlier limitations and future-work sections as leads, then verify the gap with sources.", "Write one sentence explaining how your work will differ from previous research."], output: "An evidence-backed research gap" } },
    { icon: "?", bn: { title: "প্রশ্ন, লক্ষ্য ও পরিসর ঠিক করুন", aim: "গবেষণাকে উত্তরযোগ্য করুন", points: ["একটি স্পষ্ট research question এবং ২–৪টি নির্দিষ্ট objective লিখুন।", "প্রশ্নটি নির্দিষ্ট, পরিমাপযোগ্য, বাস্তবসম্মত ও সময়ের মধ্যে শেষ করা সম্ভব কি না যাচাই করুন।", "কী অন্তর্ভুক্ত হবে এবং হবে না—scope ও key term সংজ্ঞায়িত করুন।"], output: "Research question ও objectives" }, en: { title: "Define the question, objectives, and scope", aim: "Make the study answerable", points: ["Write one clear research question and two to four specific objectives.", "Check that the question is focused, measurable, realistic, and answerable in your timeframe.", "Define what is included and excluded, along with key terms."], output: "A research question and objectives" } },
    { icon: "▤", bn: { title: "Proposal, নৈতিকতা ও পরিকল্পনা", aim: "শুরুর আগে পথ নির্ধারণ করুন", points: ["Problem, gap, গুরুত্ব, প্রশ্ন, literature, method ও প্রত্যাশিত অবদান proposal-এ সাজান।", "মানুষ, প্রাণী বা ব্যক্তিগত তথ্য থাকলে প্রয়োজনীয় ethics approval ও consent আগে নিন।", "Data access, খরচ, ঝুঁকি, সময়সূচি ও supervisor feedback নিশ্চিত করুন।"], output: "অনুমোদিত proposal ও পরিকল্পনা" }, en: { title: "Plan the proposal and research ethics", aim: "Set the path before starting", points: ["Organize the problem, gap, significance, question, literature, method, and expected contribution in a proposal.", "Obtain required ethics approval and consent before work involving people, animals, or personal data.", "Confirm data access, costs, risks, timeline, and supervisor feedback."], output: "An approved proposal and plan" } },
    { icon: "⌘", bn: { title: "Method বেছে pilot করুন", aim: "প্রশ্নের সঙ্গে পদ্ধতি মেলান", points: ["প্রশ্ন অনুযায়ী quantitative, qualitative, mixed-method, experiment বা computational approach বাছুন।", "Sample বা data source, inclusion criteria, tools, procedure ও evaluation metric আগে নির্দিষ্ট করুন।", "ছোট pilot দিয়ে ভুল, bias, data quality ও সময় যাচাই করে পরিকল্পনা সংশোধন করুন।"], output: "পুনরাবৃত্তিযোগ্য methodology" }, en: { title: "Choose a method and run a pilot", aim: "Match the method to the question", points: ["Choose a quantitative, qualitative, mixed-method, experimental, or computational approach that fits your question.", "Specify the sample or data source, inclusion criteria, tools, procedure, and evaluation metrics.", "Use a small pilot to check errors, bias, data quality, and timing; revise the plan if needed."], output: "A reproducible methodology" } },
    { icon: "◉", bn: { title: "তথ্য সংগ্রহ ও বিশ্লেষণ", aim: "স্বচ্ছভাবে প্রমাণ তৈরি করুন", points: ["Data dictionary, file naming, backup ও version control রাখুন; data কোথা থেকে এসেছে লিখুন।", "আগে নির্ধারিত পদ্ধতিতে analysis করুন; দরকার হলে baseline ও উপযুক্ত comparison যোগ করুন।", "ব্যর্থ পরীক্ষা, uncertainty, missing data ও সীমাবদ্ধতাও নথিভুক্ত করুন।"], output: "পরিষ্কার data, analysis ও ফলাফল" }, en: { title: "Collect and analyze data", aim: "Build evidence transparently", points: ["Maintain a data dictionary, consistent filenames, backups, and version control; document data sources.", "Analyze with the planned methods and add suitable baselines or comparisons where appropriate.", "Document unsuccessful experiments, uncertainty, missing data, and limitations as well as positive findings."], output: "Organized data, analysis, and results" } },
    { icon: "✎", bn: { title: "Paper-এর খসড়া লিখুন", aim: "যুক্তির ধারাবাহিকতা গড়ুন", points: ["সাধারণ কাঠামো: Title, Abstract, Introduction, Related Work, Methods, Results, Discussion, Limitations, Conclusion, References।", "প্রথমে নিজের কাজের প্রশ্ন, পদ্ধতি ও ফল লিখুন; পরে আগের গবেষণার সঙ্গে সম্পর্ক ব্যাখ্যা করুন।", "প্রতিটি claim-এ source দিন; ফল বানাবেন না এবং text, figure ও table মিলিয়ে দেখুন।"], output: "সম্পূর্ণ manuscript" }, en: { title: "Write the manuscript", aim: "Build a clear line of reasoning", points: ["A common structure is Title, Abstract, Introduction, Related Work, Methods, Results, Discussion, Limitations, Conclusion, and References.", "Draft your question, method, and findings first; then explain how they relate to earlier work.", "Cite sources for claims, never invent results, and cross-check text, figures, and tables."], output: "A complete manuscript" } },
    { icon: "↻", bn: { title: "Feedback, revision ও final check", aim: "লেখা ও প্রমাণ শক্ত করুন", points: ["Supervisor ও সহলেখকের feedback নিয়ে আগে যুক্তি, method ও evidence ঠিক করুন; পরে ভাষা ও formatting।", "নতুন পাঠকের কাছে objective, পদ্ধতি ও মূল ফল পরিষ্কার কি না যাচাই করুন।", "Citation, figure permission, author contribution, plagiarism ও journal format পরীক্ষা করুন।"], output: "জমা দেওয়ার উপযোগী paper" }, en: { title: "Get feedback and revise", aim: "Strengthen the writing and evidence", points: ["Use supervisor and co-author feedback to improve the argument, methods, and evidence before polishing language and format.", "Ask a new reader whether the objective, method, and main findings are clear.", "Check citations, figure permissions, author contributions, plagiarism, and venue requirements."], output: "A submission-ready paper" } },
    { icon: "↗", bn: { title: "জমা দিন ও প্রকাশ করুন", aim: "সঠিক venue-তে গবেষণা পৌঁছান", points: ["বিষয় ও পাঠকের সঙ্গে মানানসই journal বা conference বাছুন; scope, peer review, fee ও indexing যাচাই করুন।", "অস্বাভাবিক publication promise বা অস্পষ্ট editorial তথ্য থাকলে সতর্ক থাকুন; predatory venue এড়িয়ে চলুন।", "Reviewer-এর প্রতিটি মন্তব্যের উত্তর evidence-সহ দিন। গ্রহণ হলে proof যাচাই করে data বা code দায়িত্বশীলভাবে ভাগ করুন।"], output: "Peer-reviewed publication ও গবেষণার প্রচার" }, en: { title: "Submit and publish", aim: "Choose a suitable venue for your work", points: ["Choose a journal or conference that fits your topic and audience; check its scope, peer review, fees, and indexing.", "Be cautious of unrealistic publication promises or unclear editorial practices; avoid predatory venues.", "Respond to every reviewer comment with evidence. If accepted, check proofs and share data or code responsibly."], output: "A peer-reviewed publication and wider dissemination" } }
  ];
  return <div className="research-guide">
    <header className="guide-hero"><div className="guide-language-switch" role="group" aria-label="Guide language"><button type="button" aria-pressed={language === "en"} className={language === "en" ? "selected" : ""} onClick={() => selectLanguage("en")}>English</button><button type="button" aria-pressed={language === "bn"} className={language === "bn" ? "selected" : ""} onClick={() => selectLanguage("bn")}>বাংলা</button></div><div className="guide-hero-copy"><div className="eyebrow">{t.eyebrow}</div><h1>{t.title}</h1><p>{t.intro}</p><a href="#research-journey">{t.jump} <span>↓</span></a></div><div className="guide-emblem" aria-hidden="true"><div className="guide-orbit orbit-a"><i>✧</i></div><div className="guide-orbit orbit-b"><i>⌕</i></div><div className="guide-emblem-core">PM</div><span className="guide-spark spark-one">✦</span><span className="guide-spark spark-two">✧</span><span className="guide-spark spark-three">✦</span></div></header>
    <section className="guide-principles" aria-label={t.principlesTitle}>{t.principles.map(([title, description], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{title}</b><p>{description}</p></div></article>)}</section>
    <div className="guide-section-heading" id="research-journey"><div className="eyebrow">{t.journeyEyebrow}</div><h2>{t.journeyTitle}</h2><p>{t.journeyIntro}</p></div>
    <section className="guide-journey">{journey.map((item, index) => { const step = item[language]; return <article className="guide-step" key={step.title} style={{ "--step-index": index, "--step-delay": `${index * 45}ms` }}><div className="guide-step-marker"><span>{item.icon}</span></div><div className="guide-step-card"><div className="guide-step-top"><span>{t.step} {String(index + 1).padStart(2, "0")}</span><small>{step.aim}</small></div><h3>{step.title}</h3><ul>{step.points.map(point => <li key={point}>{point}</li>)}</ul><div className="guide-output"><b>{t.output}</b><span>{step.output}</span></div></div></article>; })}</section>
    <section className="guide-practice-grid"><article className="guide-practice-card reading-card"><div className="guide-card-heading"><span className="guide-card-icon">▤</span><div><div className="eyebrow">{t.readingEyebrow}</div><h2>{t.readingTitle}</h2></div></div><ol>{t.reading.map(([title, description]) => <li key={title}><b>{title}</b> {description}</li>)}</ol><div className="guide-note">{t.readingNote} <b>{t.readingFields}</b></div></article>
      <article className="guide-practice-card topic-card"><div className="guide-card-heading"><span className="guide-card-icon">◎</span><div><div className="eyebrow">{t.topicEyebrow}</div><h2>{t.topicTitle}</h2></div></div><div className="topic-checks">{t.topicChecks.map(([label, question]) => <div key={label}><span>✓</span><p><b>{label}</b>{question}</p></div>)}</div></article></section>
    <section className="guide-speed-panel"><div className="guide-speed-copy"><div className="eyebrow">{t.speedEyebrow}</div><h2>{t.speedTitle}</h2><div className="guide-speed-list">{t.routines.map(([title, description]) => <p key={title}><b>{title}</b><span>{description}</span></p>)}</div></div><div className="guide-speed-orb" aria-hidden="true">↗</div></section>
    <footer className="guide-footer"><span className="guide-footer-mark">✦</span><p>{t.closing}</p></footer>
  </div>;
}
function Stat({ icon, label, value, note, color }) { return <div className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div className="stat-label">{label}</div><strong>{value}</strong><small>{note}</small></div>; }
function Empty({ title, body, action, click }) { return <div className="empty-state"><div className="empty-art">▤</div><b>{title}</b><p>{body}</p>{action && <button className="primary small" onClick={click}>{action}</button>}</div>; }
async function openPdf(paper, download = false, page = null) { if (paper.file_type !== "pdf") { window.alert("PDF preview is available for PDF files only."); return; } if (!download) { window.dispatchEvent(new CustomEvent("papermind:open-pdf", { detail: { ...paper, initial_page: page } })); return; } const popup = null; try { if (!API_BASE_URL) throw new Error("Set VITE_API_URL in Vercel project settings and redeploy."); const response = await apiFetch(`/papers/${paper.id}/file/`); if (!response.ok) throw new Error("Could not open this PDF."); const url = URL.createObjectURL(await response.blob()); if (download) { const a = document.createElement("a"); a.href = url; a.download = `${paper.title}.pdf`; a.click(); } else if (popup) popup.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (e) { popup?.close(); window.alert(e.message); } }

function Papers({ papers, allPapers, total, query, setQuery, filter, setFilter, busy, upload, open, remove, saveTags }) {
  const [semanticMatches, setSemanticMatches] = useState(null);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [semanticError, setSemanticError] = useState("");
  const clearFilters = () => { setQuery(""); setFilter("All"); setSemanticMatches(null); setSemanticError(""); };
  async function findByMeaning() {
    if (query.trim().length < 3 || semanticBusy) return;
    setSemanticBusy(true); setSemanticError("");
    try {
      const result = await api("/papers/semantic-search/", { method: "POST", body: JSON.stringify({ query: query.trim() }) });
      const allowed = new Set(allPapers.filter(paper => filter === "All" || (paper.analysis_result ? "Analyzed" : "Pending") === filter).map(paper => paper.id));
      setSemanticMatches((result.matches || []).filter(match => allowed.has(match.id)));
    } catch (error) { setSemanticMatches([]); setSemanticError(error.message); }
    finally { setSemanticBusy(false); }
  }
  return <><div className="page-heading"><div><div className="eyebrow">YOUR LIBRARY</div><h1>My papers</h1><p>Manage your PDF and Word documents, analysis, and tags.</p><small className="upload-limit-note">PDF or DOCX · Maximum file size: 20 MB each</small></div><button className="primary" onClick={upload} disabled={busy}>+ Upload document</button></div><section className="panel library-panel"><div className="toolbar library-toolbar"><label className="searchbox"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search papers or tags" value={query} onChange={e => { setQuery(e.target.value); setSemanticMatches(null); setSemanticError(""); }} placeholder="Search titles or tags..." /></label><label className="status-filter"><span>Status</span><select aria-label="Filter papers by analysis status" value={filter} onChange={e => { setFilter(e.target.value); setSemanticMatches(null); }}><option>All</option><option>Analyzed</option><option>Pending</option></select></label><span className="results-count" aria-live="polite">Showing {papers.length} of {total} paper{total === 1 ? "" : "s"}</span><button className="secondary-btn semantic-search-button" disabled={query.trim().length < 3 || semanticBusy} onClick={findByMeaning}>{semanticBusy ? "Searching by meaning…" : "Find by meaning ✧"}</button></div>{semanticMatches !== null ? <section className="semantic-results" aria-live="polite"><div className="panel-heading"><div><h2>AI semantic matches</h2><p>Ranked by topic, research question, methods, and findings. {total > 30 ? `Search includes the 30 most recent papers in your ${total}-paper library.` : `Search includes all ${total} papers in your library.`}</p></div><button className="text-button" onClick={() => setSemanticMatches(null)}>Close</button></div>{semanticError ? <div className="notice error">{semanticError}</div> : semanticMatches.length ? semanticMatches.map(match => { const paper = allPapers.find(item => item.id === match.id); if (!paper) return null; return <article className="semantic-match" key={match.id}><div className="semantic-match-main"><button className="semantic-match-title" onClick={() => open(paper)}>{match.title}</button><span className="badge neutral">{match.relevance}% match</span><p>{match.reason}</p></div>{match.evidence?.map((item, index) => <div className="semantic-match-evidence" key={index}><span>“{item.quote}”</span><small>{item.verified ? "Source match" : "Unverified"} · page {item.page ?? "not identified"}</small>{item.verified && paper.file_type === "pdf" && Number.isInteger(item.page) && <button className="source-page-link" onClick={() => openPdf(paper, false, item.page)}>Open source ↗</button>}</div>)}</article>; }) : <div className="library-no-results"><b>No closely related papers found</b><p>Try another research question or add more analyzed papers to your library.</p></div>}</section> : papers.length ? <div className="table-wrap"><table><thead><tr><th>DOCUMENT</th><th>UPLOADED</th><th>STATUS</th><th>ANALYSIS SCORE</th><th>ACTIONS</th></tr></thead><tbody>{papers.map(p => <tr key={p.id}><td><button className="paper-name" onClick={() => open(p)}><span className="pdf-icon">{(p.file_type || "pdf").toUpperCase()}</span><span><b>{p.title}</b><small>{(p.file_type || "pdf").toUpperCase()} document</small></span></button><PaperTags paper={p} save={saveTags}/></td><td>{new Date(p.uploaded_at).toLocaleDateString()}</td><td><span className={`badge ${p.analysis_result ? "done" : "pending"}`}>{p.analysis_result ? "Analyzed" : "Pending"}</span></td><td>{p.analysis_result ? <><b>{p.analysis_result.confidence?.score ?? "N/A"}%</b> <span className="muted">confidence</span></> : <span className="muted">Not analyzed yet</span>}</td><td className="actions"><button title="Analyze / view analysis" onClick={() => open(p, !p.analysis_result)}>{p.analysis_result ? "View" : "AI"}</button>{p.file_type === "pdf" && <><button title="Preview PDF" onClick={() => openPdf(p)}>PDF</button><button title="Download PDF" onClick={() => openPdf(p, true)}>Get</button></>}<button title="Delete document" onClick={() => remove(p)}>Del</button></td></tr>)}</tbody></table></div> : <Empty title={total ? "No papers match" : "Your library is ready"} body={total ? "Try a different search or upload a PDF or Word DOCX file." : "Upload a PDF or Word DOCX and it will appear here."} action={total ? "Clear search and filters" : "Upload document"} click={total ? clearFilters : upload} />}</section><p className="hint">Accepted files: PDF and Word DOCX. Maximum 20 MB each. Scanned PDF pages use Tesseract OCR when available.</p></>;
}function PaperTags({ paper, save }) {
  const [value, setValue] = useState("");
  return <div className="paper-tags">{(paper.tags || []).map(tag => <button key={tag} title="Remove tag" onClick={() => save(paper, paper.tags.filter(item => item !== tag))}>{tag} ×</button>)}<form onSubmit={e => { e.preventDefault(); const tag = value.trim(); if (tag && !(paper.tags || []).includes(tag)) save(paper, [...(paper.tags || []), tag]); setValue(""); }}><input aria-label="Add paper tag" value={value} onChange={e => setValue(e.target.value)} placeholder="+ tag" maxLength="40" /></form></div>;
}

function ResearchWorkspace({ papers, open }) {
  const [workspace, setWorkspace] = useState({ topic:"", research_question:"", objectives:[], selected_paper_ids:[], drafts:[] });
  const [ids, setIds] = useState([]), [question, setQuestion] = useState(""), [draft, setDraft] = useState("");
  const [action, setAction] = useState(""), [result, setResult] = useState(null), [error, setError] = useState(""), [paperId, setPaperId] = useState("");
  const [referenceResult, setReferenceResult] = useState(null), [graph, setGraph] = useState(null), [readingNotes, setReadingNotes] = useState(null);
  useEffect(() => { api("/analyzer/research-workspace/").then(data => { setWorkspace(data); setIds(data.selected_paper_ids || []); setDraft((data.drafts || []).at(-1)?.text || ""); }).catch(e => setError(e.message)); }, []);
  async function saveWorkspace(extra = {}) { const payload = { ...workspace, selected_paper_ids: ids, ...extra }; try { const data = await api("/analyzer/research-workspace/", { method:"PATCH", body:JSON.stringify(payload) }); setWorkspace(data); setError(""); return data; } catch(e) { setError(e.message); return null; } }
  async function runTool(name) { setAction(name); setError(""); setResult(null); try { const response = await api("/analyzer/research-tools/", { method:"POST", body:JSON.stringify({ action:name, paper_ids:ids, topic:workspace.topic, question:question || workspace.research_question, draft }) }); setResult(response); if(name === "writing" && response.result?.draft) setDraft(response.result.draft); } catch(e) { setError(e.message); } finally { setAction(""); } }
  async function verifyRefs() { setError(""); setReferenceResult(null); try { setReferenceResult(await api(`/analyzer/${paperId}/references/verify/`, { method:"POST", body:"{}" })); } catch(e) { setError(e.message); } }
  async function getGraph() { setError(""); setGraph(null); try { setGraph(await api(`/analyzer/${paperId}/citation-graph/`)); } catch(e) { setError(e.message); } }
  async function loadReadingNotes() { setError(""); try { setReadingNotes(await api(`/papers/${paperId}/annotations/`)); } catch(e) { setError(e.message); } }
  function exportCsv() { const rows = result?.result?.rows || []; if (!rows.length) return; const idsInOrder = ids; const csv = [["Dimension",...idsInOrder.map(id=>papers.find(p=>p.id===id)?.title||`Paper ${id}`)],...rows.map(row=>[row.dimension,...idsInOrder.map(id=>{const item=row.values?.find(v=>Number(v.paper_id)===id);return item?.value||"Not stated"})])].map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(",")).join("\r\n"); downloadText("evidence-matrix.csv",csv,"text/csv"); }
  function exportBibtex() { const entries=referenceResult?.references||[]; if(!entries.length) return; downloadText("verified-references.bib",entries.map((r,i)=>`@article{paper${i+1},\n  title={${r.title||""}},\n  author={${(r.authors||[]).join(" and ")}},\n  journal={${r.publication||""}},\n  year={${r.year||""}},\n  doi={${r.doi}}\n}`).join("\n\n"),"application/x-bibtex"); }
  async function exportDocx() { try { if(!API_BASE_URL) throw new Error("Set VITE_API_URL to enable DOCX export."); const response=await apiFetch("/analyzer/research-export/docx/",{method:"POST",body:JSON.stringify({title:"PaperMind AI research export",content:{topic:workspace.topic,research_question:question||workspace.research_question,result:result?.result,sources:result?.sources}})}); if(!response.ok) throw new Error("Could not export the research result."); downloadText("papermind-research-export.docx",await response.blob(),"application/vnd.openxmlformats-officedocument.wordprocessingml.document"); } catch(e){setError(e.message);} }
  const toggleId = id => setIds(current => current.includes(id) ? current.filter(x=>x!==id) : current.length < 8 ? [...current,id] : current);
  return <><div className="page-heading"><div><div className="eyebrow">PLAN · READ · WRITE</div><h1>Research workspace</h1><p>Keep your research question, selected sources, notes and evidence-led drafts together.</p></div><button className="primary" onClick={()=>saveWorkspace()}>Save workspace</button></div>
    <section className="research-workspace-grid"><article className="panel workspace-project"><h2>Research project</h2><label>Topic<input maxLength="500" value={workspace.topic} onChange={e=>setWorkspace({...workspace,topic:e.target.value})} placeholder="Your research topic" /></label><label>Research question<textarea maxLength="5000" rows="3" value={workspace.research_question} onChange={e=>setWorkspace({...workspace,research_question:e.target.value})} placeholder="What do you want to investigate?" /></label><label>Specific question for AI tools<textarea rows="2" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Optional: scope today's method or writing task" /></label><h3>Source papers ({ids.length}/8 selected)</h3><div className="workspace-paper-list">{papers.map(p=><label key={p.id}><input type="checkbox" checked={ids.includes(p.id)} disabled={!ids.includes(p.id)&&ids.length>=8} onChange={()=>toggleId(p.id)} /><span>{p.title}</span><button type="button" onClick={e=>{e.preventDefault();open(p)}}>Open</button></label>)}</div><button className="secondary-btn" onClick={()=>saveWorkspace()}>Save topic and paper selection</button></article>
    <article className="panel workspace-tools"><h2>Research tools</h2><p>AI outputs are tied to selected papers. Exact source matches are marked; suggestions still need researcher review.</p><div className="workspace-tool-buttons"><button disabled={!!action||ids.length<2} onClick={()=>runTool("matrix")}>{action==="matrix"?"Building…":"Build evidence matrix"}</button><button disabled={!!action||!ids.length} onClick={()=>runTool("gaps")}>{action==="gaps"?"Reviewing…":"Track research gaps"}</button><button disabled={!!action||!ids.length} onClick={()=>runTool("methodology")}>{action==="methodology"?"Planning…":"Methodology helper"}</button><button disabled={!!action||!ids.length} onClick={()=>runTool("flashcards")}>{action==="flashcards"?"Creating…":"Make reading flashcards"}</button><button disabled={!!action||!ids.length} onClick={()=>runTool("writing")}>{action==="writing"?"Drafting…":"Draft with citations"}</button></div><label>Writing draft<textarea rows="7" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Draft or generated passage appears here" /></label><button className="secondary-btn" onClick={async()=>{const drafts=[...(workspace.drafts||[]),{text:draft,updated_at:new Date().toISOString()}].slice(-50);await saveWorkspace({drafts});}}>Save draft to workspace</button></article></section>
    {(workspace.drafts||[]).length>0&&<section className="panel workspace-saved"><h2>Saved notes and drafts</h2>{workspace.drafts.slice().reverse().map((item,index)=><article key={index}><span className="badge neutral">{item.kind||"Draft"} · {item.updated_at?new Date(item.updated_at).toLocaleDateString():"saved"}</span>{item.text&&<p>{item.text}</p>}{item.content&&<pre>{JSON.stringify(item.content,null,2)}</pre>}{item.cards&&item.cards.map((card,i)=><p key={i}><b>{card.question}</b><br/>{card.answer}</p>)}</article>)}</section>}<section className="panel workspace-citation-tools"><h2>Citation graph and reference check</h2><div className="citation-check-row"><select value={paperId} onChange={e=>{setPaperId(e.target.value);setGraph(null);setReferenceResult(null)}}><option value="">Select a paper</option>{papers.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><button className="secondary-btn" disabled={!paperId} onClick={verifyRefs}>Verify DOI references</button><button className="secondary-btn" disabled={!paperId} onClick={getGraph}>Load citation graph</button><button className="secondary-btn" disabled={!paperId} onClick={loadReadingNotes}>Load reading notes</button>{referenceResult?.references?.length>0&&<button className="secondary-btn" onClick={exportBibtex}>Export BibTeX</button>}</div>{readingNotes&&<div className="workspace-reading-notes"><h3>Reading notes and highlights</h3>{readingNotes.notes.map(n=><p key={`n${n.id}`}><span>Note · page {n.page||"—"}:</span> {n.content}</p>)}{readingNotes.highlights.map(h=><p key={`h${h.id}`}><span>Highlight · page {h.page||"—"}:</span> “{h.quote}”</p>)}{!readingNotes.notes.length&&!readingNotes.highlights.length&&<p className="muted">No saved notes or highlights for this paper yet.</p>}</div>}{referenceResult&&<><p className="muted">{referenceResult.note} Checked {referenceResult.references_checked} DOI references.</p>{referenceResult.references.map((r,i)=><article className="reference-result" key={i}><b>{r.title||r.doi}</b><span>{r.authors?.join(", ")} · {r.publication} · {r.year}</span><small>DOI: {r.doi} · {r.status}</small>{r.discrepancies?.length>0&&<small className="reference-discrepancy">Check fields: {r.discrepancies.join(", ")}. Compare the extracted reference entry with this Crossref record.</small>}</article>)}</>}{graph&&<div className="citation-graph-grid"><article><h3>References ({graph.references?.length||0})</h3>{graph.references?.map((x,i)=><p key={i}><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> · {x.year}</p>)}</article><article><h3>Cited by (up to {graph.cited_by?.length||0})</h3>{graph.cited_by?.map((x,i)=><p key={i}><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> · {x.year}</p>)}</article><small>{graph.note||graph.error}</small></div>}</section>
    {error&&<div className="notice error">{error}</div>}{result&&<section className="panel workspace-result"><div className="panel-heading"><div><h2>{({matrix:"Cross-paper evidence matrix",gaps:"Research gap tracker",methodology:"Methodology plan",writing:"Citation-aware draft",flashcards:"Reading flashcards"})[result.action]}</h2><p>{result.confidence_note}</p></div><div><button className="secondary-btn" onClick={exportDocx}>Export DOCX</button>{result.action==="matrix"&&<button className="secondary-btn" onClick={exportCsv}>Export CSV</button>}{result.action==="writing"&&<button className="secondary-btn" onClick={async()=>{await saveWorkspace({drafts:[...(workspace.drafts||[]),{text:draft,updated_at:new Date().toISOString()}].slice(-50)})}}>Save draft</button>}{result.action==="flashcards"&&<button className="secondary-btn" onClick={async()=>{await saveWorkspace({drafts:[...(workspace.drafts||[]),{kind:"Flashcards",cards:result.result.cards||[],updated_at:new Date().toISOString()}].slice(-50)})}}>Save flashcards</button>}{["matrix","gaps","methodology"].includes(result.action)&&<button className="secondary-btn" onClick={async()=>{await saveWorkspace({drafts:[...(workspace.drafts||[]),{kind:result.action,content:result.result,updated_at:new Date().toISOString()}].slice(-50)})}}>Save result</button>}</div></div>{result.action==="matrix"&&<div className="table-wrap"><table><thead><tr><th>DIMENSION</th>{ids.map(id=><th key={id}>{papers.find(p=>p.id===id)?.title}</th>)}</tr></thead><tbody>{result.result.rows?.map((row,i)=><tr key={i}><th>{row.dimension}</th>{ids.map(id=>{const v=row.values?.find(x=>Number(x.paper_id)===id),source=papers.find(p=>p.id===id);return <td key={id}>{v?.value||"Not stated"}{v?.quote&&<small className="workspace-evidence">“{v.quote}” · p. {v.page||"?"} · {v.verified?"source matched":"unverified"}{v.verified&&source?.file_type==="pdf"&&Number.isInteger(v.page)&&<button className="source-page-link" onClick={()=>openPdf(source,false,v.page)}>Open PDF page ↗</button>}</small>}</td>})}</tr>)}</tbody></table></div>}{result.action==="writing"?<><textarea rows="10" value={draft} onChange={e=>setDraft(e.target.value)} />{result.result.citations?.map((c,i)=><p className="muted" key={i}>{c.verified?"✓ Source match":"⚠ Unverified"} · {c.title||`Paper ${c.paper_id}`} · PDF page {c.page||"not identified"} · “{c.quote}”</p>)}</>:<div className="workspace-json">{Object.entries(result.result||{}).map(([key,value])=><article key={key}><h3>{key.replaceAll("_"," ")}</h3>{Array.isArray(value)?value.map((item,i)=><pre key={i}>{typeof item==="string"?item:JSON.stringify(item,null,2)}</pre>):<pre>{typeof value==="string"?value:JSON.stringify(value,null,2)}</pre>}</article>)}</div>}</section>}
  </>;
}
function downloadText(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}

function ComparePapers({ papers }) {
  const [ids, setIds] = useState([]), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function compare() { setBusy(true); setError(""); setResult(null); try { setResult(await api("/analyzer/compare/", { method: "POST", body: JSON.stringify({ paper_ids: ids }) })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  const comparison = result?.comparison || {};
  return <><div className="page-heading"><div><div className="eyebrow">LITERATURE REVIEW</div><h1>Compare papers</h1><p>Compare methods, datasets, findings, and limitations across your library.</p></div></div><section className="panel compare-picker"><h2>Select 2–4 papers</h2><div className="compare-paper-list">{papers.map(p => <label key={p.id}><input type="checkbox" checked={ids.includes(p.id)} disabled={!ids.includes(p.id) && ids.length >= 4} onChange={e => { setIds(current => e.target.checked ? [...current, p.id] : current.filter(id => id !== p.id)); setResult(null); }}/><span><b>{p.title}</b><small>{p.analysis_result ? "Analysis available" : "Source text only"}</small></span></label>)}</div><button className="primary" disabled={ids.length < 2 || busy} onClick={compare}>{busy ? "Synthesizing literature…" : "Compare and synthesize selected papers"}</button>{error && <div className="notice error">{error}</div>}</section>{result && <section className="panel compare-result"><h2>Literature synthesis</h2><p>{comparison.overview}</p>{Array.isArray(comparison.dimensions) && <div className="table-wrap"><table><thead><tr><th>DIMENSION</th>{result.papers.map(p => <th key={p.id}>{p.title}</th>)}</tr></thead><tbody>{comparison.dimensions.map((row,i) => <tr key={i}><th>{row.dimension}</th>{result.papers.map(p => <td key={p.id}>{(row.values || []).find(v => Number(v.paper_id) === p.id)?.value || "Not stated"}</td>)}</tr>)}</tbody></table></div>}<div className="section-grid"><article className="insight-card"><h3>Agreements</h3><BulletValue value={comparison.agreements}/></article><article className="insight-card"><h3>Differences</h3><BulletValue value={comparison.differences}/></article></div>{comparison.research_gaps?.length > 0 && <section className="literature-gaps"><h3>Possible research opportunities</h3><p>These are tentative opportunities suggested by the selected papers; verify them with a broader literature search.</p>{comparison.research_gaps.map((item,i)=><article className="evidence-item" key={i}><b>{item.gap}</b><p>{item.rationale}</p><span className="badge neutral">Suggested by {Array.isArray(item.source_paper_ids) ? item.source_paper_ids.map(id => result.papers.find(p => p.id === Number(id))?.title || `Paper ${id}`).join(", ") : "selected paper evidence"}</span></article>)}</section>}{comparison.evidence?.length > 0 && <section className="evidence-list"><h3>Source evidence</h3>{comparison.evidence.map((item,i)=><article className="evidence-item" key={i}><b>{result.papers.find(p=>p.id===Number(item.paper_id))?.title || "Selected paper"}</b>{item.claim && <p>{item.claim}</p>}<blockquote>“{item.quote}”</blockquote><span className="badge neutral">Page {item.page ?? "not identified"}</span>{item.verified && Number.isInteger(item.page) && result.papers.find(p => p.id === Number(item.paper_id))?.file_type === "pdf" && <button type="button" className="source-page-link" onClick={() => { const sourcePaper = papers.find(p => p.id === Number(item.paper_id)); if (sourcePaper) openPdf(sourcePaper, false, item.page); }}>Open source page ↗</button>} <span className={`badge ${item.verified ? "done" : "pending"}`}>{item.verified ? "Source match" : "Unverified"}</span></article>)}</section>}</section>}</>;
}

function PdfReader({ paper, onClose }) {
  const [url, setUrl] = useState("");
  const [sourceText, setSourceText] = useState(paper.extracted_text || "");
  const [page, setPage] = useState(Math.max(0, Number(paper.initial_page || 1) - 1));
  const [rate, setRate] = useState(Number(localStorage.getItem("papermind-rate") || 1));
  const [playing, setPlaying] = useState(false);
  const [annotations, setAnnotations] = useState({ notes: [], highlights: [] });
  const [note, setNote] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [annotationError, setAnnotationError] = useState("");
  const textRef = useRef(null);
  const pages = [...sourceText.matchAll(/\[Page (\d+)\]\n([\s\S]*?)(?=\n\[Page \d+\]|\s*$)/g)].map(match => ({ number: Number(match[1]), text: match[2].trim() }));
  useEffect(() => { setPage(Math.max(0, Number(paper.initial_page || 1) - 1)); }, [paper.id, paper.initial_page]);
  useEffect(() => { let active = true, objectUrl; if (!API_BASE_URL) return () => { active = false; }; api(`/papers/${paper.id}/`).then(detail => { if (active) setSourceText(detail.extracted_text || ""); }).catch(() => {}); api(`/papers/${paper.id}/annotations/`).then(data => { if (active) setAnnotations(data); }).catch(() => {}); apiFetch(`/papers/${paper.id}/file/`).then(r=>{if(!r.ok) throw new Error("Could not load PDF"); return r.blob();}).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{}); return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);window.speechSynthesis?.cancel();}; }, [paper.id]);
  async function addAnnotation(kind) { setAnnotationError(""); const payload = kind === "note" ? { kind, content: note, page: pages[page]?.number } : { kind, quote: selectedText, page: pages[page]?.number }; try { const item = await api(`/papers/${paper.id}/annotations/`, { method: "POST", body: JSON.stringify(payload) }); setAnnotations(current => ({ ...current, [kind === "note" ? "notes" : "highlights"]: [item, ...current[kind === "note" ? "notes" : "highlights"]] })); if (kind === "note") setNote(""); else setSelectedText(""); } catch (e) { setAnnotationError(e.message); } }
  async function deleteAnnotation(kind, item) { try { await api(`/papers/${paper.id}/annotations/${kind}/${item.id}/`, { method: "DELETE" }); const key = kind === "note" ? "notes" : "highlights"; setAnnotations(current => ({ ...current, [key]: current[key].filter(value => value.id !== item.id) })); } catch (e) { setAnnotationError(e.message); } }
  async function editNote(item) { const content = window.prompt("Edit note", item.content); if (content == null || !content.trim()) return; try { const updated = await api(`/papers/${paper.id}/annotations/note/${item.id}/`, { method: "PATCH", body: JSON.stringify({ content, page: item.page }) }); setAnnotations(current => ({ ...current, notes: current.notes.map(value => value.id === item.id ? updated : value) })); } catch (e) { setAnnotationError(e.message); } }
  function speak() { if (!("speechSynthesis" in window)) return; const selection=window.getSelection()?.toString().trim(); const selectedInside=selection && textRef.current?.contains(window.getSelection()?.anchorNode); const text=normalizeSpeechText(selectedInside ? selection : pages[page]?.text || ""); if(!text) return; window.speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(text); utterance.lang="en-US"; utterance.rate=Number(rate); utterance.onend=()=>setPlaying(false); window.speechSynthesis.speak(utterance); setPlaying(true); }
  function stop() { window.speechSynthesis?.cancel(); setPlaying(false); }
  return <div className="modal-backdrop reader-backdrop"><section className="reader-modal"><header className="reader-header"><div><b>{paper.title}</b><small>PDF reader | page {pages[page]?.number || page+1} of {Math.max(1,pages.length)}</small></div><button className="modal-close" onClick={onClose}>×</button></header><nav className="reader-toolbar"><button className="secondary-btn" disabled={page===0} onClick={()=>{stop();setPage(n=>Math.max(0,n-1));setSelectedText("");}}>Previous</button><select aria-label="PDF page" value={page} onChange={e=>{stop();setPage(Number(e.target.value));setSelectedText("");}}>{pages.map((item,i)=><option key={i} value={i}>Page {item.number}</option>)}</select><button className="secondary-btn" disabled={page>=pages.length-1} onClick={()=>{stop();setPage(n=>Math.min(pages.length-1,n+1));setSelectedText("");}}>Next page</button><button className="primary" onClick={playing?stop:speak}>{playing?"Stop reading":window.getSelection()?.toString().trim()?"Read selected text":"Read this page"}</button><label className="reader-speed">Speed <b>{rate}x</b><input aria-label="Voice speed" type="range" min="0.75" max="2" step="0.25" value={rate} onChange={e=>{const n=Number(e.target.value);setRate(n);localStorage.setItem("papermind-rate",n);}}/></label></nav><div className="reader-content"><div className="pdf-frame">{url?<iframe title="Source PDF" src={`${url}#page=${pages[page]?.number || page+1}&toolbar=0`} />:<div className="reader-loading">Loading secure PDF</div>}</div><div className="reader-side"><article className="page-transcript" ref={textRef} onMouseUp={()=>setSelectedText(window.getSelection()?.toString().trim()||"")} onKeyUp={()=>setSelectedText(window.getSelection()?.toString().trim()||"")}><div className="eyebrow">SELECTABLE PAGE TEXT</div><p>{pages[page]?.text || "No selectable text was extracted from this page."}</p><small>Select text to save it as a highlight.</small><div className="annotation-actions"><button className="secondary-btn" disabled={!selectedText} onClick={()=>addAnnotation("highlight")}>Highlight selection</button></div></article><section className="reader-annotations"><h3>Notes and highlights</h3><form onSubmit={e=>{e.preventDefault();addAnnotation("note");}}><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={`Add a note for page ${pages[page]?.number || page+1}…`} maxLength="10000"/><button className="primary" disabled={!note.trim()}>Save note</button></form>{annotationError && <p className="notice error">{annotationError}</p>}<div className="annotation-list">{annotations.highlights.filter(x=>x.page===pages[page]?.number).map(x=><article key={`h${x.id}`} className="annotation-item"><span className="badge neutral">Highlight · page {x.page}</span><p>“{x.quote}”</p><button onClick={()=>deleteAnnotation("highlight",x)}>Delete</button></article>)}{annotations.notes.filter(x=>x.page===pages[page]?.number).map(x=><article key={`n${x.id}`} className="annotation-item"><span className="badge neutral">Note · page {x.page}</span><p>{x.content}</p><button onClick={()=>editNote(x)}>Edit</button><button onClick={()=>deleteAnnotation("note",x)}>Delete</button></article>)}</div></section></div></div></section></div>;
}

function SelectionVoice() {
  const [selection, setSelection] = useState(""); const [rate,setRate]=useState(Number(localStorage.getItem("papermind-rate")||1));
  useEffect(()=>{const update=()=>setSelection(window.getSelection()?.toString().trim()||"");document.addEventListener("mouseup",update);document.addEventListener("keyup",update);return()=>{document.removeEventListener("mouseup",update);document.removeEventListener("keyup",update);};},[]);
  if(!selection)return null;
  return <div className="selection-voice"><button onClick={()=>{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(normalizeSpeechText(selection));u.rate=rate;u.lang="en-US";window.speechSynthesis.speak(u);}}>Read selection</button><label>Speed <input type="range" min="0.75" max="2" step="0.25" value={rate} onChange={e=>{setRate(Number(e.target.value));localStorage.setItem("papermind-rate",e.target.value);}}/><b>{rate}x</b></label></div>;
}

function AnalysisView({ paper, analysis, busy, usage, setUsage, rebuild, run, go }) {
  const [tab, setTab] = useState("Overview");
  const [chatOpen, setChatOpen] = useState(false);
  const [evidenceCheck, setEvidenceCheck] = useState(null);
  async function verifyEvidence() { try { setEvidenceCheck(await api(`/analyzer/${paper.id}/verify/`, { method: "POST", body: JSON.stringify({}) })); } catch (e) { setEvidenceCheck({ error: e.message }); } }
  if (!paper) return <div className="panel"><Empty title="Choose a paper to analyze" body="Upload a PDF or select one from My Papers." action="Open My Papers" click={() => go("My Papers")} /></div>;
  if (!analysis) return <><div className="page-heading"><div className="eyebrow">PAPER ANALYSIS</div><h1 className="paper-title">{paper.title}</h1><p>Upload date: {new Date(paper.uploaded_at).toLocaleDateString()}</p></div><section className="panel analyze-prompt"><div className="empty-art">PDF</div><h2>{busy ? "Analyzing your paper..." : "Ready to uncover the key insights?"}</h2><p>{busy ? "The analysis is running. Its estimated progress is shown above." : "PaperMind will identify the paper's topic, publication details, method, findings, datasets, models, and evidence."}</p><button className="primary" disabled={busy} onClick={run}>{busy ? "Analysis in progress..." : "Analyze paper"}</button></section></>;
  const overview = analysis.paper_overview || {};
  const tabs = ["Overview", "Methodology", "Results", "Findings", "Limitations", "Future Work", "Evidence", "Proposed Solution"];
  const fieldSections = { Methodology: [["Methodology", "methodology"], ["Research objective", "research_objective"], ["Research problem", "research_problem"]], Findings: [["Key findings", "key_findings"], ["Conclusion", "conclusion"]], Limitations: [["Limitations", "limitations"]], "Future Work": [["Future research", "future_research"]] };
  return <>
    <div className="page-heading"><div><div className="eyebrow">PAPER ANALYSIS</div><h1 className="paper-title">{paper.title}</h1><p>AI analysis grounded in the uploaded document | {new Date(paper.uploaded_at).toLocaleDateString()}</p></div><div className="heading-actions">{paper.file_type === "pdf" && <button className="secondary-btn" onClick={() => openPdf(paper)}>Open paper reader</button>}<button className="secondary-btn" disabled={busy} onClick={rebuild}>Refresh analysis</button><button className="primary" onClick={() => downloadReport(paper, analysis)}>Export report</button></div></div>
    <div className="analysis-tabs">{tabs.map(name => <button key={name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === "Overview" ? <><section className="analysis-confidence-banner"><div><span>Analysis confidence</span><small>{analysis.confidence?.explanation || "Estimated from the amount of paper-supported information identified."}</small></div><strong>{analysis.confidence?.score ?? 0}<i>%</i></strong></section><section className="overview-layout"><article className="panel overview-card"><div className="eyebrow">PAPER SNAPSHOT</div><h2>{overview.topic || analysis.title || paper.title}</h2><div className="metadata-grid">{[["Authors", overview.authors], ["Publication month / year", overview.paper_year], ["Publication type", overview.publication_type], ["Dataset mentioned", overview.dataset_mentioned], ["Dataset type", overview.dataset_type], ["Dataset access", overview.dataset_accessibility]].map(([label, value]) => <div key={label}><small>{label}</small><BulletValue value={value} /></div>)}</div><h3>Paper summary</h3><BulletValue value={analysis.summary} /></article><aside className="panel model-card"><ModelCards models={overview.models}/></aside></section></> : tab === "Results" ? <section className="analysis-layout"><div className="section-grid results-grid"><article className="insight-card"><h3>Paper results</h3><BulletValue value={analysis.results}/></article><article className="insight-card"><h3>Problems addressed and outcomes</h3><BulletValue value={analysis.problems_solved}/></article></div><aside className="panel model-card"><h2>Model accuracy</h2>{overview.models?.length ? overview.models.map((model, i) => <div className="model-item" key={i}><b>{model.name}</b><p className="model-accuracy">Accuracy: {model.accuracy || "Not declared in the paper."}</p></div>) : <p className="muted">No models are identified in the paper.</p>}</aside></section> : tab === "Proposed Solution" ? <section className="section-grid proposed-solution-grid"><article className="insight-card"><h3>Research problems</h3><BulletValue value={analysis.research_problem}/></article><article className="insight-card"><h3>Authors’ proposed solutions</h3><BulletValue value={analysis.proposed_solution}/></article><article className="insight-card"><h3>Problems addressed and outcomes</h3><BulletValue value={analysis.problems_solved}/></article></section> : tab === "Evidence" ? <section className="panel evidence-list"><div className="panel-heading"><div><h2>Evidence and page references</h2><p>Check whether each supporting passage appears verbatim in the extracted PDF text.</p></div><button className="secondary-btn" onClick={verifyEvidence}>Verify evidence</button></div>{evidenceCheck?.error && <div className="notice error">{evidenceCheck.error}</div>}{evidenceCheck && !evidenceCheck.error && <div className="notice">{evidenceCheck.verified} of {evidenceCheck.total} evidence passages matched the source text.</div>}{analysis.evidence?.length ? analysis.evidence.map((item, i) => { const check = evidenceCheck?.evidence?.find(value => value.claim === item.claim); return <article className="evidence-item" key={i}><b>{item.claim}</b><p>{item.support}</p><span className="badge neutral">Page {item.page ?? "not identified"}</span>{paper.file_type === "pdf" && Number.isInteger(item.page) && <button type="button" className="source-page-link" onClick={() => openPdf(paper, false, item.page)}>Open source page ↗</button>}{check && <span className={`badge ${check.status === "verified" ? "done" : "pending"}`}>{check.status === "verified" ? "Source match" : "Unverified"}</span>}</article>; }) : <p className="muted">No page-specific evidence was returned.</p>}</section> : <section className="analysis-layout"><div className="section-grid">{(fieldSections[tab] || []).map(([label, key]) => <article className="insight-card" key={key}><h3>{label}</h3><BulletValue value={analysis[key]} /></article>)}</div><aside className="panel model-card"><ModelCards models={overview.models}/></aside></section>}
    <div className="analysis-actions"><button className="secondary-btn" onClick={() => setChatOpen(true)}>Ask about this paper</button>{paper.file_type === "pdf" && <button className="secondary-btn" onClick={() => openPdf(paper)}>Read the source PDF</button>}</div>
    {chatOpen && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setChatOpen(false)}><section className="chat-modal"><button className="modal-close" aria-label="Close paper chat" onClick={() => setChatOpen(false)}>×</button><ChatErrorBoundary key={paper.id}><Chat papers={[paper]} selected={paper} onSelect={() => {}} usage={usage} setUsage={setUsage} /></ChatErrorBoundary></section></div>}
  </>;
}
function ModelCards({ models = [] }) { return <><h2>Models identified ({models.length})</h2>{models.length ? models.map((model, i) => <div className="model-item" key={i}><b>{model.name}</b><p>{model.explanation}</p><small className="model-accuracy">Accuracy: {model.accuracy || "Not declared in the paper."}</small></div>) : <p className="muted">No model names are stated in the paper.</p>}</>; }
function BulletValue({ value }) { const items = Array.isArray(value) ? value : [value || "Not stated in the paper"]; return <ul className="bullet-value">{items.map((item, i) => <li key={i}>{typeof item === "string" ? item : item?.name ? <><b>{item.name}</b>{item.explanation && ` - ${item.explanation}`}</> : JSON.stringify(item)}</li>)}</ul>; }

function downloadReport(paper, data) {
  const overview=data.paper_overview||{};
  const metadata=[["Topic",overview.topic],["Authors",overview.authors],["Publication month / year",overview.paper_year],["Publication type",overview.publication_type],["Dataset mentioned",overview.dataset_mentioned],["Dataset type",overview.dataset_type],["Dataset access",overview.dataset_accessibility]];
  const lines=[`# ${data.title||paper.title}`,`Uploaded: ${new Date(paper.uploaded_at).toLocaleString()}`,`Analysis coverage: ${data.confidence?.score??"?"}%`,"","## Paper overview",...metadata.map(([label,value])=>`- **${label}:** ${Array.isArray(value)?value.join(", "):value||"Not stated in the paper"}`),"","## Models",...(overview.models||[]).map(model=>`- **${model.name}:** ${model.explanation} Accuracy: ${model.accuracy||"Not declared in the paper."}`),...sections.flatMap(([label,key])=>[``,`## ${label}`,...(Array.isArray(data[key])&&data[key].length?data[key].map(item=>`- ${item}`):[`- ${data[key]||"Not clearly stated in the paper."}`])]),"","## Evidence",...(data.evidence||[]).map(item=>`- ${item.claim} (page ${item.page??"not identified"}): ${item.support}`)].join("\n");
  const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([lines],{type:"text/markdown"}));link.download=`${(paper.title||"analysis").replace(/[^a-z0-9]+/gi,"-").toLowerCase()}-analysis.md`;link.click();URL.revokeObjectURL(link.href);
}

class ChatErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Paper chat render error:", error, info.componentStack); }
  render() {
    if (this.state.error) return <section className="panel chat-crash" role="alert"><h2>Paper chat could not render</h2><p>{this.state.error.message}</p><button className="secondary-btn" onClick={() => window.location.reload()}>Reload workspace</button></section>;
    return this.props.children;
  }
}

function Chat({ papers, selected, onSelect, usage, setUsage }) {
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(Boolean(selected?.id));
  const [error, setError] = useState("");
  const [chatTask, setChatTask] = useState(null);
  const [memories, setMemories] = useState([]);
  const [memoryBusy, setMemoryBusy] = useState(null);
  const end = useRef();
  const selectedId = selected?.id;
  const activeMessages = Array.isArray(messages) ? messages : [];
  const visibleConversations = Array.isArray(conversations) ? conversations : [];
  const activeConversation = visibleConversations.find(item => item.id === conversationId);

  useEffect(() => {
    let active = true;
    if (!selectedId) return () => { active = false; };

    api(`/chat/${selectedId}/memories/`).then(items => { if (active) setMemories(Array.isArray(items) ? items : []); }).catch(() => { if (active) setMemories([]); });

    api(`/chat/${selectedId}/conversations/`).then(async items => {
      if (!active) return;
      const conversationList = Array.isArray(items) ? items : [];
      setConversations(conversationList);
      const latest = conversationList[0];
      if (!latest) return;
      setConversationId(latest.id);
      const history = await api(`/chat/${selectedId}/conversations/${latest.id}/`);
      if (active) setMessages(Array.isArray(history) ? history : []);
    }).catch(e => {
      if (active) setError(`Could not load saved chats: ${e.message}`);
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
  }, [selectedId]);

  // Effects must not return the value of a DOM method: React treats any
  // non-undefined return as a cleanup callback. Keep scrolling side-effect only.
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function startNewChat() {
    if (!selected || busy) return;
    setError("");
    try {
      const conversation = await api(`/chat/${selected.id}/conversations/`, {
        method: "POST",
        body: JSON.stringify({ title: "New chat" }),
      });
      setConversations(items => [conversation, ...items]);
      setConversationId(conversation.id);
      setMessages([]);
      setQuestion("");
    } catch (e) { setError(e.message); }
  }

  async function openConversation(conversation) {
    if (!selected || conversation.id === conversationId) return;
    setConversationId(conversation.id);
    setMessages([]);
    setHistoryLoading(true);
    setError("");
    try {
      const history = await api(`/chat/${selected.id}/conversations/${conversation.id}/`);
      setMessages(Array.isArray(history) ? history : []);
    } catch (e) { setError(`Could not load this chat: ${e.message}`); }
    finally { setHistoryLoading(false); }
  }

  async function deleteConversation(event, conversation) {
    event.stopPropagation();
    if (conversation.is_locked) { setError("Unlock this chat before deleting it."); return; }
    if (!selected || !window.confirm(`Delete chat "${conversation.title}"?`)) return;
    try {
      await api(`/chat/${selected.id}/conversations/${conversation.id}/`, { method: "DELETE" });
      const remaining = conversations.filter(item => item.id !== conversation.id);
      setConversations(remaining);
      if (conversation.id === conversationId) {
        setMessages([]);
        setConversationId(null);
        if (remaining[0]) await openConversation(remaining[0]);
      }
    } catch (e) { setError(e.message); }
  }

  async function renameConversation(event, conversation) {
    event.stopPropagation();
    const title = window.prompt("Rename this chat", conversation.title || "");
    if (title === null) return;
    if (!title.trim()) { setError("Chat name cannot be empty."); return; }
    try {
      const updated = await api(`/chat/${selected.id}/conversations/${conversation.id}/`, {
        method: "PATCH", body: JSON.stringify({ title: title.trim() }),
      });
      setConversations(items => items.map(item => item.id === updated.id ? updated : item));
    } catch (e) { setError(e.message); }
  }

  async function toggleConversationLock(event, conversation) {
    event.stopPropagation();
    try {
      const updated = await api(`/chat/${selected.id}/conversations/${conversation.id}/`, {
        method: "PATCH", body: JSON.stringify({ is_locked: !conversation.is_locked }),
      });
      setConversations(items => items.map(item => item.id === updated.id ? updated : item));
      setError("");
    } catch (e) { setError(e.message); }
  }

  async function send(event) {
    event.preventDefault();
    if (!question.trim() || !selected || busy || activeConversation?.is_locked || usage?.chat_messages?.used >= usage?.chat_messages?.limit) return;
    const text = question.trim();
    setQuestion("");
    setMessages(items => [...items, { question: text, pending: true }]);
    setBusy(true);
    setChatTask(makeTask("chat", selected.title, estimateAiSeconds(selected.extracted_characters || selected.extracted_text)));
    setError("");
    try {
      let activeId = conversationId;
      if (!activeId) {
        const conversation = await api(`/chat/${selected.id}/conversations/`, {
          method: "POST",
          body: JSON.stringify({ title: "New chat" }),
        });
        activeId = conversation.id;
        setConversationId(activeId);
        setConversations(items => [conversation, ...items]);
      }
      const reply = await api(`/chat/${selected.id}/conversations/${activeId}/`, {
        method: "POST",
        body: JSON.stringify({ question: text }),
      });
      setMessages(items => [...items.filter(item => !item.pending), reply]);
      setConversations(items => items.map(item => item.id === activeId
        ? { ...item, title: item.title === "New chat" ? text.slice(0, 197) : item.title, updated_at: reply.created_at }
        : item).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
    } catch (e) {
      setMessages(items => items.filter(item => !item.pending));
      setError(e.message);
      setQuestion(text);
    } finally {
      setBusy(false);
      setChatTask(null);
      api("/auth/usage/").then(setUsage).catch(() => {});
    }
  }

  async function rememberAnswer(message) {
    if (!selectedId || !message?.id || memoryBusy) return;
    setMemoryBusy(message.id);
    try {
      const item = await api(`/chat/${selectedId}/memories/`, { method:"POST", body:JSON.stringify({message_id:message.id}) });
      setMemories(current => [item, ...current.filter(memory => memory.id !== item.id)]);
    } catch (e) { setError(e.message); }
    finally { setMemoryBusy(null); }
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">EVIDENCE GROUNDED Q&A</div><h1>AI paper chat</h1><p>Continue a saved conversation or start a new research chat.</p></div></div>
    {chatTask && <ProcessingBanner task={chatTask} />}
    <section className="chat-workspace panel">
      <aside className="conversation-sidebar">
        <button className="new-chat-button" disabled={!selected || busy} onClick={startNewChat}>+ <span>New chat</span></button>
        <div className="conversation-label">RECENT CHATS</div>
        <div className="conversation-list">
          {visibleConversations.map(conversation => <div key={conversation.id} className={`conversation-item ${conversation.id === conversationId ? "active" : ""}`}>
            <button className="conversation-open" onClick={() => openConversation(conversation)}><span className="conversation-title">{conversation.is_locked ? "🔒 " : ""}{conversation.title || "Untitled chat"}</span><small>{conversation.updated_at ? new Date(conversation.updated_at).toLocaleDateString() : ""}</small></button>
            <div className="conversation-actions"><button className="conversation-action" aria-label={`${conversation.is_locked ? "Unlock" : "Lock"} ${conversation.title}`} title={conversation.is_locked ? "Unlock chat" : "Lock chat"} onClick={event => toggleConversationLock(event, conversation)}>{conversation.is_locked ? "🔓" : "🔒"}</button><button className="conversation-action" aria-label={`Rename ${conversation.title}`} title="Rename chat" onClick={event => renameConversation(event, conversation)}>✎</button><button className="conversation-delete" aria-label={`Delete ${conversation.title}`} title={conversation.is_locked ? "Unlock before deleting" : "Delete chat"} disabled={conversation.is_locked} onClick={event => deleteConversation(event, conversation)}>×</button></div>
          </div>)}
          {!conversations.length && <p className="conversation-empty">Your saved chats will appear here.</p>}
        </div>
      </aside>
      <section className="panel chat-panel">
        <div className="chat-toolbar"><span>Research paper {selected&&<small>{memories.length} saved AI memory notes · private to this paper</small>}</span><select value={selected?.id || ""} onChange={event => onSelect(papers.find(paper => String(paper.id) === event.target.value) || null)}><option value="">Choose a paper...</option>{papers.map(paper => <option key={paper.id} value={paper.id}>{paper.title}</option>)}</select></div>
        {usage?.chat_messages && <div className="chat-quota">Today: {usage.chat_messages.used}/{usage.chat_messages.limit} questions used | {Math.max(0, usage.chat_messages.limit - usage.chat_messages.used)} remaining</div>}
        {!selected ? <Empty title="Select a paper to start chatting" body="Choose an uploaded paper to ask questions about its content." action={null} /> : <>
          <div className="messages">
            {historyLoading && <div className="chat-history-loading">Loading conversation...</div>}
            {!historyLoading && !activeMessages.length && <div className="chat-welcome"><div className="quick-icon purple-bg">AI</div><h2>Ask anything about this paper</h2><p>Answers use the selected paper and retain the context of this conversation.</p><div className="suggestions">{["What are the main results?", "How did the authors conduct the study?", "Explain the key method or equation simply.", "Review the sample, baselines, method, bias, and limitations.", "Suggest a research plan with source evidence.", "Draft an outline and abstract from this paper only.", "Extract the metrics in its tables and figure captions.", "Compare this paper with related papers in my library."].map(prompt => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt} &gt;</button>)}</div></div>}
            {activeMessages.map((message, index) => <div className="message-pair" key={message.id || `pending-${index}`}>
              <div className="question-bubble">{message.question}</div>
              <div className="answer-bubble"><span className="bot-avatar">AI</span><div><p>{message.pending ? "Thinking through the paper..." : String(message.answer || "")}</p>{(Array.isArray(message.evidence) ? message.evidence : []).length > 0 ? <small className="answer-confidence">Evidence coverage: {(message.evidence||[]).filter(item=>item.verified).length}/{message.evidence.length} quoted passages matched the extracted paper. This is source coverage, not a calibrated probability that the full answer is correct.</small> : !message.pending && <small className="answer-confidence">No source passages were returned for this answer; treat it as unverified.</small>}{(Array.isArray(message.evidence) ? message.evidence : []).map((evidence, evidenceIndex) => <div className="chat-evidence" key={evidenceIndex}>{evidence?.claim && <b className="chat-evidence-claim">{evidence.claim}</b>}<span className="badge neutral">{evidence?.support_type || "source claim"}</span><span>“{evidence?.quote || evidence?.support || evidence?.claim || String(evidence)}”</span>{selected?.file_type === "pdf" && evidence?.page && evidence?.verified ? <button type="button" className="source-page-link" onClick={() => openPdf(selected, false, evidence.page)}>Open source · page {evidence.page} ↗</button> : <small>Page {evidence?.page ?? "not identified"} · {evidence?.verified ? "source match" : "not verified"}</small>}</div>)}{!message.pending && message.id && <button type="button" className="text-button" disabled={memoryBusy===message.id||memories.some(memory=>memory.message_id===message.id)} onClick={()=>rememberAnswer(message)}>{memories.some(memory=>memory.message_id===message.id)?"Saved to this paper's private AI memory":memoryBusy===message.id?"Saving memory…":"Remember this answer for this paper"}</button>}</div></div>
            </div>)}
            <div ref={end}/>
          </div>
          {error && <div className="chat-error">{error}</div>}
          {activeConversation?.is_locked && <div className="chat-error">🔒 This chat is locked. Unlock it to send more messages.</div>}
          <form className="chat-compose" onSubmit={send}><input value={question} onChange={event => setQuestion(event.target.value)} placeholder={activeConversation?.is_locked ? "Unlock this chat to continue..." : "Message about this paper..."} disabled={busy || activeConversation?.is_locked}/><button className="primary" aria-label="Send message" disabled={!question.trim() || busy || activeConversation?.is_locked || usage?.chat_messages?.used >= usage?.chat_messages?.limit}>Send</button></form>
        </>}
      </section>
    </section>
  </>;
}

function ResourceSearch({ kind }) {
  const [query, setQuery] = useState("");
  const papers = [{name:"Google Scholar", url:q=>`https://scholar.google.com/scholar?q=${q}`}, {name:"Semantic Scholar", url:q=>`https://www.semanticscholar.org/search?q=${q}`}, {name:"arXiv", url:q=>`https://arxiv.org/search/?query=${q}&searchtype=all`}, {name:"Crossref", url:q=>`https://search.crossref.org/?q=${q}`}];
  const datasets = [{name:"Kaggle", url:q=>`https://www.kaggle.com/search?q=${q}`}, {name:"Hugging Face Datasets", url:q=>`https://huggingface.co/datasets?search=${q}`}, {name:"UCI Machine Learning Repository", url:q=>`https://www.google.com/search?q=site%3Aarchive.ics.uci.edu+${q}`}, {name:"Zenodo", url:q=>`https://zenodo.org/search?q=${q}`}];
  const entries = kind === "papers" ? papers : datasets;
  return <><div className="page-heading"><div><div className="eyebrow">RESEARCH DISCOVERY</div><h1>{kind === "papers" ? "Find related papers" : "Find research datasets"}</h1><p>Search trusted scholarly and data repositories for your topic.</p></div></div><section className="panel resource-panel"><label>Research topic or keywords<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. surface defect detection with CNN" /></label><div className="resource-grid">{entries.map((entry,i)=><a className="resource-link" key={entry.name} href={entry.url(encodeURIComponent(query.trim()))} target="_blank" rel="noreferrer"><span>{kind === "papers" ? "[PDF]" : "[DATA]"}</span><div><b>{entry.name}</b><small>{kind === "papers" ? ["Search academic articles and citations", "Explore papers with research summaries", "Find open-access preprints", "Search publication metadata"][i] : ["Community datasets and competitions", "Open ML datasets and data cards", "Curated machine learning datasets", "Research datasets and supplementary files"][i]}</small></div><strong>Open</strong></a>)}</div><p className="muted">Enter a topic, then choose a repository. Results open in a new browser tab.</p></section></>;
}

function Reports({ papers, open, download }) { const analyzed = papers.filter(p => p.analysis_result); return <><div className="page-heading"><div><div className="eyebrow">YOUR RESEARCH OUTPUT</div><h1>Analysis reports</h1><p>Review and download your saved, evidence-backed analyses.</p></div></div><section className="panel library-panel">{analyzed.length ? <div className="table-wrap"><table><thead><tr><th>PAPER</th><th>COMPLETED</th><th>CONFIDENCE</th><th>EVIDENCE</th><th>ACTIONS</th></tr></thead><tbody>{analyzed.map(p => <tr key={p.id}><td><button className="paper-name" onClick={() => open(p)}><span className="pdf-icon">AI</span><b>{p.title}</b></button></td><td>{new Date(p.uploaded_at).toLocaleDateString()}</td><td>{p.analysis_result.confidence?.score ?? "—"}%</td><td>Available in report</td><td className="actions"><button title="Open report" onClick={() => open(p)}>↗</button><button title="Download report" onClick={() => download(p)}>↓</button></td></tr>)}</tbody></table></div> : <Empty title="No reports yet" body="Analyze one of your papers to create a report." action={null} />}</section></>; }

function VoiceReview({ papers }) {
  const [paperId, setPaperId] = useState(""), [section, setSection] = useState("all"), [rate, setRate] = useState(1), [playing, setPlaying] = useState(false), [analysis, setAnalysis] = useState(null), [analysisError, setAnalysisError] = useState("");
  const paper = papers.find(p => String(p.id) === paperId && p.analysis_result);
  const supported = "speechSynthesis" in window;
  const available = papers.filter(p => p.analysis_result);
  useEffect(() => {
    let active = true;
    setAnalysis(null); setAnalysisError("");
    if (!paperId) return () => { active = false; };
    api(`/papers/${paperId}/analysis/`).then(data => { if (active) setAnalysis(data.analysis); }).catch(error => { if (active) setAnalysisError(error.message); });
    return () => { active = false; };
  }, [paperId]);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  function text(target = section) { if (!analysis) return ""; return sections.filter(([, key]) => target === "all" || target === key).map(([label, key]) => `${label}. ${Array.isArray(analysis[key]) ? analysis[key].join(". ") : analysis[key] || "Not clearly stated in the paper."}`).join(". "); }
  function play(target = section) { if (!supported || !paper || !analysis) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text(target)); utterance.lang = "en-US"; utterance.rate = Number(rate); utterance.onend = () => setPlaying(false); window.speechSynthesis.speak(utterance); setPlaying(true); }
  function pause() { if (playing) { window.speechSynthesis.pause(); setPlaying(false); } else { window.speechSynthesis.resume(); setPlaying(true); } }
  return <><div className="page-heading"><div><div className="eyebrow">LISTEN & REVIEW</div><h1>Voice review</h1><p>Listen to your paper analysis in English.</p></div></div><section className="voice-grid"><div className="panel voice-player"><h2>Choose an analysis</h2><label>Research paper<select value={paperId} onChange={e => { window.speechSynthesis?.cancel(); setPlaying(false); setPaperId(e.target.value); }}><option value="">Select analyzed paper…</option>{available.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Section<select value={section} onChange={e => setSection(e.target.value)}><option value="all">Full analysis</option>{sections.map(([label, key]) => <option value={key} key={key}>{label}</option>)}</select></label><div className="player-controls"><button className="play-button" disabled={!paper || !analysis || !supported} onClick={playing ? () => { window.speechSynthesis.cancel(); setPlaying(false); play(); } : play}>{playing ? "Ⅱ" : "▶"}</button><div><b>{playing ? "Now playing" : analysis ? "Ready to play" : paper ? "Loading analysis…" : "Select a paper"}</b><small>{paper?.title || "An analyzed paper is required"}</small></div><button className="pause-button" disabled={!supported || !paper || !analysis} onClick={pause}>{playing ? "Ⅱ Pause" : "▶ Resume"}</button></div>{analysisError && <p className="notice error">{analysisError}</p>}{!supported && <p className="notice error">Text-to-speech is not supported by this browser.</p>}</div><div className="panel voice-info"><div className="voice-wave" role="img" aria-label="Animated audio waveform">
{Array.from({ length: 17 }, (_, i) => <i key={i} style={{ "--i": i }} />)}
</div><h2>Review at your pace</h2><p>Your browser's English text-to-speech voice reads the saved analysis. Choose one section or listen to the full report.</p><span className="badge neutral">English · Browser voice</span><p className="muted small-text">Bengali voice playback is not available yet.</p></div></section><section className="panel script-panel"><h2>Analysis sections</h2>{available.length && paper && analysis ? sections.map(([label, key], i) => <button key={key} className="script-row" onClick={() => { setSection(key); play(key); }}><span className="script-play">▶</span><span>{i + 1}. {label}</span><small>{analysis[key] ? "Available" : "No content"}</small></button>) : <p className="muted">{analysisError || (paper ? "Loading saved analysis…" : "Complete an analysis to enable voice playback.")}</p>}</section></>;
}

function UserAvatar({ name, tiny=false }) { const [avatar,setAvatar]=useState(localStorage.getItem("papermind-avatar")||""); useEffect(()=>{const update=()=>setAvatar(localStorage.getItem("papermind-avatar")||"");window.addEventListener("papermind:avatar-change",update);return()=>window.removeEventListener("papermind:avatar-change",update);},[]);return <div className={`avatar${tiny?" tiny":""}`}>{avatar && !avatar.startsWith("data:") ? avatar : (name||"U").slice(0,1).toUpperCase()}</div>; }
function AppearanceSettings() {
  const [theme, setTheme] = useState(normalizeTheme(localStorage.getItem("papermind-theme")));
  const [avatar, setAvatar] = useState(() => { const stored = localStorage.getItem("papermind-avatar") || ""; if (stored.startsWith("data:")) { localStorage.removeItem("papermind-avatar"); return ""; } return stored; });
  const choices = [0x1F4DA,0x1F52C,0x1F9E0,0x1F989,0x1F98A,0x1F43C,0x1F680,0x1F33F,0x1F319,0x2728].map(code => String.fromCodePoint(code));
  function updateTheme(value) { setTheme(value); localStorage.setItem("papermind-theme", value); document.querySelector(".app-shell")?.setAttribute("data-theme", value); document.documentElement.dataset.theme = value; }
  function updateAvatar(value) { setAvatar(value); localStorage.setItem("papermind-avatar", value); window.dispatchEvent(new Event("papermind:avatar-change")); }
  return <div className="panel settings-card appearance-card"><div className="settings-head"><div className="quick-icon blue-bg">P</div><div><h2>Appearance and profile icon</h2><p>Choose a workspace theme and a preset profile icon.</p></div></div><label>Workspace theme<select value={theme} onChange={e => updateTheme(e.target.value)}>{themeOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="theme-preview-grid">{themeOptions.map(([id,label,colors]) => <button type="button" key={id} className={`theme-preview ${theme === id ? "selected" : ""}`} onClick={() => updateTheme(id)} aria-label={`Apply ${label} theme`}><span className="theme-swatches">{colors.map(color => <i key={color} style={{backgroundColor:color}} />)}</span><b>{label}</b></button>)}</div><div className="avatar-choices">{choices.map(icon => <button type="button" key={icon} className={avatar === icon ? "selected" : ""} onClick={() => updateAvatar(icon)} aria-label={`Choose ${icon} avatar`}>{icon}</button>)}</div><small>Image uploads are disabled. Choose one of the preset icons above.</small></div>;
}
function Settings({ profile, setProfile, go, save, password, remove }) { const [voiceRate, setVoiceRate] = useState(() => localStorage.getItem("papermind-rate") || "1"); const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [confirm, setConfirm] = useState(""), [deleting, setDeleting] = useState(false), [delPass, setDelPass] = useState(""), [error, setError] = useState(""); async function change(e) { e.preventDefault(); setError(""); if (next !== confirm) return setError("New passwords do not match."); try { await password(current, next); } catch (x) { setError(x.message); } } async function deleteUser(e) { e.preventDefault(); if (!window.confirm("Permanently delete your account and all uploaded papers?")) return; try { await remove(delPass); } catch (x) { setError(x.message); } } return <><div className="page-heading"><div><div className="eyebrow">ACCOUNT PREFERENCES</div><h1>Settings</h1><p>Manage your profile, security, and data.</p></div></div>{error && <div className="notice error">{error}</div>}<section className="settings-grid"><AppearanceSettings /><div className="panel settings-card"><div className="settings-head"><div className="quick-icon blue-bg">♙</div><div><h2>Profile information</h2><p>Update the name and email for your account.</p></div></div><form onSubmit={save}><label>Full name<input required value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })}/></label><label>Email address<input type="email" required value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })}/></label><button className="primary">Save changes</button></form></div><div className="panel settings-card"><div className="settings-head"><div className="quick-icon purple-bg">⌑</div><div><h2>Change password</h2><p>Choose a strong password you have not used before.</p></div></div><form onSubmit={change}><label>Current password<PasswordInput required value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password"/></label><label>New password<PasswordInput minLength={8} required value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password"/></label><label>Confirm new password<PasswordInput required value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"/></label><button className="primary">Update password</button></form></div><div className="panel settings-card voice-settings"><div className="settings-head"><div className="quick-icon green-bg">◖</div><div><h2>Voice playback</h2><p>Playback options are available in Voice Review.</p></div></div><label>Default playback speed<select value={voiceRate} onChange={e => { setVoiceRate(e.target.value); localStorage.setItem("papermind-rate", e.target.value); }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label><button className="secondary-btn" onClick={() => go("Voice Review")}>Open voice player →</button><p className="muted">Speech language: English · Browser default voice</p></div><div className="panel settings-card danger-zone"><div className="settings-head"><div className="quick-icon red-bg">!</div><div><h2>Delete account</h2><p>Remove your account, papers, analyses, and chat history permanently.</p></div></div>{deleting ? <form onSubmit={deleteUser}><label>Confirm with your password<PasswordInput required value={delPass} onChange={e => setDelPass(e.target.value)} autoComplete="current-password"/></label><div className="button-row"><button className="danger-button">Permanently delete</button><button type="button" className="secondary-btn" onClick={() => setDeleting(false)}>Cancel</button></div></form> : <button className="danger-button" onClick={() => setDeleting(true)}>Delete my account</button>}</div></section></>; }

export default App;
