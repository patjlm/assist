import { useEffect, useRef, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui";
import type { Agent, Message, User } from "./api";

interface ChatAreaProps {
  messages: Message[];
  streaming: boolean;
  activeAgent: Agent | null;
  user: User;
  usersByEmail: Map<string, User>;
  muted: boolean;
  onSend: (text: string) => void;
  onToggleMute: () => void;
}

export default function ChatArea({
  messages,
  streaming,
  activeAgent,
  user,
  usersByEmail,
  muted,
  onSend,
  onToggleMute,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    onSend(input.trim());
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="chat-area">
      <div className="messages" role="log" aria-live="polite">
        {messages.map((m, i) => {
          const isLastAgent = m.role === "agent" && i === messages.length - 1;
          const useRenderer = activeAgent?.enable_ui && m.role === "agent";
          const showSpinner = isLastAgent && streaming && !m.content;
          const author = m.role === "user" && m.actor_id
            ? usersByEmail.get(m.actor_id) ?? user
            : user;
          return (
            <div key={i} className={`message ${m.role}`}>
              <div className="message-header">
                {m.role === "user" ? (
                  author.picture
                    ? <img className="message-avatar" src={author.picture} alt="" referrerPolicy="no-referrer" />
                    : <span className="message-avatar agent-avatar" aria-hidden="true">&#x1F464;</span>
                ) : (
                  <span className="message-avatar agent-avatar" aria-hidden="true">&#x1F916;</span>
                )}
                <span className="message-name">
                  {m.role === "user" ? (author.name || author.email) : (activeAgent?.name ?? "Agent")}
                </span>
                {m.timestamp && (
                  <time className="message-time" dateTime={m.timestamp}>
                    {new Date(m.timestamp).toLocaleString(undefined, {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </time>
                )}
              </div>
              <div className="content">
                {showSpinner ? (
                  <span className="spinner" role="status" aria-label="Loading response" />
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
      <form className="input-bar" onSubmit={handleSubmit}>
        <button
          type="button"
          className={`mute-btn${muted ? " muted" : ""}`}
          onClick={onToggleMute}
          aria-label={muted ? "Unmute agent" : "Mute agent"}
          title={muted ? "Agent is muted — click to unmute" : "Mute agent"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={muted ? "Chat with other users..." : "Type a message..."}
          aria-label="Message input"
          autoFocus
        />
        <button type="submit" disabled={streaming || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
