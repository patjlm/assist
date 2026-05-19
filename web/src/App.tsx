import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import {
  openuiLibrary,
  openuiPromptOptions,
} from "@openuidev/react-ui";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import { api, type Agent, type SessionMeta, type Message, type User, type Realm, type Theme, type Schedule } from "./api";

type CenterMode = "welcome" | "chat" | "agent-form" | "session-edit" | "realm-edit" | "realm-create";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [centerMode, setCenterMode] = useState<CenterMode>("welcome");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [realms, setRealms] = useState<Realm[]>([]);
  const [activeRealm, setActiveRealm] = useState<Realm | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formGlobal, setFormGlobal] = useState("");
  const [formModel, setFormModel] = useState("gemini-2.5-flash");
  const [formTemp, setFormTemp] = useState("");
  const [formTopP, setFormTopP] = useState("");
  const [formTopK, setFormTopK] = useState("");
  const [formMaxTokens, setFormMaxTokens] = useState("");
  const [formStopSeq, setFormStopSeq] = useState("");
  const [formPresence, setFormPresence] = useState("");
  const [formFrequency, setFormFrequency] = useState("");
  const [formInclude, setFormInclude] = useState<"default" | "none">("default");
  const [formNoParent, setFormNoParent] = useState(false);
  const [formNoPeers, setFormNoPeers] = useState(false);
  const [formOutputKey, setFormOutputKey] = useState("");
  const [formEnableUi, setFormEnableUi] = useState(false);
  const [formSessionTtl, setFormSessionTtl] = useState("");
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<Record<string, boolean>>({});
  const [realmEditName, setRealmEditName] = useState("");
  const [realmCreateName, setRealmCreateName] = useState("");
  const [editingSession, setEditingSession] = useState<SessionMeta | null>(null);
  const [sessionFormTitle, setSessionFormTitle] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [schedPrompt, setSchedPrompt] = useState("");
  const [schedEnabled, setSchedEnabled] = useState(true);
  const [schedOneTime, setSchedOneTime] = useState(false);
  const [schedIntervalValue, setSchedIntervalValue] = useState("1");
  const [schedIntervalUnit, setSchedIntervalUnit] = useState("hours");
  const [schedUseCron, setSchedUseCron] = useState(false);
  const [schedCron, setSchedCron] = useState("");

  const messagesEnd = useRef<HTMLDivElement>(null);

  const uiPrompt = useMemo(
    () => openuiLibrary.prompt(openuiPromptOptions),
    []
  );

  const sessionsByAgent = useMemo(() => {
    const map = new Map<string, SessionMeta[]>();
    for (const s of sessions) {
      const list = map.get(s.agent_id) ?? [];
      list.push(s);
      map.set(s.agent_id, list);
    }
    return map;
  }, [sessions]);

  const loadAgents = useCallback(async () => {
    if (!activeRealm) return;
    setAgents(await api.agents.list(activeRealm.id));
  }, [activeRealm]);

  const loadSessions = useCallback(async (agentId?: string) => {
    if (!activeRealm) return;
    setSessions(await api.sessions.list(activeRealm.id, agentId));
  }, [activeRealm]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    api.auth.me().then(async (u) => {
      setUser(u);
      setAuthChecked(true);
      if (u) {
        const [realmList, prefs] = await Promise.all([
          api.realms.list(),
          api.preferences.get(),
        ]);
        setRealms(realmList);
        setTheme(prefs.theme);
        const personal = realmList.find((r) => r.personal) ?? realmList[0];
        if (personal) setActiveRealm(personal);
      }
    });
  }, []);

  useEffect(() => {
    if (!activeRealm) return;
    api.agents.list(activeRealm.id).then(setAgents);
    api.sessions.list(activeRealm.id).then(setSessions);
  }, [activeRealm]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!hamburgerOpen) return;
    const handler = () => setHamburgerOpen(false);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [hamburgerOpen]);

  if (!authChecked) {
    return (
      <div className="app">
        <div className="login-page">
          <span className="spinner" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app">
        <div className="login-page">
          <h1>assist</h1>
          <p className="login-subtitle">Multi-agent chat platform</p>
          <a href="/api/auth/login" className="google-login-btn">
            Sign in with Google
          </a>
        </div>
      </div>
    );
  }

  async function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    await api.preferences.update({ theme: next });
  }

  async function openSession(sessionId: string) {
    const detail = await api.sessions.get(activeRealm!.id, sessionId);
    const agent = agents.find((a) => a.id === detail.agent_id) ?? null;
    setActiveAgent(agent);
    setActiveSession(sessionId);
    setMessages(detail.messages);
    setCenterMode("chat");
  }

  async function newSession(agentId: string) {
    const meta = await api.sessions.create(activeRealm!.id, agentId);
    const agent = agents.find((a) => a.id === agentId) ?? null;
    setActiveAgent(agent);
    setActiveSession(meta.id);
    setMessages([]);
    setCenterMode("chat");
    loadSessions();
  }

  async function sendMessage() {
    if (!input.trim() || !activeSession || streaming) return;
    const text = input.trim();
    setInput("");
    const userMsg: Message = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const agentMsg: Message = {
      role: "agent",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, agentMsg]);

    try {
      const uiArg = activeAgent?.enable_ui ? uiPrompt : undefined;
      for await (const chunk of api.chat(activeRealm!.id, activeSession, text, uiArg)) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk,
          };
          return updated;
        });
      }
    } catch (e) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `Error: ${e}`,
        };
        return updated;
      });
    }
    setStreaming(false);
    loadSessions();
  }

  function optNum(v: string): number | undefined {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }

  function optInt(v: string): number | undefined {
    const n = parseInt(v, 10);
    return isNaN(n) ? undefined : n;
  }

  function resetForm() {
    setFormName("");
    setFormDesc("");
    setFormPrompt("");
    setFormGlobal("");
    setFormModel("gemini-2.5-flash");
    setFormTemp("");
    setFormTopP("");
    setFormTopK("");
    setFormMaxTokens("");
    setFormStopSeq("");
    setFormPresence("");
    setFormFrequency("");
    setFormInclude("default");
    setFormNoParent(false);
    setFormNoPeers(false);
    setFormOutputKey("");
    setFormEnableUi(false);
    setFormSessionTtl("");
    setEditingAgent(null);
    setShowAdvanced(false);
    setSchedules([]);
    resetScheduleForm();
    setCenterMode("welcome");
  }

  function populateForm(a: Agent) {
    setFormName(a.name);
    setFormDesc(a.description);
    setFormPrompt(a.system_prompt);
    setFormGlobal(a.global_instruction);
    setFormModel(a.model);
    setFormTemp(a.temperature != null ? String(a.temperature) : "");
    setFormTopP(a.top_p != null ? String(a.top_p) : "");
    setFormTopK(a.top_k != null ? String(a.top_k) : "");
    setFormMaxTokens(a.max_output_tokens != null ? String(a.max_output_tokens) : "");
    setFormStopSeq(a.stop_sequences?.join(", ") ?? "");
    setFormPresence(a.presence_penalty != null ? String(a.presence_penalty) : "");
    setFormFrequency(a.frequency_penalty != null ? String(a.frequency_penalty) : "");
    setFormInclude(a.include_contents);
    setFormNoParent(a.disallow_transfer_to_parent);
    setFormNoPeers(a.disallow_transfer_to_peers);
    setFormOutputKey(a.output_key ?? "");
    setFormEnableUi(a.enable_ui);
    setFormSessionTtl(a.session_ttl_days != null ? String(a.session_ttl_days) : "");
  }

  function editAgent(a: Agent) {
    setEditingAgent(a);
    populateForm(a);
    setCenterMode("agent-form");
    resetScheduleForm();
    loadSchedules(a.id);
  }

  function collectFormData() {
    const stopSeqs = formStopSeq
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      name: formName,
      description: formDesc,
      system_prompt: formPrompt,
      global_instruction: formGlobal || undefined,
      model: formModel,
      temperature: optNum(formTemp),
      top_p: optNum(formTopP),
      top_k: optNum(formTopK),
      max_output_tokens: optInt(formMaxTokens),
      stop_sequences: stopSeqs.length ? stopSeqs : undefined,
      presence_penalty: optNum(formPresence),
      frequency_penalty: optNum(formFrequency),
      include_contents: formInclude,
      disallow_transfer_to_parent: formNoParent,
      disallow_transfer_to_peers: formNoPeers,
      output_key: formOutputKey || undefined,
      enable_ui: formEnableUi,
      session_ttl_days: optInt(formSessionTtl),
    };
  }

  async function saveAgent() {
    if (!formName.trim() || !formPrompt.trim()) return;
    try {
      if (editingAgent) {
        await api.agents.update(activeRealm!.id, editingAgent.id, collectFormData());
      } else {
        await api.agents.create(activeRealm!.id, collectFormData());
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    resetForm();
    loadAgents();
  }

  async function deleteAgent(id: string) {
    const agent = agents.find((a) => a.id === id);
    const { count } = await api.agents.sessionCount(activeRealm!.id, id);
    const sessionInfo = count > 0
      ? `\n\n${count} session${count === 1 ? "" : "s"} will also be deleted.`
      : "";
    if (!confirm(`Delete agent "${agent?.name ?? id}"?${sessionInfo}`)) return;
    await api.agents.delete(activeRealm!.id, id);
    if (editingAgent?.id === id) {
      setCenterMode("welcome");
      setEditingAgent(null);
    }
    loadAgents();
    loadSessions();
  }

  async function deleteSession(id: string) {
    await api.sessions.delete(activeRealm!.id, id);
    if (activeSession === id) {
      setActiveSession(null);
      setMessages([]);
      setCenterMode("welcome");
    }
    loadSessions();
  }

  async function loadSchedules(agentId: string) {
    if (!activeRealm) return;
    setSchedules(await api.schedules.list(activeRealm.id, agentId));
  }

  function resetScheduleForm() {
    setShowScheduleForm(false);
    setEditingSchedule(null);
    setSchedPrompt("");
    setSchedEnabled(true);
    setSchedOneTime(false);
    setSchedIntervalValue("1");
    setSchedIntervalUnit("hours");
    setSchedUseCron(false);
    setSchedCron("");
  }

  function intervalToSeconds(value: string, unit: string): number {
    const n = parseInt(value, 10) || 1;
    if (unit === "days") return n * 86400;
    if (unit === "weeks") return n * 604800;
    return n * 3600;
  }

  async function saveSchedule() {
    if (!activeRealm || !editingAgent || !schedPrompt.trim()) return;
    const body = {
      prompt: schedPrompt,
      enabled: schedEnabled,
      one_time: schedOneTime,
      interval_seconds: schedUseCron ? undefined : intervalToSeconds(schedIntervalValue, schedIntervalUnit),
      cron_expression: schedUseCron ? schedCron : undefined,
    };
    try {
      if (editingSchedule) {
        await api.schedules.update(activeRealm.id, editingSchedule.id, body);
      } else {
        await api.schedules.create(activeRealm.id, editingAgent.id, body);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    resetScheduleForm();
    loadSchedules(editingAgent.id);
  }

  async function deleteSchedule(id: string) {
    if (!activeRealm || !editingAgent) return;
    await api.schedules.delete(activeRealm.id, id);
    loadSchedules(editingAgent.id);
  }

  async function toggleScheduleEnabled(sched: Schedule) {
    if (!activeRealm || !editingAgent) return;
    await api.schedules.update(activeRealm.id, sched.id, { enabled: !sched.enabled });
    loadSchedules(editingAgent.id);
  }

  async function runScheduleNow(schedId: string) {
    if (!activeRealm || !editingAgent) return;
    const { session_id } = await api.schedules.run(activeRealm.id, schedId);
    loadSchedules(editingAgent.id);
    loadSessions();
    if (session_id) openSession(session_id);
  }

  function startEditSchedule(sched: Schedule) {
    setEditingSchedule(sched);
    setSchedPrompt(sched.prompt);
    setSchedEnabled(sched.enabled);
    setSchedOneTime(sched.one_time);
    if (sched.cron_expression) {
      setSchedUseCron(true);
      setSchedCron(sched.cron_expression);
    } else {
      setSchedUseCron(false);
      const secs = sched.interval_seconds ?? 3600;
      if (secs % 604800 === 0) { setSchedIntervalValue(String(secs / 604800)); setSchedIntervalUnit("weeks"); }
      else if (secs % 86400 === 0) { setSchedIntervalValue(String(secs / 86400)); setSchedIntervalUnit("days"); }
      else { setSchedIntervalValue(String(secs / 3600)); setSchedIntervalUnit("hours"); }
    }
    setShowScheduleForm(true);
  }

  function formatScheduleTime(iso: string | null): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleString();
  }

  function editSession(s: SessionMeta) {
    setEditingSession(s);
    setSessionFormTitle(s.title);
    setCenterMode("session-edit");
  }

  async function saveSession() {
    if (!editingSession) return;
    await api.sessions.update(activeRealm!.id, editingSession.id, {
      title: sessionFormTitle,
    });
    setEditingSession(null);
    loadSessions();
    setCenterMode("welcome");
  }

  function toggleSidebarNode(agentId: string) {
    setSidebarCollapsed((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  }

  function openRealmEdit() {
    if (!activeRealm) return;
    setRealmEditName(activeRealm.name);
    setCenterMode("realm-edit");
  }

  async function saveRealm() {
    if (!activeRealm || !realmEditName.trim()) return;
    try {
      await api.realms.update(activeRealm.id, { name: realmEditName.trim() });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    const realmList = await api.realms.list();
    setRealms(realmList);
    const updated = realmList.find((r) => r.id === activeRealm.id);
    if (updated) setActiveRealm(updated);
    setCenterMode("welcome");
  }

  async function deleteRealm() {
    if (!activeRealm) return;
    if (!confirm(`Delete realm "${activeRealm.name}"? All agents and sessions will be lost.`)) return;
    await api.realms.delete(activeRealm.id);
    const realmList = await api.realms.list();
    setRealms(realmList);
    const next = realmList[0] ?? null;
    setActiveRealm(next);
    setCenterMode("welcome");
  }

  async function createRealm() {
    if (!realmCreateName.trim()) return;
    let created: Realm;
    try {
      created = await api.realms.create(realmCreateName.trim());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    const realmList = await api.realms.list();
    setRealms(realmList);
    const newRealm = realmList.find((r) => r.id === created.id);
    if (newRealm) setActiveRealm(newRealm);
    setRealmCreateName("");
    setCenterMode("welcome");
  }

  return (
    <div className="app">
      <header className="top-bar">
        <div className="top-bar-left">
          <select
            className="realm-select"
            value={activeRealm?.id ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setRealmCreateName("");
                setCenterMode("realm-create");
                e.target.value = activeRealm?.id ?? "";
                return;
              }
              const r = realms.find((r) => r.id === e.target.value);
              if (r) {
                setActiveRealm(r);
                setCenterMode("welcome");
              }
            }}
          >
            {realms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.personal ? " (personal)" : ""}
              </option>
            ))}
            <option disabled>───────────</option>
            <option value="__new__">+ New realm...</option>
          </select>
          <button className="icon-btn" onClick={openRealmEdit} title="Edit realm">
            Edit
          </button>
        </div>
        <div className="top-bar-right">
          <div className="user-info">
            {user.picture && <img src={user.picture} className="avatar" alt="" referrerPolicy="no-referrer" />}
            <span className="user-name">{user.name || user.email}</span>
          </div>
          <div className="hamburger-wrapper">
            <button
              className="hamburger-btn"
              onClick={(e) => {
                e.stopPropagation();
                setHamburgerOpen(!hamburgerOpen);
              }}
              title="Menu"
            >
              &#9776;
            </button>
            {hamburgerOpen && (
              <div className="dropdown-menu hamburger-menu">
                <button onClick={toggleTheme}>
                  {theme === "dark" ? "Light theme" : "Dark theme"}
                </button>
                <button onClick={async () => { await api.auth.logout(); setUser(null); }}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <button
            className="new-btn"
            onClick={() => {
              resetForm();
              setCenterMode("agent-form");
            }}
          >
            + New agent
          </button>
          {agents.map((a) => {
            const collapsed = sidebarCollapsed[a.id] ?? false;
            const agentSessions = sessionsByAgent.get(a.id) ?? [];
            const isEditingThis = centerMode === "agent-form" && editingAgent?.id === a.id;
            return (
              <div key={a.id} className="agent-tree-node">
                <div
                  className={`agent-tree-header${isEditingThis ? " active" : ""}`}
                >
                  <span
                    className={`chevron${collapsed ? "" : " open"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSidebarNode(a.id);
                    }}
                  >
                    &#9654;
                  </span>
                  <span className="agent-tree-name" onClick={() => editAgent(a)}>
                    {a.name}
                  </span>
                  <span className="model-tag">{a.model}</span>
                  <button
                    className="new-session-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      newSession(a.id);
                    }}
                    title="New session"
                  >
                    +
                  </button>
                </div>
                {!collapsed && (
                  <div className="agent-tree-sessions">
                    {agentSessions.map((s) => (
                      <div
                        key={s.id}
                        className={`session-item${centerMode === "chat" && s.id === activeSession ? " active" : ""}`}
                        onClick={() => openSession(s.id)}
                      >
                        <span className="session-title">
                          {s.title || "..."}
                        </span>
                        <button
                          className="edit-session"
                          onClick={(e) => {
                            e.stopPropagation();
                            editSession(s);
                          }}
                          title="Edit session"
                        >
                          &#9998;
                        </button>
                        <button
                          className="delete-session"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(s.id);
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {agents.length === 0 && (
            <p className="empty">No agents yet.</p>
          )}
        </aside>

        <main className="center-pane">
          {centerMode === "welcome" && (
            <div className="welcome-pane">
              <h2>assist</h2>
              <p>Select a session or create an agent to get started.</p>
            </div>
          )}

          {centerMode === "realm-edit" && activeRealm && (
            <div className="realm-edit-form">
              <h2>{activeRealm.personal ? "Personal realm" : "Edit realm"}</h2>
              <label className="field">
                <span className="field-label">Realm name</span>
                <input
                  value={realmEditName}
                  onChange={(e) => setRealmEditName(e.target.value)}
                  placeholder="Realm name"
                />
              </label>
              <div className="form-actions">
                <button onClick={saveRealm}>Save</button>
                <button type="button" onClick={() => setCenterMode("welcome")}>Cancel</button>
              </div>
              {!activeRealm.personal && (
                <button className="danger delete-realm-btn" onClick={deleteRealm}>
                  Delete realm
                </button>
              )}
            </div>
          )}

          {centerMode === "realm-create" && (
            <div className="realm-edit-form">
              <h2>New realm</h2>
              <label className="field">
                <span className="field-label">Realm name</span>
                <input
                  value={realmCreateName}
                  onChange={(e) => setRealmCreateName(e.target.value)}
                  placeholder="e.g. My Team"
                  autoFocus
                />
              </label>
              <div className="form-actions">
                <button onClick={createRealm}>Create</button>
                <button type="button" onClick={() => setCenterMode("welcome")}>Cancel</button>
              </div>
            </div>
          )}

          {centerMode === "agent-form" && (
            <div className="agent-form">
              <h2>{editingAgent ? `Edit: ${editingAgent.name}` : "New agent"}</h2>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  placeholder="e.g. Code Reviewer"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Description</span>
                <span className="field-hint">
                  Short summary shown in the agent list. Also used by parent
                  agents to decide when to delegate to this one.
                </span>
                <input
                  placeholder="e.g. Reviews code for bugs and style issues"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">System prompt</span>
                <span className="field-hint">
                  The core instruction that defines the agent's behavior.
                  Supports {"{"} session_state_key {"}"} template variables.
                </span>
                <textarea
                  placeholder="You are a helpful assistant that..."
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  rows={4}
                />
              </label>

              <label className="field">
                <span className="field-label">Model</span>
                <input
                  placeholder="gemini-2.5-flash"
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                />
              </label>

              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={formEnableUi}
                  onChange={(e) => setFormEnableUi(e.target.checked)}
                />
                <div>
                  <span className="field-label">Enable UI components</span>
                  <span className="field-hint">
                    Allow the agent to render rich UI: charts, tables, forms,
                    cards, tabs, and more via OpenUI.
                  </span>
                </div>
              </label>

              <button
                type="button"
                className="toggle-advanced"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? "- Hide" : "+ Show"} advanced settings
              </button>

              {showAdvanced && (
                <div className="advanced-section">
                  <label className="field">
                    <span className="field-label">Session TTL (days)</span>
                    <span className="field-hint">
                      Sessions are deleted after this many days of inactivity.
                      Default is 7. Set to 0 for no expiration.
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="7 (default)"
                      value={formSessionTtl}
                      onChange={(e) => setFormSessionTtl(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Global instruction</span>
                    <span className="field-hint">
                      Prepended to this agent and all its sub-agents. Use for
                      shared rules like output format or safety guidelines.
                    </span>
                    <textarea
                      placeholder="Always respond in markdown..."
                      value={formGlobal}
                      onChange={(e) => setFormGlobal(e.target.value)}
                      rows={2}
                    />
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Temperature</span>
                      <span className="field-hint">
                        0 = deterministic, 2 = very creative
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="2"
                        placeholder="default"
                        value={formTemp}
                        onChange={(e) => setFormTemp(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Top P</span>
                      <span className="field-hint">
                        Nucleus sampling cutoff (0-1)
                      </span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        placeholder="default"
                        value={formTopP}
                        onChange={(e) => setFormTopP(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Top K</span>
                      <span className="field-hint">
                        Number of top tokens to consider
                      </span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="default"
                        value={formTopK}
                        onChange={(e) => setFormTopK(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="field-row">
                    <label className="field">
                      <span className="field-label">Max output tokens</span>
                      <span className="field-hint">
                        Limit response length
                      </span>
                      <input
                        type="number"
                        step="256"
                        min="1"
                        placeholder="default"
                        value={formMaxTokens}
                        onChange={(e) => setFormMaxTokens(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Presence penalty</span>
                      <span className="field-hint">
                        Penalize repeated topics (-2 to 2)
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        min="-2"
                        max="2"
                        placeholder="default"
                        value={formPresence}
                        onChange={(e) => setFormPresence(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Frequency penalty</span>
                      <span className="field-hint">
                        Penalize repeated words (-2 to 2)
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        min="-2"
                        max="2"
                        placeholder="default"
                        value={formFrequency}
                        onChange={(e) => setFormFrequency(e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span className="field-label">Stop sequences</span>
                    <span className="field-hint">
                      Comma-separated strings that stop generation when produced
                    </span>
                    <input
                      placeholder='e.g. END, ###'
                      value={formStopSeq}
                      onChange={(e) => setFormStopSeq(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Output key</span>
                    <span className="field-hint">
                      If set, the agent's response is saved to session state under
                      this key, making it available to other agents via{" "}
                      {"{"} key_name {"}"}
                    </span>
                    <input
                      placeholder="e.g. review_result"
                      value={formOutputKey}
                      onChange={(e) => setFormOutputKey(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Include contents</span>
                    <span className="field-hint">
                      Whether to include conversation history in the LLM context.
                      Set to "none" for stateless agents that only use the current
                      input.
                    </span>
                    <select
                      value={formInclude}
                      onChange={(e) =>
                        setFormInclude(e.target.value as "default" | "none")
                      }
                    >
                      <option value="default">default (include history)</option>
                      <option value="none">none (stateless)</option>
                    </select>
                  </label>

                  <div className="field-row">
                    <label className="field checkbox-field">
                      <input
                        type="checkbox"
                        checked={formNoParent}
                        onChange={(e) => setFormNoParent(e.target.checked)}
                      />
                      <div>
                        <span className="field-label">
                          Disallow transfer to parent
                        </span>
                        <span className="field-hint">
                          Prevent this agent from escalating back to its parent
                        </span>
                      </div>
                    </label>
                    <label className="field checkbox-field">
                      <input
                        type="checkbox"
                        checked={formNoPeers}
                        onChange={(e) => setFormNoPeers(e.target.checked)}
                      />
                      <div>
                        <span className="field-label">
                          Disallow transfer to peers
                        </span>
                        <span className="field-hint">
                          Prevent this agent from delegating to sibling agents
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button onClick={saveAgent}>
                  {editingAgent ? "Save" : "Create"}
                </button>
                <button type="button" onClick={resetForm}>Cancel</button>
              </div>
              {editingAgent && (
                <button
                  className="danger delete-agent-btn"
                  onClick={() => deleteAgent(editingAgent.id)}
                >
                  Delete agent
                </button>
              )}

              {editingAgent && (
                <div className="schedule-section">
                  <h3>Schedules</h3>
                  {schedules.length > 0 && (
                    <div className="schedule-list">
                      {schedules.map((sched) => (
                        <div key={sched.id} className="schedule-item">
                          <span className={`schedule-status${sched.enabled ? " active" : ""}`} />
                          <div className="schedule-info">
                            <div className="schedule-prompt">{sched.prompt}</div>
                            <div className="schedule-meta">
                              Next: {formatScheduleTime(sched.next_run_at)}
                              {sched.last_run_at && (
                                <> &middot; Last: {formatScheduleTime(sched.last_run_at)}</>
                              )}
                              {sched.last_session_id && (
                                <> &middot; <a onClick={() => openSession(sched.last_session_id!)}>view session</a></>
                              )}
                              {sched.one_time && <> &middot; one-time</>}
                            </div>
                          </div>
                          <div className="schedule-actions">
                            <button onClick={() => toggleScheduleEnabled(sched)}>
                              {sched.enabled ? "Disable" : "Enable"}
                            </button>
                            <button onClick={() => runScheduleNow(sched.id)}>Run now</button>
                            <button onClick={() => startEditSchedule(sched)}>Edit</button>
                            <button className="danger" onClick={() => deleteSchedule(sched.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!showScheduleForm && (
                    <button onClick={() => { resetScheduleForm(); setShowScheduleForm(true); }}>
                      + Add schedule
                    </button>
                  )}
                  {showScheduleForm && (
                    <div className="schedule-form">
                      <label className="field">
                        <span className="field-label">Prompt</span>
                        <span className="field-hint">
                          Template variables: {"{{now}}"}, {"{{date}}"}, {"{{time}}"}, {"{{day_of_week}}"}, {"{{iso_date}}"}
                        </span>
                        <textarea
                          placeholder="e.g. Summarize today's activity for {{date}}"
                          value={schedPrompt}
                          onChange={(e) => setSchedPrompt(e.target.value)}
                          rows={3}
                        />
                      </label>
                      <label className="field checkbox-field">
                        <input
                          type="checkbox"
                          checked={schedOneTime}
                          onChange={(e) => setSchedOneTime(e.target.checked)}
                        />
                        <span className="field-label">One-time (run once then disable)</span>
                      </label>
                      <label className="field checkbox-field">
                        <input
                          type="checkbox"
                          checked={schedUseCron}
                          onChange={(e) => setSchedUseCron(e.target.checked)}
                        />
                        <span className="field-label">Use cron expression (advanced)</span>
                      </label>
                      {schedUseCron ? (
                        <label className="field">
                          <span className="field-label">Cron expression</span>
                          <span className="field-hint">e.g. 0 9 * * MON-FRI (weekdays at 9am UTC)</span>
                          <input
                            placeholder="0 9 * * *"
                            value={schedCron}
                            onChange={(e) => setSchedCron(e.target.value)}
                          />
                        </label>
                      ) : (
                        <div className="interval-picker">
                          <span className="field-label">Every</span>
                          <input
                            type="number"
                            min="1"
                            value={schedIntervalValue}
                            onChange={(e) => setSchedIntervalValue(e.target.value)}
                          />
                          <select
                            value={schedIntervalUnit}
                            onChange={(e) => setSchedIntervalUnit(e.target.value)}
                          >
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                            <option value="weeks">weeks</option>
                          </select>
                        </div>
                      )}
                      <label className="field checkbox-field">
                        <input
                          type="checkbox"
                          checked={schedEnabled}
                          onChange={(e) => setSchedEnabled(e.target.checked)}
                        />
                        <span className="field-label">Enabled</span>
                      </label>
                      <div className="form-actions">
                        <button onClick={saveSchedule}>
                          {editingSchedule ? "Save" : "Create"}
                        </button>
                        <button type="button" onClick={resetScheduleForm}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {centerMode === "session-edit" && editingSession && (
            <div className="realm-edit-form">
              <h2>Edit session</h2>
              <label className="field">
                <span className="field-label">Title</span>
                <input
                  value={sessionFormTitle}
                  onChange={(e) => setSessionFormTitle(e.target.value)}
                  placeholder="Session title"
                  autoFocus
                />
              </label>
              <div className="form-actions">
                <button onClick={saveSession}>Save</button>
                <button type="button" onClick={() => setCenterMode("welcome")}>Cancel</button>
              </div>
              <button
                className="danger delete-realm-btn"
                onClick={() => {
                  deleteSession(editingSession.id);
                  setEditingSession(null);
                }}
              >
                Delete session
              </button>
            </div>
          )}

          {centerMode === "chat" && activeSession && (
            <div className="chat-area">
              <div className="messages">
                {messages.map((m, i) => {
                  const isLastAgent =
                    m.role === "agent" && i === messages.length - 1;
                  const useRenderer = activeAgent?.enable_ui && m.role === "agent";
                  const showSpinner =
                    isLastAgent && streaming && !m.content;
                  return (
                    <div key={i} className={`message ${m.role}`}>
                      <span className="role-tag">{m.role}</span>
                      <div className="content">
                        {showSpinner ? (
                          <span className="spinner" />
                        ) : useRenderer ? (
                          <Renderer
                            response={m.content}
                            library={openuiLibrary}
                            isStreaming={isLastAgent && streaming}
                          />
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEnd} />
              </div>
              <form
                className="input-bar"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={streaming}
                  autoFocus
                />
                <button type="submit" disabled={streaming || !input.trim()}>
                  Send
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
