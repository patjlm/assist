import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui";
import "@openuidev/react-ui/components.css";
import "@openuidev/react-ui/defaults.css";
import {
  api,
  type Agent,
  type SessionMeta,
  type Message,
  type User,
  type Realm,
  type Theme,
} from "./api";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import ChatArea from "./ChatArea";
import AgentForm from "./AgentForm";
import MemberPicker from "./MemberPicker";

type CenterMode =
  | "welcome"
  | "chat"
  | "agent-form"
  | "session-edit"
  | "realm-edit"
  | "realm-create";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [centerMode, setCenterMode] = useState<CenterMode>("welcome");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [realms, setRealms] = useState<Realm[]>([]);
  const [activeRealm, setActiveRealm] = useState<Realm | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [realmEditName, setRealmEditName] = useState("");
  const [realmEditMembers, setRealmEditMembers] = useState<string[]>([]);
  const [realmCreateName, setRealmCreateName] = useState("");
  const [realmCreateMembers, setRealmCreateMembers] = useState<string[]>([]);
  const [editingSession, setEditingSession] = useState<SessionMeta | null>(null);
  const [sessionFormTitle, setSessionFormTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usersByEmail, setUsersByEmail] = useState<Map<string, User>>(new Map());

  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;

  const uiPrompt = useMemo(
    () => openuiLibrary.prompt(openuiPromptOptions),
    [],
  );

  const loadAgents = useCallback(async () => {
    if (!activeRealm) return;
    setAgents(await api.agents.list(activeRealm.id));
  }, [activeRealm]);

  const loadSessions = useCallback(async () => {
    if (!activeRealm) return;
    setSessions(await api.sessions.list(activeRealm.id));
  }, [activeRealm]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    api.auth.me().then(async (u) => {
      setUser(u);
      setAuthChecked(true);
      if (u) {
        const [realmList, prefs, allUsers] = await Promise.all([
          api.realms.list(),
          api.preferences.get(),
          api.users.list(),
        ]);
        setRealms(realmList);
        setTheme(prefs.theme);
        setUsersByEmail(new Map(allUsers.map((u) => [u.email, u])));
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
    if (!activeRealm) return;
    const realmId = activeRealm.id;
    const unsub = api.realmEvents(realmId, (event) => {
      if (event.type === "agents_changed") {
        api.agents.list(realmId).then(setAgents);
      }
      if (event.type === "sessions_changed") {
        api.sessions.list(realmId).then(setSessions);
      }
      if (
        event.type === "session_message" &&
        event.session_id &&
        event.session_id === activeSessionRef.current &&
        !streamingRef.current
      ) {
        api.sessions.get(realmId, event.session_id).then((detail) => {
          setMessages(detail.messages);
        });
      }
    });
    return unsub;
  }, [activeRealm]);

  if (!authChecked) {
    return (
      <div className="app">
        <div className="login-page">
          <span className="spinner" role="status" aria-label="Loading" />
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
    setSidebarOpen(false);
  }

  async function newSession(agentId: string) {
    const meta = await api.sessions.create(activeRealm!.id, agentId);
    const agent = agents.find((a) => a.id === agentId) ?? null;
    setActiveAgent(agent);
    setActiveSession(meta.id);
    setMessages([]);
    setCenterMode("chat");
    setSidebarOpen(false);
    loadSessions();
  }

  async function sendMessage(text: string) {
    if (!activeSession || streaming) return;
    const currentMuted = sessions.find((s) => s.id === activeSession)?.muted ?? false;
    const userMsg: Message = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    if (!currentMuted) {
      const agentMsg: Message = {
        role: "agent",
        content: "",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, agentMsg]);
    }

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
      if (!currentMuted) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `Error: ${e}`,
          };
          return updated;
        });
      }
    }
    setStreaming(false);
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

  function openRealmEdit() {
    if (!activeRealm) return;
    setRealmEditName(activeRealm.name);
    setRealmEditMembers([...activeRealm.members]);
    setCenterMode("realm-edit");
  }

  async function saveRealm() {
    if (!activeRealm || !realmEditName.trim()) return;
    try {
      await api.realms.update(activeRealm.id, {
        name: realmEditName.trim(),
        members: realmEditMembers,
      });
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
      created = await api.realms.create(realmCreateName.trim(), realmCreateMembers);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    const realmList = await api.realms.list();
    setRealms(realmList);
    const newRealm = realmList.find((r) => r.id === created.id);
    if (newRealm) setActiveRealm(newRealm);
    setRealmCreateName("");
    setRealmCreateMembers([]);
    setCenterMode("welcome");
  }

  return (
    <div className="app">
      <TopBar
        user={user}
        realms={realms}
        activeRealm={activeRealm}
        theme={theme}
        onRealmChange={(r) => {
          setActiveRealm(r);
          setCenterMode("welcome");
        }}
        onNewRealm={() => {
          setRealmCreateName("");
          setRealmCreateMembers([]);
          setCenterMode("realm-create");
        }}
        onEditRealm={openRealmEdit}
        onToggleTheme={toggleTheme}
        onLogout={async () => {
          await api.auth.logout();
          setUser(null);
        }}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="workspace">
        <div className={`sidebar-overlay${sidebarOpen ? " visible" : ""}`} onClick={() => setSidebarOpen(false)} />
        <Sidebar
          agents={agents}
          sessions={sessions}
          activeSession={activeSession}
          centerMode={centerMode}
          editingAgentId={editingAgent?.id ?? null}
          isOpen={sidebarOpen}
          onNewAgent={() => {
            setEditingAgent(null);
            setCenterMode("agent-form");
          }}
          onEditAgent={(a) => {
            setEditingAgent(a);
            setCenterMode("agent-form");
          }}
          onNewSession={newSession}
          onOpenSession={openSession}
          onEditSession={editSession}
          onDeleteSession={deleteSession}
        />

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
              {!activeRealm.personal && (
                <MemberPicker
                  members={realmEditMembers}
                  ownerEmail={activeRealm.owner_email}
                  onChange={setRealmEditMembers}
                />
              )}
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
              <MemberPicker
                members={realmCreateMembers}
                ownerEmail={user?.email}
                onChange={setRealmCreateMembers}
              />
              <div className="form-actions">
                <button onClick={createRealm}>Create</button>
                <button type="button" onClick={() => setCenterMode("welcome")}>Cancel</button>
              </div>
            </div>
          )}

          {centerMode === "agent-form" && activeRealm && (
            <AgentForm
              key={editingAgent?.id ?? "__new__"}
              realmId={activeRealm.id}
              agent={editingAgent}
              onSaved={() => {
                setEditingAgent(null);
                setCenterMode("welcome");
                loadAgents();
              }}
              onCancel={() => {
                setEditingAgent(null);
                setCenterMode("welcome");
              }}
              onDeleted={() => {
                setEditingAgent(null);
                setCenterMode("welcome");
                loadAgents();
                loadSessions();
              }}
              onOpenSession={openSession}
            />
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
            <ChatArea
              messages={messages}
              streaming={streaming}
              activeAgent={activeAgent}
              user={user}
              usersByEmail={usersByEmail}
              muted={sessions.find((s) => s.id === activeSession)?.muted ?? false}
              onSend={sendMessage}
              onToggleMute={async () => {
                const current = sessions.find((s) => s.id === activeSession);
                if (!current) return;
                await api.sessions.update(activeRealm!.id, activeSession, {
                  muted: !current.muted,
                });
                loadSessions();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
