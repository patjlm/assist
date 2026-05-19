import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import {
  openuiLibrary,
  openuiPromptOptions,
} from "@openuidev/react-ui";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import { api, type Agent, type SessionMeta, type Message, type User, type Realm } from "./api";

type View = "agents" | "chat";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [realms, setRealms] = useState<Realm[]>([]);
  const [activeRealm, setActiveRealm] = useState<Realm | null>(null);
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

  const messagesEnd = useRef<HTMLDivElement>(null);

  const uiPrompt = useMemo(
    () => openuiLibrary.prompt(openuiPromptOptions),
    []
  );

  const loadAgents = useCallback(async () => {
    if (!activeRealm) return;
    setAgents(await api.agents.list(activeRealm.id));
  }, [activeRealm]);

  const loadSessions = useCallback(async (agentId?: string) => {
    if (!activeRealm) return;
    setSessions(await api.sessions.list(activeRealm.id, agentId));
  }, [activeRealm]);

  useEffect(() => {
    api.auth.me().then(async (u) => {
      setUser(u);
      setAuthChecked(true);
      if (u) {
        const realmList = await api.realms.list();
        setRealms(realmList);
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

  async function openSession(sessionId: string) {
    const detail = await api.sessions.get(activeRealm!.id, sessionId);
    const agent = agents.find((a) => a.id === detail.agent_id) ?? null;
    setActiveAgent(agent);
    setActiveSession(sessionId);
    setMessages(detail.messages);
    setView("chat");
  }

  async function newSession(agentId: string) {
    const meta = await api.sessions.create(activeRealm!.id, agentId);
    const agent = agents.find((a) => a.id === agentId) ?? null;
    setActiveAgent(agent);
    setActiveSession(meta.id);
    setMessages([]);
    setView("chat");
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
    setShowForm(false);
    setShowAdvanced(false);
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
    setShowForm(true);
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
    if (editingAgent) {
      await api.agents.update(activeRealm!.id, editingAgent.id, collectFormData());
    } else {
      await api.agents.create(activeRealm!.id, collectFormData());
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
    loadAgents();
    loadSessions();
  }

  async function deleteSession(id: string) {
    await api.sessions.delete(activeRealm!.id, id);
    if (activeSession === id) {
      setActiveSession(null);
      setMessages([]);
      setView("agents");
    }
    loadSessions();
  }

  // ── Chat view ──

  if (view === "chat" && activeSession) {
    return (
      <div className="app">
        <div className="sidebar">
          <button className="back-btn" onClick={() => setView("agents")}>
            &larr; Back
          </button>
          <h3>{activeAgent?.name ?? "Agent"}</h3>
          <p className="desc">{activeAgent?.description}</p>
          <hr />
          <h4>Sessions</h4>
          {sessions
            .filter((s) => s.agent_id === activeAgent?.id)
            .map((s) => (
              <div
                key={s.id}
                className={`session-item ${s.id === activeSession ? "active" : ""}`}
                onClick={() => openSession(s.id)}
              >
                <span className="session-title">
                  {s.title || "New session"}
                </span>
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
          <button
            className="new-btn"
            onClick={() => newSession(activeAgent!.id)}
          >
            + New session
          </button>
        </div>
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
      </div>
    );
  }

  // ── Agents list view ──

  return (
    <div className="app">
      <div className="main-panel">
        <div className="header">
          <h1>assist</h1>
          {realms.length > 1 && (
            <select
              className="realm-select"
              value={activeRealm?.id ?? ""}
              onChange={(e) => {
                const r = realms.find((r) => r.id === e.target.value);
                if (r) setActiveRealm(r);
              }}
            >
              {realms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.personal ? " (personal)" : ""}
                </option>
              ))}
            </select>
          )}
          <div className="header-right">
            <button
              onClick={() => {
                if (showForm) {
                  resetForm();
                } else {
                  setShowForm(true);
                }
              }}
            >
              {showForm ? "Cancel" : "+ New Agent"}
            </button>
            <div className="user-info">
              {user.picture && <img src={user.picture} className="avatar" alt="" referrerPolicy="no-referrer" />}
              <span className="user-name">{user.name || user.email}</span>
              <button className="logout-btn" onClick={async () => { await api.auth.logout(); setUser(null); }}>
                Logout
              </button>
            </div>
          </div>
        </div>

        {showForm && (
          <div className="agent-form">
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
          </div>
        )}

        <div className="agent-list">
          {agents.map((a) => (
            <div key={a.id} className="agent-card">
              <div className="agent-info">
                <h3>{a.name}</h3>
                <p>{a.description}</p>
                <span className="model-tag">{a.model}</span>
              </div>
              <div className="agent-actions">
                <button onClick={() => editAgent(a)}>Edit</button>
                <button onClick={() => newSession(a.id)}>Chat</button>
                <button className="danger" onClick={() => deleteAgent(a.id)}>
                  &times;
                </button>
              </div>
            </div>
          ))}
          {agents.length === 0 && !showForm && (
            <p className="empty">No agents yet. Create one to get started.</p>
          )}
        </div>

        <hr />
        <h2>Recent sessions</h2>
        <div className="session-list">
          {sessions.map((s) => {
            const agent = agents.find((a) => a.id === s.agent_id);
            return (
              <div
                key={s.id}
                className="session-item"
                onClick={() => openSession(s.id)}
              >
                <span className="session-title">
                  {s.title || "New session"}
                </span>
                <span className="session-agent">
                  {agent?.name ?? s.agent_id}
                </span>
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
            );
          })}
          {sessions.length === 0 && (
            <p className="empty">No sessions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
