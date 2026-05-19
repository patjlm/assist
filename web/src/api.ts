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
  session_ttl_days: number | null;
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
  session_ttl_days?: number | null;
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

export interface Realm {
  id: string;
  name: string;
  owner_email: string;
  personal: boolean;
  members: string[];
  created_at: string;
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
  realms: {
    list: () => request<Realm[]>("/realms"),
    create: (name: string) =>
      request<Realm>("/realms", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    get: (id: string) => request<Realm>(`/realms/${id}`),
    update: (id: string, body: { name?: string }) =>
      request<Realm>(`/realms/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<void>(`/realms/${id}`, { method: "DELETE" }),
  },
  agents: {
    list: (realmId: string) => request<Agent[]>(`/realms/${realmId}/agents`),
    get: (realmId: string, id: string) =>
      request<Agent>(`/realms/${realmId}/agents/${id}`),
    create: (realmId: string, body: AgentCreate) =>
      request<Agent>(`/realms/${realmId}/agents`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (realmId: string, id: string, body: Partial<AgentCreate>) =>
      request<Agent>(`/realms/${realmId}/agents/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (realmId: string, id: string) =>
      request<void>(`/realms/${realmId}/agents/${id}`, { method: "DELETE" }),
    sessionCount: (realmId: string, id: string) =>
      request<{ count: number }>(`/realms/${realmId}/agents/${id}/session-count`),
  },
  sessions: {
    list: (realmId: string, agentId?: string) =>
      request<SessionMeta[]>(
        `/realms/${realmId}/sessions${agentId ? `?agent_id=${agentId}` : ""}`
      ),
    create: (realmId: string, agentId: string) =>
      request<SessionMeta>(`/realms/${realmId}/sessions`, {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId }),
      }),
    get: (realmId: string, id: string) =>
      request<SessionDetail>(`/realms/${realmId}/sessions/${id}`),
    delete: (realmId: string, id: string) =>
      request<void>(`/realms/${realmId}/sessions/${id}`, { method: "DELETE" }),
  },
  chat: async function* (
    realmId: string,
    sessionId: string,
    message: string,
    uiPrompt?: string
  ) {
    const res = await fetch(
      `${BASE}/realms/${realmId}/sessions/${sessionId}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message, ui_prompt: uiPrompt }),
      }
    );
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
