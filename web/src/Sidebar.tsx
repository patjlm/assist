import { useMemo, useState } from "react";
import type { Agent, SessionMeta } from "./api";

interface SidebarProps {
  agents: Agent[];
  sessions: SessionMeta[];
  activeSession: string | null;
  centerMode: string;
  editingAgentId: string | null;
  onNewAgent: () => void;
  onEditAgent: (agent: Agent) => void;
  onNewSession: (agentId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onEditSession: (session: SessionMeta) => void;
  onDeleteSession: (sessionId: string) => void;
  isOpen: boolean;
}

export default function Sidebar({
  agents,
  sessions,
  activeSession,
  centerMode,
  editingAgentId,
  onNewAgent,
  onEditAgent,
  onNewSession,
  onOpenSession,
  onEditSession,
  onDeleteSession,
  isOpen,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const sessionsByAgent = useMemo(() => {
    const map = new Map<string, SessionMeta[]>();
    for (const s of sessions) {
      const list = map.get(s.agent_id) ?? [];
      list.push(s);
      map.set(s.agent_id, list);
    }
    return map;
  }, [sessions]);

  function toggleNode(agentId: string) {
    setCollapsed((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  }

  return (
    <aside className={`sidebar${isOpen ? " open" : ""}`}>
      <button className="new-btn" onClick={onNewAgent}>
        + New agent
      </button>
      {agents.map((a) => {
        const isCollapsed = collapsed[a.id] ?? false;
        const agentSessions = sessionsByAgent.get(a.id) ?? [];
        const isEditingThis = centerMode === "agent-form" && editingAgentId === a.id;
        return (
          <div key={a.id} className="agent-tree-node">
            <div className={`agent-tree-header${isEditingThis ? " active" : ""}`}>
              <span
                className={`chevron${isCollapsed ? "" : " open"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNode(a.id);
                }}
                role="button"
                aria-label={isCollapsed ? "Expand sessions" : "Collapse sessions"}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleNode(a.id);
                  }
                }}
              >
                &#9654;
              </span>
              <span className="agent-tree-name" onClick={() => onEditAgent(a)}>
                {a.name}
              </span>
              <span className="model-tag">{a.model}</span>
              <button
                className="new-session-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewSession(a.id);
                }}
                aria-label={`New session with ${a.name}`}
              >
                +
              </button>
            </div>
            {!isCollapsed && (
              <div className="agent-tree-sessions">
                {agentSessions.map((s) => (
                  <div
                    key={s.id}
                    className={`session-item${centerMode === "chat" && s.id === activeSession ? " active" : ""}`}
                    onClick={() => onOpenSession(s.id)}
                  >
                    <span className="session-title">{s.title || "..."}</span>
                    <button
                      className="edit-session"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSession(s);
                      }}
                      aria-label={`Edit session ${s.title || "untitled"}`}
                    >
                      &#9998;
                    </button>
                    <button
                      className="delete-session"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(s.id);
                      }}
                      aria-label={`Delete session ${s.title || "untitled"}`}
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
      {agents.length === 0 && <p className="empty">No agents yet.</p>}
    </aside>
  );
}
