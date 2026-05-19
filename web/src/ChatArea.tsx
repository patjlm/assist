import { useEffect, useRef, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui";
import type { Agent, Message, User } from "./api";

interface ChatAreaProps {
  messages: Message[];
  streaming: boolean;
  activeAgent: Agent | null;
  user: User;
  onSend: (text: string) => void;
}

export default function ChatArea({
  messages,
  streaming,
  activeAgent,
  user,
  onSend,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <div className="chat-area">
      <div className="messages" role="log" aria-live="polite">
        {messages.map((m, i) => {
          const isLastAgent = m.role === "agent" && i === messages.length - 1;
          const useRenderer = activeAgent?.enable_ui && m.role === "agent";
          const showSpinner = isLastAgent && streaming && !m.content;
          return (
            <div key={i} className={`message ${m.role}`}>
              <div className="message-header">
                {m.role === "user" ? (
                  <img className="message-avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="message-avatar agent-avatar" aria-hidden="true">&#x1F916;</span>
                )}
                <span className="message-name">
                  {m.role === "user" ? user.name : (activeAgent?.name ?? "Agent")}
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
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={streaming}
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
