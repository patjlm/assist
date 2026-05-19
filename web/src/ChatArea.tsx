import { useEffect, useRef, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui";
import type { Agent, Message } from "./api";

interface ChatAreaProps {
  messages: Message[];
  streaming: boolean;
  activeAgent: Agent | null;
  onSend: (text: string) => void;
}

export default function ChatArea({
  messages,
  streaming,
  activeAgent,
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
              <span className="role-tag">{m.role}</span>
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
