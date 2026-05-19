export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  global_instruction: string;
  model: string;
  temperature: number | null;
  top_p: number | null;
  top_k: number | null;
  max_output_tokens: number | null;
  stop_sequences: string[] | null;
  presence_penalty: number | null;
  frequency_penalty: number | null;
  include_contents: "default" | "none";
  disallow_transfer_to_parent: boolean;
  disallow_transfer_to_peers: boolean;
  output_key: string | null;
  enable_ui: boolean;
  created_at: string;
}

export interface AgentCreate {
  name: string;
  description?: string;
  system_prompt: string;
  global_instruction?: string;
  model?: string;
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  max_output_tokens?: number | null;
  stop_sequences?: string[] | null;
  presence_penalty?: number | null;
  frequency_penalty?: number | null;
  include_contents?: "default" | "none";
  disallow_transfer_to_parent?: boolean;
  disallow_transfer_to_peers?: boolean;
  output_key?: string | null;
  enable_ui?: boolean;
}

export interface SessionMeta {
  id: string;
  agent_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

export interface SessionDetail extends SessionMeta {
  messages: Message[];
}

export interface User {
  email: string;
  name: string;
  picture: string;
}

const BASE = "/api";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    me: async (): Promise<User | null> => {
      const res = await fetch(`${BASE}/auth/me`, { credentials: "same-origin" });
      if (res.status === 401) return null;
      return res.json();
    },
    logout: () => request<void>("/auth/logout", { method: "POST" }),
  },
  agents: {
    list: () => request<Agent[]>("/agents"),
    get: (id: string) => request<Agent>(`/agents/${id}`),
    create: (body: AgentCreate) =>
      request<Agent>("/agents", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<AgentCreate>) =>
      request<Agent>(`/agents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<void>(`/agents/${id}`, { method: "DELETE" }),
  },
  sessions: {
    list: (agentId?: string) =>
      request<SessionMeta[]>(
        `/sessions${agentId ? `?agent_id=${agentId}` : ""}`
      ),
    create: (agentId: string) =>
      request<SessionMeta>("/sessions", {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId }),
      }),
    get: (id: string) => request<SessionDetail>(`/sessions/${id}`),
    delete: (id: string) =>
      request<void>(`/sessions/${id}`, { method: "DELETE" }),
  },
  chat: async function* (
    sessionId: string,
    message: string,
    uiPrompt?: string
  ) {
    const res = await fetch(`${BASE}/sessions/${sessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ message, ui_prompt: uiPrompt }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") return;
        const parsed = JSON.parse(payload);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.chunk) yield parsed.chunk as string;
      }
    }
  },
};
