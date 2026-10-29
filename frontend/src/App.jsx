import { Component, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./services/api";
import "./App.css";

const nav = [["Dashboard", "⌂"], ["My Papers", "▤"], ["AI Chat", "◌"], ["Reports", "▧"], ["Voice Review", "◖"], ["Find Papers", "S"], ["Find Datasets", "D"], ["Settings", "⚙"]];
const themeOptions = [["midnight","Midnight",["#080F1B","#111D2E","#C6F36A"]],["light","Light",["#F3F6FB","#FFFFFF","#3478F6"]],["ocean","Ocean",["#061923","#0B2A3B","#56DBC7"]],["red-black","Red Black",["#0D0D0F","#1A1517","#FF4D5A"]],["green-black","Green Black",["#07120D","#102018","#5EE68A"]],["rose-ivory","Rose Ivory",["#FFF5F6","#FFFFFF","#C24166"]],["sky-mist","Sky Mist",["#F0F8FF","#FFFFFF","#1675C7"]],["lavender-cloud","Lavender Cloud",["#F7F4FF","#FFFFFF","#7653C6"]],["sandstone","Sandstone",["#FBF7EF","#FFFDF7","#A35B27"]],["mint-paper","Mint Paper",["#F1FBF6","#FFFFFF","#17845C"]]];
const normalizeTheme = value => value === "violet" ? "lavender-cloud" : value === "forest" ? "green-black" : themeOptions.some(([id]) => id === value) ? value : "midnight";
const sections = [["Research Objective", "research_objective"], ["Research Problem", "research_problem"], ["Methodology", "methodology"], ["Results", "results"], ["Problems Addressed", "problems_solved"], ["Proposed Solution", "proposed_solution"], ["Key Findings", "key_findings"], ["Conclusion", "conclusion"], ["Limitations", "limitations"], ["Future Research", "future_research"], ["Summary", "summary"]];
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
  const title = task.kind === "upload" ? "Reading your PDF" : task.kind === "chat" ? "Finding evidence in your paper" : "Analyzing your paper";
  const subtitle = elapsed > task.estimateSeconds ? "Taking longer than expected — still working" : `Estimated time: ${timeLabel}`;
  return <section className="processing-card" role="status" aria-live="polite">
    <div className="processing-orb">✦</div>
    <div className="processing-copy"><div className="processing-topline"><div><strong>{title}</strong><small>{task.name}</small></div><div className="processing-score"><small>estimated progress</small>{progress}<span>%</span></div></div>
      <div className="processing-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="processing-meta"><span>{subtitle}</span><span>Elapsed {elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`}</span></div>
    </div>
  </section>;
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState("login"), [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reset, setReset] = useState(null);
  async function submit(e) { e.preventDefault(); setBusy(true); setError(""); try {
    if (mode === "forgot") { const r = await api("/auth/password-reset/", { method: "POST", body: JSON.stringify({ email }) }); setReset(r); }
    else { const d = await api(`/auth/${mode === "register" ? "register" : "login"}/`, { method: "POST", body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }) }); onLogin(d); }
  } catch (x) { setError(x.message); } finally { setBusy(false); } }
  return <main className="auth-shell"><section className="auth-brand"><div className="brand-mark">◉</div><h1>PaperMind <span>AI</span></h1><p>Smarter research, faster insights.</p><div className="brand-note"><b>Research, all in one place.</b><p>Upload papers, uncover their key insights, and ask questions with evidence from the source.</p></div></section><section className="auth-panel"><div className="auth-box"><div className="mini-logo">◉ <b>PaperMind AI</b></div><h2>{mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Reset your password"}</h2><p className="muted">{mode === "login" ? "Sign in to continue your research journey." : mode === "register" ? "Your research workspace starts here." : "Enter your account email to get reset instructions."}</p>{error && <div className="notice error">{error}</div>}{reset && <div className="notice">{reset.message}{reset.uid && <div className="reset-codes"><label>Reset UID<input value={reset.uid} readOnly /></label><label>Reset code<input value={reset.token} readOnly /></label><button className="text-button" onClick={() => setMode("reset")}>Continue to set a new password</button></div>}</div>}
    {reset && !reset.uid && <button className="text-button" onClick={() => setMode("reset")}>I have a reset code</button>}{mode === "reset" ? <ResetForm back={() => { setMode("login"); setReset(null); }} /> : <form onSubmit={submit}>{mode === "register" && <label>Full name<input required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /></label>}<label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>{mode !== "forgot" && <label>Password<input type="password" required minLength="8" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>}{mode === "login" && <button type="button" className="forgot" onClick={() => setMode("forgot")}>Forgot password?</button>}<button className="primary full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset instructions"}</button></form>}
    <div className="auth-switch">{mode === "login" ? <>Don't have an account? <button onClick={() => setMode("register")}>Create one</button></> : <><button onClick={() => { setMode("login"); setReset(null); }}>Back to sign in</button></>}</div></div></section></main>;
}
function ResetForm({ back }) { const [uid, setUid] = useState(""), [token, setToken] = useState(""), [password, setPassword] = useState(""), [message, setMessage] = useState(""); async function submit(e) { e.preventDefault(); try { const d = await api("/auth/password-reset/confirm/", { method: "POST", body: JSON.stringify({ uid, token, password }) }); setMessage(d.message); } catch (x) { setMessage(x.message); } } return <><form onSubmit={submit}><label>Reset UID<input required value={uid} onChange={e => setUid(e.target.value)} /></label><label>Reset code<input required value={token} onChange={e => setToken(e.target.value)} /></label><label>New password<input type="password" minLength="8" required value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary full">Set new password</button></form>{message && <p className="muted">{message}</p>}<button className="text-button" onClick={back}>Back to sign in</button></>; }

function App() {
  const [user, setUser] = useState(initialUser), [view, setView] = useState("Dashboard"), [papers, setPapers] = useState([]), [selected, setSelected] = useState(null), [analysis, setAnalysis] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState(""), [query, setQuery] = useState(""), [statusFilter, setStatusFilter] = useState("All"), [busy, setBusy] = useState(false), [task, setTask] = useState(null), [profile, setProfile] = useState({ name: "", email: "" }), [usage, setUsage] = useState(null), [readerPaper, setReaderPaper] = useState(null), [chatPaper, setChatPaper] = useState(null), [toast, setToast] = useState("");
  const fileRef = useRef(); const userId = user?.id;
  const flash = msg => { setToast(msg); setTimeout(() => setToast(""), 2800); };
  const acceptLogin = d => { localStorage.setItem("papermind-token", d.token); localStorage.setItem("papermind-user", JSON.stringify(d.user)); setUser(d.user); setProfile({ name: d.user.name, email: d.user.email }); };
  const logout = () => { localStorage.removeItem("papermind-token"); localStorage.removeItem("papermind-user"); setUser(null); setPapers([]); setSelected(null); };
  async function refresh() { setLoading(true); setError(""); try { const [p, me, u] = await Promise.all([api("/papers/"), api("/auth/profile/"), api("/auth/usage/")]); setPapers(p); setUsage(u); setProfile({ name: me.name, email: me.email }); setUser(me); localStorage.setItem("papermind-user", JSON.stringify(me)); } catch (e) { setError(e.message); if (e.message.includes("expired") || e.message.includes("credentials")) logout(); } finally { setLoading(false); } }
  useEffect(() => { if (!userId) return; let active = true; Promise.all([api("/papers/"), api("/auth/profile/")]).then(([p, me]) => { if (!active) return; setPapers(p); setProfile({ name: me.name, email: me.email }); setUser(me); localStorage.setItem("papermind-user", JSON.stringify(me)); }).catch(e => { if (!active) return; setError(e.message); if (e.message.includes("expired") || e.message.includes("credentials")) logout(); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [userId]);
  useEffect(() => { const theme = normalizeTheme(localStorage.getItem("papermind-theme")); localStorage.setItem("papermind-theme", theme); document.documentElement.dataset.theme = theme; }, []);
  useEffect(() => { if (!userId) return; api("/auth/usage/").then(setUsage).catch(() => {}); }, [userId]);
  useEffect(() => { const reader = e => setReaderPaper(e.detail); const chat = e => setChatPaper(e.detail); window.addEventListener("papermind:open-pdf", reader); window.addEventListener("papermind:open-chat", chat); return () => { window.removeEventListener("papermind:open-pdf", reader); window.removeEventListener("papermind:open-chat", chat); }; }, []);
  const filtered = useMemo(() => papers.filter(p => p.title.toLowerCase().includes(query.toLowerCase()) && (statusFilter === "All" || (p.analysis_result ? "Analyzed" : "Pending") === statusFilter)), [papers, query, statusFilter]);
  async function upload(file) { if (!file) return; setBusy(true); setTask(makeTask("upload", file.name, Math.max(8, Math.ceil(file.size / 1024 / 1024) * 3 + 5))); setError(""); const body = new FormData(); body.append("pdf", file); try { const r = await api("/papers/", { method: "POST", body }); setPapers(p => [r.paper, ...p]); api("/auth/usage/").then(setUsage).catch(() => {}); setSelected(r.paper); setView("My Papers"); flash("PDF uploaded and text extracted."); } catch (e) { setError(e.message); } finally { setBusy(false); setTask(null); if (fileRef.current) fileRef.current.value = ""; } }
  async function choosePaper(paper, runAnalysis = false) {
    setSelected(paper);
    setAnalysis(paper.analysis_result || null);
    setView("Analysis");
    if (!paper.analysis_result && !runAnalysis) return;
    if (paper.analysis_result && !runAnalysis) {
      // Fetch the locally cached report so the backend can enrich older saved
      // analyses with any result/solution passages it previously omitted.
      try {
        const d = await api(`/analyzer/${paper.id}/analyze/`, { method: "POST" });
        setAnalysis(d.analysis);
        setPapers(prev => prev.map(item => item.id === paper.id ? { ...item, analysis_result: d.analysis } : item));
      } catch (e) { setError(e.message); }
      return;
    }
    setBusy(true);
    setTask(makeTask("analysis", paper.title, estimateAiSeconds(paper.extracted_characters || paper.extracted_text)));
    setError("");
    try {
      const d = await api(`/analyzer/${paper.id}/analyze/`, { method: "POST" });
      setAnalysis(d.analysis);
      setPapers(prev => prev.map(item => item.id === paper.id ? { ...item, analysis_result: d.analysis } : item));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); setTask(null); }
  }
  async function rebuildPaper(paper) { setBusy(true); setTask(makeTask("analysis", paper.title, estimateAiSeconds(paper.extracted_characters || paper.extracted_text))); setError(""); try { const d=await api(`/analyzer/${paper.id}/analyze/?refresh=1`,{method:"POST"});setAnalysis(d.analysis);setPapers(prev=>prev.map(item=>item.id===paper.id?{...item,analysis_result:d.analysis}:item));flash("Paper analysis refreshed."); } catch(e) { setError(e.message); } finally { setBusy(false);setTask(null); } }
  async function removePaper(p) { if (!window.confirm(`Delete “${p.title}” and its saved analysis?`)) return; try { await api(`/papers/${p.id}/`, { method: "DELETE" }); setPapers(xs => xs.filter(x => x.id !== p.id)); if (selected?.id === p.id) { setSelected(null); setAnalysis(null); } flash("Paper deleted."); } catch (e) { setError(e.message); } }
  if (!user) return <Auth onLogin={acceptLogin} />;
  return <div className="app-shell" data-theme={normalizeTheme(localStorage.getItem("papermind-theme"))}><aside className="sidebar"><div className="sidebar-brand"><div className="brand-icon">◉</div><div><b>PaperMind <span>AI</span></b><small>Research workspace</small></div></div><div className="workspace-label">WORKSPACE</div><nav>{nav.map(([label, icon]) => <button key={label} className={view === label || (label === "Reports" && view === "Analysis") ? "active" : ""} onClick={() => setView(label)}><i>{icon}</i>{label}{label === "My Papers" && papers.length > 0 && <em>{papers.length}</em>}</button>)}</nav><div className="sidebar-bottom"><div className="user-chip"><UserAvatar name={user.name} /><div><b>{user.name}</b><small>{user.email}</small></div><button title="Sign out" onClick={logout}>↪</button></div></div></aside>
  <div className="main-area"><header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{view}</b></div><div className="top-actions"><button className="icon-button" title="Refresh papers" onClick={refresh}>⟳</button><button className="profile-menu" onClick={() => setView("Settings")}><UserAvatar name={user.name} tiny />{user.name}⌄</button></div></header><main className="content">
    {readerPaper && <PdfReader paper={readerPaper} onClose={() => setReaderPaper(null)} />}
    {chatPaper && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setChatPaper(null)}><section className="chat-modal"><button className="modal-close" onClick={() => setChatPaper(null)}>×</button><ChatErrorBoundary key={chatPaper.id || "no-paper"}><Chat papers={papers} selected={chatPaper} onSelect={setChatPaper} usage={usage} setUsage={setUsage} /></ChatErrorBoundary></section></div>}
    <SelectionVoice />
    {task && <ProcessingBanner task={task} />}
    {error && <div className="notice error"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
    {view === "Dashboard" && <Dashboard user={user} papers={papers} busy={busy || loading} usage={usage} upload={() => fileRef.current?.click()} open={choosePaper} go={setView} />}
    {view === "My Papers" && <Papers papers={filtered} query={query} setQuery={setQuery} filter={statusFilter} setFilter={setStatusFilter} busy={busy || loading} upload={() => fileRef.current?.click()} open={choosePaper} remove={removePaper} />}
    {view === "Analysis" && <AnalysisView paper={selected} analysis={analysis} busy={busy} usage={usage} setUsage={setUsage} rebuild={() => selected && rebuildPaper(selected)} run={() => selected && choosePaper(selected, true)} go={setView} />}
    {view === "AI Chat" && <ChatErrorBoundary key={selected?.id || "no-paper"}><Chat papers={papers} selected={selected} onSelect={setSelected} usage={usage} setUsage={setUsage} /></ChatErrorBoundary>}
    {view === "Find Papers" && <ResourceSearch kind="papers" />}
    {view === "Find Datasets" && <ResourceSearch kind="datasets" />}
    {view === "Reports" && <Reports papers={papers} open={choosePaper} />}
    {view === "Voice Review" && <VoiceReview papers={papers} />}
    {view === "Settings" && <Settings profile={profile} setProfile={setProfile} go={setView} save={async e => { e.preventDefault(); try { const d = await api("/auth/profile/", { method: "PATCH", body: JSON.stringify(profile) }); setUser(d); localStorage.setItem("papermind-user", JSON.stringify(d)); flash("Profile updated."); } catch (x) { setError(x.message); } }} password={async (current_password, new_password) => { const d = await api("/auth/password/", { method: "POST", body: JSON.stringify({ current_password, new_password }) }); flash(d.message); logout(); }} remove={async password => { await api("/auth/account/", { method: "DELETE", body: JSON.stringify({ password }) }); logout(); }} />}
  </main></div><input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => upload(e.target.files?.[0])} />{toast && <div className="toast">✓ {toast}</div>}</div>;
}

function Dashboard({ user, papers, busy, usage, upload, open, go }) { const complete = papers.filter(p => p.analysis_result).length; return <><div className="welcome-row"><div><div className="eyebrow">YOUR RESEARCH AT A GLANCE</div><h1>Good morning, {user.name?.split(" ")[0] || "researcher"}</h1><p>Pick up where you left off or bring a new paper into your workspace.</p></div><button className="primary" onClick={upload}>{busy ? "Processing…" : "+ Upload PDF"}</button><div className="research-visual" aria-hidden="true"><div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="analysis-core"><span>✦</span></div><div className="float-card float-paper"><i>PDF</i><span>Paper insight</span><b>Finding detected</b><div className="mini-lines"><i></i><i></i><i></i></div></div><div className="float-card float-score"><small>AI CONFIDENCE</small><strong>94<span>%</span></strong><div className="score-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><span className="spark spark-a">✦</span><span className="spark spark-b">✧</span></div></div><div className="stat-grid"><Stat icon="▤" label="Total papers" value={papers.length} note="In your library" color="blue"/><Stat icon="✓" label="Completed analyses" value={complete} note={papers.length ? `${Math.round(complete / papers.length * 100)}% of your library` : "Ready when you are"} color="green"/><Stat icon="◷" label="Pending analysis" value={papers.length - complete} note="Papers to explore" color="orange"/><Stat icon="▧" label="Saved reports" value={complete} note="Available to download" color="purple"/></div>{usage && <div className="quota-strip"><b>Today's usage</b><span>PDF uploads <strong>{usage.uploads.used}/{usage.uploads.limit}</strong></span><span>Chat messages <strong>{usage.chat_messages.used}/{usage.chat_messages.limit}</strong></span></div>}<div className="dashboard-grid"><section className="panel papers-panel"><div className="panel-heading"><div><h2>Recent papers</h2><p>Your latest additions</p></div><button className="link-button" onClick={() => go("My Papers")}>View all <span>→</span></button></div>{papers.length ? <div className="table-wrap"><table><thead><tr><th>PAPER</th><th>UPLOADED</th><th>STATUS</th><th></th></tr></thead><tbody>{papers.slice(0, 6).map(p => <tr key={p.id}><td><button className="paper-name" onClick={() => open(p, Boolean(!p.analysis_result))}><span className="pdf-icon">PDF</span>{p.title}</button></td><td>{new Date(p.uploaded_at).toLocaleDateString()}</td><td><span className={`badge ${p.analysis_result ? "done" : "pending"}`}>{p.analysis_result ? "Analyzed" : "Pending"}</span></td><td><button className="row-action" title="Open analysis" onClick={() => open(p, Boolean(!p.analysis_result))}>↗</button></td></tr>)}</tbody></table></div> : <Empty title="Your library is ready" body="Upload a research paper and its analysis will appear here." action="Upload your first PDF" click={upload} />}</section><section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Keep your research moving</p></div></div><button className="quick-action" onClick={upload}><span className="quick-icon blue-bg">↑</span><span><b>Upload a paper</b><small>Extract text from a PDF</small></span><i>→</i></button><button className="quick-action" onClick={() => go("AI Chat")}><span className="quick-icon purple-bg">✧</span><span><b>Ask about a paper</b><small>Get evidence-backed answers</small></span><i>→</i></button><button className="quick-action" onClick={() => go("Reports")}><span className="quick-icon green-bg">▧</span><span><b>Review reports</b><small>Browse completed analyses</small></span><i>→</i></button><div className="privacy-note">🔒 <span>Your papers are private to your account.</span></div></section></div></>; }
function Stat({ icon, label, value, note, color }) { return <div className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div className="stat-label">{label}</div><strong>{value}</strong><small>{note}</small></div>; }
function Empty({ title, body, action, click }) { return <div className="empty-state"><div className="empty-art">▤</div><b>{title}</b><p>{body}</p>{action && <button className="primary small" onClick={click}>{action}</button>}</div>; }
async function openPdf(paper, download = false) { if (!download) { window.dispatchEvent(new CustomEvent("papermind:open-pdf", { detail: paper })); return; } const popup = null; try { const response = await fetch(`${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api"}/papers/${paper.id}/file/`, { headers: { Authorization: `Bearer ${localStorage.getItem("papermind-token")}` } }); if (!response.ok) throw new Error("Could not open this PDF."); const url = URL.createObjectURL(await response.blob()); if (download) { const a = document.createElement("a"); a.href = url; a.download = `${paper.title}.pdf`; a.click(); } else if (popup) popup.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (e) { popup?.close(); window.alert(e.message); } }

function Papers({ papers, query, setQuery, filter, setFilter, busy, upload, open, remove }) { return <><div className="page-heading"><div><div className="eyebrow">YOUR LIBRARY</div><h1>My papers</h1><p>Manage your research papers and saved analysis.</p></div><button className="primary" onClick={upload} disabled={busy}>+ Upload PDF</button></div><section className="panel library-panel"><div className="toolbar"><div className="searchbox"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search papers…" /></div><select value={filter} onChange={e => setFilter(e.target.value)}><option>All</option><option>Analyzed</option><option>Pending</option></select><span className="results-count">{papers.length} paper{papers.length === 1 ? "" : "s"}</span></div>{papers.length ? <div className="table-wrap"><table><thead><tr><th>PAPER TITLE</th><th>UPLOADED</th><th>STATUS</th><th>ANALYSIS SCORE</th><th>ACTIONS</th></tr></thead><tbody>{papers.map(p => <tr key={p.id}><td><button className="paper-name" onClick={() => open(p)}><span className="pdf-icon">PDF</span><span><b>{p.title}</b><small>PDF document</small></span></button></td><td>{new Date(p.uploaded_at).toLocaleDateString()}</td><td><span className={`badge ${p.analysis_result ? "done" : "pending"}`}>{p.analysis_result ? "Analyzed" : "Pending"}</span></td><td>{p.analysis_result ? <><b>{p.analysis_result.confidence?.score ?? "—"}%</b> <span className="muted">confidence</span></> : <span className="muted">Not analyzed yet</span>}</td><td className="actions"><button title="Analyze / view analysis" onClick={() => open(p, !p.analysis_result)}>{p.analysis_result ? "◉" : "✧"}</button><button title="Preview PDF" onClick={() => openPdf(p)}>▣</button><button title="Download PDF" onClick={() => openPdf(p, true)}>↓</button><button title="Delete paper" onClick={() => remove(p)}>⌫</button></td></tr>)}</tbody></table></div> : <Empty title="No papers match" body="Try a different search or upload a research PDF." action="Upload PDF" click={upload} />}</section><p className="hint">PDF files up to 20 MB with selectable text are supported. Scanned PDF OCR is not available yet.</p></>; }

function PdfReader({ paper, onClose }) {
  const [url, setUrl] = useState("");
  const [sourceText, setSourceText] = useState(paper.extracted_text || "");
  const [page, setPage] = useState(0);
  const [rate, setRate] = useState(Number(localStorage.getItem("papermind-rate") || 1));
  const [playing, setPlaying] = useState(false);
  const textRef = useRef(null);
  const pages = [...sourceText.matchAll(/\[Page (\d+)\]\n([\s\S]*?)(?=\n\[Page \d+\]|\s*$)/g)].map(match => ({ number: Number(match[1]), text: match[2].trim() }));
  useEffect(() => { let active = true, objectUrl; api(`/papers/${paper.id}/`).then(detail => { if (active) setSourceText(detail.extracted_text || ""); }).catch(() => {}); fetch(`${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api"}/papers/${paper.id}/file/`, {headers:{Authorization:`Bearer ${localStorage.getItem("papermind-token")}`}}).then(r=>{if(!r.ok) throw new Error("Could not load PDF"); return r.blob();}).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{}); return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);window.speechSynthesis?.cancel();}; }, [paper.id]);
  function speak() { if (!("speechSynthesis" in window)) return; const selection=window.getSelection()?.toString().trim(); const selectedInside=selection && textRef.current?.contains(window.getSelection()?.anchorNode); const text=normalizeSpeechText(selectedInside ? selection : pages[page]?.text || ""); if(!text) return; window.speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(text); utterance.lang="en-US"; utterance.rate=Number(rate); utterance.onend=()=>setPlaying(false); window.speechSynthesis.speak(utterance); setPlaying(true); }
  function stop() { window.speechSynthesis?.cancel(); setPlaying(false); }
  return <div className="modal-backdrop reader-backdrop"><section className="reader-modal"><header className="reader-header"><div><b>{paper.title}</b><small>PDF reader | page {pages[page]?.number || page+1} of {Math.max(1,pages.length)}</small></div><button className="modal-close" onClick={onClose}>×</button></header><nav className="reader-toolbar"><button className="secondary-btn" disabled={page===0} onClick={()=>{stop();setPage(n=>Math.max(0,n-1));}}>Previous</button><select aria-label="PDF page" value={page} onChange={e=>{stop();setPage(Number(e.target.value));}}>{pages.map((item,i)=><option key={i} value={i}>Page {item.number}</option>)}</select><button className="secondary-btn" disabled={page>=pages.length-1} onClick={()=>{stop();setPage(n=>Math.min(pages.length-1,n+1));}}>Next page</button><button className="primary" onClick={playing?stop:speak}>{playing?"Stop reading":window.getSelection()?.toString().trim()?"Read selected text":"Read this page"}</button><label className="reader-speed">Speed <b>{rate}x</b><input aria-label="Voice speed" type="range" min="0.75" max="2" step="0.25" value={rate} onChange={e=>{const n=Number(e.target.value);setRate(n);localStorage.setItem("papermind-rate",n);}}/></label></nav><div className="reader-content"><div className="pdf-frame">{url?<iframe title="Source PDF" src={`${url}#page=${pages[page]?.number || page+1}&toolbar=0`} />:<div className="reader-loading">Loading secure PDF</div>}</div><article className="page-transcript" ref={textRef}><div className="eyebrow">SELECTABLE PAGE TEXT</div><p>{pages[page]?.text || "No selectable text was extracted from this page."}</p><small>Select a line above and press "Read selected text", or listen to the entire page.</small></article></div></section></div>;
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
  if (!paper) return <div className="panel"><Empty title="Choose a paper to analyze" body="Upload a PDF or select one from My Papers." action="Open My Papers" click={() => go("My Papers")} /></div>;
  if (!analysis) return <><div className="page-heading"><div className="eyebrow">PAPER ANALYSIS</div><h1 className="paper-title">{paper.title}</h1><p>Upload date: {new Date(paper.uploaded_at).toLocaleDateString()}</p></div><section className="panel analyze-prompt"><div className="empty-art">PDF</div><h2>{busy ? "Analyzing your paper..." : "Ready to uncover the key insights?"}</h2><p>{busy ? "The analysis is running. Its estimated progress is shown above." : "PaperMind will identify the paper's topic, publication details, method, findings, datasets, models, and evidence."}</p><button className="primary" disabled={busy} onClick={run}>{busy ? "Analysis in progress..." : "Analyze paper"}</button></section></>;
  const overview = analysis.paper_overview || {};
  const tabs = ["Overview", "Methodology", "Results", "Findings", "Limitations", "Future Work", "Evidence", "Proposed Solution"];
  const fieldSections = { Methodology: [["Methodology", "methodology"], ["Research objective", "research_objective"], ["Research problem", "research_problem"]], Findings: [["Key findings", "key_findings"], ["Conclusion", "conclusion"]], Limitations: [["Limitations", "limitations"]], "Future Work": [["Future research", "future_research"]] };
  return <>
    <div className="page-heading"><div><div className="eyebrow">PAPER ANALYSIS</div><h1 className="paper-title">{paper.title}</h1><p>AI analysis grounded in the uploaded paper | {new Date(paper.uploaded_at).toLocaleDateString()}</p></div><div className="heading-actions"><button className="secondary-btn" onClick={() => openPdf(paper)}>Open paper reader</button><button className="secondary-btn" disabled={busy} onClick={rebuild}>Refresh analysis</button><button className="primary" onClick={() => downloadReport(paper, analysis)}>Export report</button></div></div>
    <div className="analysis-tabs">{tabs.map(name => <button key={name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === "Overview" ? <><section className="analysis-confidence-banner"><div><span>Analysis confidence</span><small>{analysis.confidence?.explanation || "Estimated from the amount of paper-supported information identified."}</small></div><strong>{analysis.confidence?.score ?? 0}<i>%</i></strong></section><section className="overview-layout"><article className="panel overview-card"><div className="eyebrow">PAPER SNAPSHOT</div><h2>{overview.topic || analysis.title || paper.title}</h2><div className="metadata-grid">{[["Authors", overview.authors], ["Publication month / year", overview.paper_year], ["Publication type", overview.publication_type], ["Dataset mentioned", overview.dataset_mentioned], ["Dataset type", overview.dataset_type], ["Dataset access", overview.dataset_accessibility]].map(([label, value]) => <div key={label}><small>{label}</small><BulletValue value={value} /></div>)}</div><h3>Paper summary</h3><BulletValue value={analysis.summary} /></article><aside className="panel model-card"><ModelCards models={overview.models}/></aside></section></> : tab === "Results" ? <section className="analysis-layout"><div className="section-grid results-grid"><article className="insight-card"><h3>Paper results</h3><BulletValue value={analysis.results}/></article><article className="insight-card"><h3>Problems addressed and outcomes</h3><BulletValue value={analysis.problems_solved}/></article></div><aside className="panel model-card"><h2>Model accuracy</h2>{overview.models?.length ? overview.models.map((model, i) => <div className="model-item" key={i}><b>{model.name}</b><p className="model-accuracy">Accuracy: {model.accuracy || "Not declared in the paper."}</p></div>) : <p className="muted">No models are identified in the paper.</p>}</aside></section> : tab === "Proposed Solution" ? <section className="section-grid proposed-solution-grid"><article className="insight-card"><h3>Research problems</h3><BulletValue value={analysis.research_problem}/></article><article className="insight-card"><h3>Authors’ proposed solutions</h3><BulletValue value={analysis.proposed_solution}/></article><article className="insight-card"><h3>Problems addressed and outcomes</h3><BulletValue value={analysis.problems_solved}/></article></section> : tab === "Evidence" ? <section className="panel evidence-list"><h2>Evidence and page references</h2>{analysis.evidence?.length ? analysis.evidence.map((item, i) => <article className="evidence-item" key={i}><b>{item.claim}</b><p>{item.support}</p><span className="badge neutral">Page {item.page ?? "not identified"}</span></article>) : <p className="muted">No page-specific evidence was returned.</p>}</section> : <section className="analysis-layout"><div className="section-grid">{(fieldSections[tab] || []).map(([label, key]) => <article className="insight-card" key={key}><h3>{label}</h3><BulletValue value={analysis[key]} /></article>)}</div><aside className="panel model-card"><ModelCards models={overview.models}/></aside></section>}
    <div className="analysis-actions"><button className="secondary-btn" onClick={() => setChatOpen(true)}>Ask about this paper</button><button className="secondary-btn" onClick={() => openPdf(paper)}>Read the source PDF</button></div>
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
  const end = useRef();
  const selectedId = selected?.id;
  const activeMessages = Array.isArray(messages) ? messages : [];
  const visibleConversations = Array.isArray(conversations) ? conversations : [];
  const activeConversation = visibleConversations.find(item => item.id === conversationId);

  useEffect(() => {
    let active = true;
    if (!selectedId) return () => { active = false; };

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
        <div className="chat-toolbar"><span>Research paper</span><select value={selected?.id || ""} onChange={event => onSelect(papers.find(paper => String(paper.id) === event.target.value) || null)}><option value="">Choose a paper...</option>{papers.map(paper => <option key={paper.id} value={paper.id}>{paper.title}</option>)}</select></div>
        {usage?.chat_messages && <div className="chat-quota">Today: {usage.chat_messages.used}/{usage.chat_messages.limit} questions used | {Math.max(0, usage.chat_messages.limit - usage.chat_messages.used)} remaining</div>}
        {!selected ? <Empty title="Select a paper to start chatting" body="Choose an uploaded paper to ask questions about its content." action={null} /> : <>
          <div className="messages">
            {historyLoading && <div className="chat-history-loading">Loading conversation...</div>}
            {!historyLoading && !activeMessages.length && <div className="chat-welcome"><div className="quick-icon purple-bg">AI</div><h2>Ask anything about this paper</h2><p>Answers use the selected paper and retain the context of this conversation.</p><div className="suggestions">{["What are the main results?", "How did the authors conduct the study?", "What limitations do the authors mention?"].map(prompt => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt} &gt;</button>)}</div></div>}
            {activeMessages.map((message, index) => <div className="message-pair" key={message.id || `pending-${index}`}>
              <div className="question-bubble">{message.question}</div>
              <div className="answer-bubble"><span className="bot-avatar">AI</span><div><p>{message.pending ? "Thinking through the paper..." : String(message.answer || "")}</p>{(Array.isArray(message.evidence) ? message.evidence : []).map((evidence, evidenceIndex) => <div className="chat-evidence" key={evidenceIndex}><span>"{evidence?.quote || evidence?.support || evidence?.claim || String(evidence)}"</span><b>Page {evidence?.page ?? "not identified"}</b></div>)}</div></div>
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

function Reports({ papers, open }) { const analyzed = papers.filter(p => p.analysis_result); return <><div className="page-heading"><div><div className="eyebrow">YOUR RESEARCH OUTPUT</div><h1>Analysis reports</h1><p>Review and download your saved, evidence-backed analyses.</p></div></div><section className="panel library-panel">{analyzed.length ? <div className="table-wrap"><table><thead><tr><th>PAPER</th><th>COMPLETED</th><th>CONFIDENCE</th><th>EVIDENCE</th><th>ACTIONS</th></tr></thead><tbody>{analyzed.map(p => <tr key={p.id}><td><button className="paper-name" onClick={() => open(p)}><span className="pdf-icon">AI</span><b>{p.title}</b></button></td><td>{new Date(p.uploaded_at).toLocaleDateString()}</td><td>{p.analysis_result.confidence?.score ?? "—"}%</td><td>{p.analysis_result.evidence?.length || 0} references</td><td className="actions"><button title="Open report" onClick={() => open(p)}>↗</button><button title="Download report" onClick={() => downloadReport(p, p.analysis_result)}>↓</button></td></tr>)}</tbody></table></div> : <Empty title="No reports yet" body="Analyze one of your papers to create a report." action={null} />}</section></>; }

function VoiceReview({ papers }) { const [paperId, setPaperId] = useState(""), [section, setSection] = useState("all"), [rate, setRate] = useState(1), [playing, setPlaying] = useState(false); const paper = papers.find(p => String(p.id) === paperId && p.analysis_result); const supported = "speechSynthesis" in window; function text(target = section) { const a = paper?.analysis_result; if (!a) return ""; return sections.filter(([, k]) => target === "all" || target === k).map(([label, key]) => `${label}. ${Array.isArray(a[key]) ? a[key].join(". ") : a[key] || "Not clearly stated in the paper."}`).join(". "); } function play(target = section) { if (!supported || !paper) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text(target)); utterance.lang = "en-US"; utterance.rate = Number(rate); utterance.onend = () => setPlaying(false); window.speechSynthesis.speak(utterance); setPlaying(true); } function pause() { if (playing) { window.speechSynthesis.pause(); setPlaying(false); } else { window.speechSynthesis.resume(); setPlaying(true); } } useEffect(() => () => window.speechSynthesis?.cancel(), []); const available = papers.filter(p => p.analysis_result); return <><div className="page-heading"><div><div className="eyebrow">LISTEN & REVIEW</div><h1>Voice review</h1><p>Listen to your paper analysis in English.</p></div></div><section className="voice-grid"><div className="panel voice-player"><h2>Choose an analysis</h2><label>Research paper<select value={paperId} onChange={e => { window.speechSynthesis?.cancel(); setPlaying(false); setPaperId(e.target.value); }}><option value="">Select analyzed paper…</option>{available.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Section<select value={section} onChange={e => setSection(e.target.value)}><option value="all">Full analysis</option>{sections.map(([label, key]) => <option value={key} key={key}>{label}</option>)}</select></label><div className="player-controls"><button className="play-button" disabled={!paper || !supported} onClick={playing ? () => { window.speechSynthesis.cancel(); setPlaying(false); play(); } : play}>{playing ? "Ⅱ" : "▶"}</button><div><b>{playing ? "Now playing" : paper ? "Ready to play" : "Select a paper"}</b><small>{paper?.title || "An analyzed paper is required"}</small></div><button className="pause-button" disabled={!supported || !paper} onClick={pause}>{playing ? "Ⅱ Pause" : "▶ Resume"}</button></div><div className="speed-control"><label>Playback speed <b>{rate}×</b></label><input type="range" min="0.75" max="1.5" step="0.25" value={rate} onChange={e => { setRate(e.target.value); localStorage.setItem("papermind-rate", e.target.value); }} /></div>{!supported && <p className="notice error">Text-to-speech is not supported by this browser.</p>}</div><div className="panel voice-info"><div className="voice-wave" role="img" aria-label="Animated audio waveform">
{Array.from({ length: 17 }, (_, i) => <i key={i} style={{ "--i": i }} />)}
</div><h2>Review at your pace</h2><p>Your browser's English text-to-speech voice reads the saved analysis. Choose one section or listen to the full report.</p><span className="badge neutral">English · Browser voice</span><p className="muted small-text">Bengali voice playback is not available yet.</p></div></section><section className="panel script-panel"><h2>Analysis sections</h2>{available.length && paper ? sections.map(([label, key], i) => <button key={key} className="script-row" onClick={() => { setSection(key); play(key); }}><span className="script-play">▶</span><span>{i + 1}. {label}</span><small>{paper.analysis_result[key] ? "Available" : "No content"}</small></button>) : <p className="muted">Complete an analysis to enable voice playback.</p>}</section></>; }

function UserAvatar({ name, tiny=false }) { const [avatar,setAvatar]=useState(localStorage.getItem("papermind-avatar")||""); useEffect(()=>{const update=()=>setAvatar(localStorage.getItem("papermind-avatar")||"");window.addEventListener("papermind:avatar-change",update);return()=>window.removeEventListener("papermind:avatar-change",update);},[]);return <div className={`avatar${tiny?" tiny":""}`}>{avatar.startsWith("data:")?<img src={avatar} alt="Profile"/>:avatar||((name||"U").slice(0,1).toUpperCase())}</div>; }
function AppearanceSettings() { const [theme,setTheme]=useState(normalizeTheme(localStorage.getItem("papermind-theme"))); const [avatar,setAvatar]=useState(localStorage.getItem("papermind-avatar")||""); const choices=[String.fromCodePoint(0x1F4DA), String.fromCodePoint(0x1F52C), String.fromCodePoint(0x1F9E0), String.fromCodePoint(0x1F989), String.fromCodePoint(0x1F98A), String.fromCodePoint(0x1F43C), String.fromCodePoint(0x1F680), String.fromCodePoint(0x1F33F), String.fromCodePoint(0x1F319), String.fromCodePoint(0x2728)]; const themes=themeOptions; function updateTheme(value){setTheme(value);localStorage.setItem("papermind-theme",value);document.querySelector(".app-shell")?.setAttribute("data-theme",value);document.documentElement.dataset.theme=value;} function updateAvatar(value){setAvatar(value);localStorage.setItem("papermind-avatar",value);window.dispatchEvent(new Event("papermind:avatar-change"));} function upload(e){const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith("image/")){window.alert("Choose an image file.");return;}if(file.size>2*1024*1024){window.alert("Profile images must be 2 MB or smaller.");return;}const reader=new FileReader();reader.onload=()=>updateAvatar(String(reader.result));reader.readAsDataURL(file);} return <div className="panel settings-card appearance-card"><div className="settings-head"><div className="quick-icon blue-bg">P</div><div><h2>Appearance and profile icon</h2><p>Choose a workspace theme and profile image or icon.</p></div></div><label>Workspace theme<select value={theme} onChange={e=>updateTheme(e.target.value)}>{themes.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><div className="theme-preview-grid">{themes.map(([id,label,colors])=><button type="button" key={id} className={`theme-preview ${theme===id?"selected":""}`} onClick={()=>updateTheme(id)} aria-label={`Apply ${label} theme`}><span className="theme-swatches">{colors.map(color=><i key={color} style={{backgroundColor:color}} />)}</span><b>{label}</b></button>)}</div><div className="avatar-choices">{choices.map(icon=><button key={icon} className={avatar===icon?"selected":""} onClick={()=>updateAvatar(icon)} aria-label={`Choose ${icon} avatar`}>{icon}</button>)}</div><label className="avatar-upload">Upload profile image<input type="file" accept="image/*" onChange={upload}/></label><small>Images up to 2 MB. Stored in this browser.</small></div>; }

function Settings({ profile, setProfile, go, save, password, remove }) { const [voiceRate, setVoiceRate] = useState(() => localStorage.getItem("papermind-rate") || "1"); const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [confirm, setConfirm] = useState(""), [deleting, setDeleting] = useState(false), [delPass, setDelPass] = useState(""), [error, setError] = useState(""); async function change(e) { e.preventDefault(); setError(""); if (next !== confirm) return setError("New passwords do not match."); try { await password(current, next); } catch (x) { setError(x.message); } } async function deleteUser(e) { e.preventDefault(); if (!window.confirm("Permanently delete your account and all uploaded papers?")) return; try { await remove(delPass); } catch (x) { setError(x.message); } } return <><div className="page-heading"><div><div className="eyebrow">ACCOUNT PREFERENCES</div><h1>Settings</h1><p>Manage your profile, security, and data.</p></div></div>{error && <div className="notice error">{error}</div>}<section className="settings-grid"><AppearanceSettings /><div className="panel settings-card"><div className="settings-head"><div className="quick-icon blue-bg">♙</div><div><h2>Profile information</h2><p>Update the name and email for your account.</p></div></div><form onSubmit={save}><label>Full name<input required value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })}/></label><label>Email address<input type="email" required value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })}/></label><button className="primary">Save changes</button></form></div><div className="panel settings-card"><div className="settings-head"><div className="quick-icon purple-bg">⌑</div><div><h2>Change password</h2><p>Choose a strong password you have not used before.</p></div></div><form onSubmit={change}><label>Current password<input type="password" required value={current} onChange={e => setCurrent(e.target.value)}/></label><label>New password<input type="password" minLength="8" required value={next} onChange={e => setNext(e.target.value)}/></label><label>Confirm new password<input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}/></label><button className="primary">Update password</button></form></div><div className="panel settings-card voice-settings"><div className="settings-head"><div className="quick-icon green-bg">◖</div><div><h2>Voice playback</h2><p>Playback options are available in Voice Review.</p></div></div><label>Default playback speed<select value={voiceRate} onChange={e => { setVoiceRate(e.target.value); localStorage.setItem("papermind-rate", e.target.value); }}><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></label><button className="secondary-btn" onClick={() => go("Voice Review")}>Open voice player →</button><p className="muted">Speech language: English · Browser default voice</p></div><div className="panel settings-card danger-zone"><div className="settings-head"><div className="quick-icon red-bg">!</div><div><h2>Delete account</h2><p>Remove your account, papers, analyses, and chat history permanently.</p></div></div>{deleting ? <form onSubmit={deleteUser}><label>Confirm with your password<input type="password" required value={delPass} onChange={e => setDelPass(e.target.value)}/></label><div className="button-row"><button className="danger-button">Permanently delete</button><button type="button" className="secondary-btn" onClick={() => setDeleting(false)}>Cancel</button></div></form> : <button className="danger-button" onClick={() => setDeleting(true)}>Delete my account</button>}</div></section></>; }

export default App;
