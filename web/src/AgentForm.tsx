import { useEffect, useState } from "react";
import type { Agent, Schedule } from "./api";
import { api } from "./api";

function optStr(v: number | null): string {
  return v != null ? String(v) : "";
}

interface AgentFormProps {
  realmId: string;
  agent: Agent | null;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
  onOpenSession: (sessionId: string) => void;
}

export default function AgentForm({
  realmId,
  agent,
  onSaved,
  onCancel,
  onDeleted,
  onOpenSession,
}: AgentFormProps) {
  const [name, setName] = useState(agent?.name ?? "");
  const [desc, setDesc] = useState(agent?.description ?? "");
  const [prompt, setPrompt] = useState(agent?.system_prompt ?? "");
  const [globalInst, setGlobalInst] = useState(agent?.global_instruction ?? "");
  const [model, setModel] = useState(agent?.model ?? "gemini-2.5-flash");
  const [temp, setTemp] = useState(optStr(agent?.temperature ?? null));
  const [topP, setTopP] = useState(optStr(agent?.top_p ?? null));
  const [topK, setTopK] = useState(optStr(agent?.top_k ?? null));
  const [maxTokens, setMaxTokens] = useState(optStr(agent?.max_output_tokens ?? null));
  const [stopSeq, setStopSeq] = useState(agent?.stop_sequences?.join(", ") ?? "");
  const [presence, setPresence] = useState(optStr(agent?.presence_penalty ?? null));
  const [frequency, setFrequency] = useState(optStr(agent?.frequency_penalty ?? null));
  const [include, setInclude] = useState<"default" | "none">(agent?.include_contents ?? "default");
  const [noParent, setNoParent] = useState(agent?.disallow_transfer_to_parent ?? false);
  const [noPeers, setNoPeers] = useState(agent?.disallow_transfer_to_peers ?? false);
  const [outputKey, setOutputKey] = useState(agent?.output_key ?? "");
  const [enableUi, setEnableUi] = useState(agent?.enable_ui ?? false);
  const [sessionTtl, setSessionTtl] = useState(optStr(agent?.session_ttl_days ?? null));
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  useEffect(() => {
    if (agent) {
      api.schedules.list(realmId, agent.id).then(setSchedules);
    }
  }, [agent, realmId]);

  function optNum(v: string): number | undefined {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }

  function optInt(v: string): number | undefined {
    const n = parseInt(v, 10);
    return isNaN(n) ? undefined : n;
  }

  function collectFormData() {
    const stopSeqs = stopSeq
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      name,
      description: desc,
      system_prompt: prompt,
      global_instruction: globalInst || undefined,
      model,
      temperature: optNum(temp),
      top_p: optNum(topP),
      top_k: optNum(topK),
      max_output_tokens: optInt(maxTokens),
      stop_sequences: stopSeqs.length ? stopSeqs : undefined,
      presence_penalty: optNum(presence),
      frequency_penalty: optNum(frequency),
      include_contents: include,
      disallow_transfer_to_parent: noParent,
      disallow_transfer_to_peers: noPeers,
      output_key: outputKey || undefined,
      enable_ui: enableUi,
      session_ttl_days: optInt(sessionTtl),
    };
  }

  async function save() {
    if (!name.trim() || !prompt.trim()) return;
    try {
      if (agent) {
        await api.agents.update(realmId, agent.id, collectFormData());
      } else {
        await api.agents.create(realmId, collectFormData());
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!agent) return;
    const { count } = await api.agents.sessionCount(realmId, agent.id);
    const sessionInfo =
      count > 0
        ? `\n\n${count} session${count === 1 ? "" : "s"} will also be deleted.`
        : "";
    if (!confirm(`Delete agent "${agent.name}"?${sessionInfo}`)) return;
    await api.agents.delete(realmId, agent.id);
    onDeleted();
  }

  async function loadSchedules(agentId: string) {
    setSchedules(await api.schedules.list(realmId, agentId));
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
    if (!agent || !schedPrompt.trim()) return;
    const body = {
      prompt: schedPrompt,
      enabled: schedEnabled,
      one_time: schedOneTime,
      interval_seconds: schedUseCron ? undefined : intervalToSeconds(schedIntervalValue, schedIntervalUnit),
      cron_expression: schedUseCron ? schedCron : undefined,
    };
    try {
      if (editingSchedule) {
        await api.schedules.update(realmId, editingSchedule.id, body);
      } else {
        await api.schedules.create(realmId, agent.id, body);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      return;
    }
    resetScheduleForm();
    loadSchedules(agent.id);
  }

  async function deleteSchedule(id: string) {
    if (!agent) return;
    await api.schedules.delete(realmId, id);
    loadSchedules(agent.id);
  }

  async function toggleScheduleEnabled(sched: Schedule) {
    if (!agent) return;
    await api.schedules.update(realmId, sched.id, { enabled: !sched.enabled });
    loadSchedules(agent.id);
  }

  async function runScheduleNow(schedId: string) {
    if (!agent) return;
    const { session_id } = await api.schedules.run(realmId, schedId);
    loadSchedules(agent.id);
    if (session_id) onOpenSession(session_id);
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

  return (
    <div className="agent-form">
      <h2>{agent ? `Edit: ${agent.name}` : "New agent"}</h2>
      <label className="field">
        <span className="field-label">Name</span>
        <input placeholder="e.g. Code Reviewer" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Description</span>
        <span className="field-hint">
          Short summary shown in the agent list. Also used by parent agents to decide when to delegate to this one.
        </span>
        <input placeholder="e.g. Reviews code for bugs and style issues" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">System prompt</span>
        <span className="field-hint">
          The core instruction that defines the agent's behavior. Supports {"{"} session_state_key {"}"} template variables.
        </span>
        <textarea placeholder="You are a helpful assistant that..." value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
      </label>

      <label className="field">
        <span className="field-label">Model</span>
        <input placeholder="gemini-2.5-flash" value={model} onChange={(e) => setModel(e.target.value)} />
      </label>

      <label className="field checkbox-field">
        <input type="checkbox" checked={enableUi} onChange={(e) => setEnableUi(e.target.checked)} />
        <div>
          <span className="field-label">Enable UI components</span>
          <span className="field-hint">
            Allow the agent to render rich UI: charts, tables, forms, cards, tabs, and more via OpenUI.
          </span>
        </div>
      </label>

      <button type="button" className="toggle-advanced" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? "- Hide" : "+ Show"} advanced settings
      </button>

      {showAdvanced && (
        <div className="advanced-section">
          <label className="field">
            <span className="field-label">Session TTL (days)</span>
            <span className="field-hint">
              Sessions are deleted after this many days of inactivity. Default is 7. Set to 0 for no expiration.
            </span>
            <input type="number" step="1" min="0" placeholder="7 (default)" value={sessionTtl} onChange={(e) => setSessionTtl(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">Global instruction</span>
            <span className="field-hint">
              Prepended to this agent and all its sub-agents. Use for shared rules like output format or safety guidelines.
            </span>
            <textarea placeholder="Always respond in markdown..." value={globalInst} onChange={(e) => setGlobalInst(e.target.value)} rows={2} />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Temperature</span>
              <span className="field-hint">0 = deterministic, 2 = very creative</span>
              <input type="number" step="0.1" min="0" max="2" placeholder="default" value={temp} onChange={(e) => setTemp(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Top P</span>
              <span className="field-hint">Nucleus sampling cutoff (0-1)</span>
              <input type="number" step="0.05" min="0" max="1" placeholder="default" value={topP} onChange={(e) => setTopP(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Top K</span>
              <span className="field-hint">Number of top tokens to consider</span>
              <input type="number" step="1" min="1" placeholder="default" value={topK} onChange={(e) => setTopK(e.target.value)} />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Max output tokens</span>
              <span className="field-hint">Limit response length</span>
              <input type="number" step="256" min="1" placeholder="default" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Presence penalty</span>
              <span className="field-hint">Penalize repeated topics (-2 to 2)</span>
              <input type="number" step="0.1" min="-2" max="2" placeholder="default" value={presence} onChange={(e) => setPresence(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Frequency penalty</span>
              <span className="field-hint">Penalize repeated words (-2 to 2)</span>
              <input type="number" step="0.1" min="-2" max="2" placeholder="default" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Stop sequences</span>
            <span className="field-hint">Comma-separated strings that stop generation when produced</span>
            <input placeholder='e.g. END, ###' value={stopSeq} onChange={(e) => setStopSeq(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">Output key</span>
            <span className="field-hint">
              If set, the agent's response is saved to session state under this key, making it available to other agents via{" "}
              {"{"} key_name {"}"}
            </span>
            <input placeholder="e.g. review_result" value={outputKey} onChange={(e) => setOutputKey(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">Include contents</span>
            <span className="field-hint">
              Whether to include conversation history in the LLM context. Set to "none" for stateless agents that only use the current input.
            </span>
            <select value={include} onChange={(e) => setInclude(e.target.value as "default" | "none")}>
              <option value="default">default (include history)</option>
              <option value="none">none (stateless)</option>
            </select>
          </label>

          <div className="field-row">
            <label className="field checkbox-field">
              <input type="checkbox" checked={noParent} onChange={(e) => setNoParent(e.target.checked)} />
              <div>
                <span className="field-label">Disallow transfer to parent</span>
                <span className="field-hint">Prevent this agent from escalating back to its parent</span>
              </div>
            </label>
            <label className="field checkbox-field">
              <input type="checkbox" checked={noPeers} onChange={(e) => setNoPeers(e.target.checked)} />
              <div>
                <span className="field-label">Disallow transfer to peers</span>
                <span className="field-hint">Prevent this agent from delegating to sibling agents</span>
              </div>
            </label>
          </div>
        </div>
      )}

      <div className="form-actions">
        <button onClick={save}>{agent ? "Save" : "Create"}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      {agent && (
        <button className="danger delete-agent-btn" onClick={handleDelete}>
          Delete agent
        </button>
      )}

      {agent && (
        <div className="schedule-section">
          <h3>Schedules</h3>
          {schedules.length > 0 && (
            <div className="schedule-list">
              {schedules.map((sched) => (
                <div key={sched.id} className="schedule-item">
                  <span className={`schedule-status${sched.enabled ? " active" : ""}`} aria-label={sched.enabled ? "Active" : "Disabled"} />
                  <div className="schedule-info">
                    <div className="schedule-prompt">{sched.prompt}</div>
                    <div className="schedule-meta">
                      Next: {formatScheduleTime(sched.next_run_at)}
                      {sched.last_run_at && (
                        <> &middot; Last: {formatScheduleTime(sched.last_run_at)}</>
                      )}
                      {sched.last_session_id && (
                        <> &middot; <a onClick={() => onOpenSession(sched.last_session_id!)}>view session</a></>
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
                <input type="checkbox" checked={schedOneTime} onChange={(e) => setSchedOneTime(e.target.checked)} />
                <span className="field-label">One-time (run once then disable)</span>
              </label>
              <label className="field checkbox-field">
                <input type="checkbox" checked={schedUseCron} onChange={(e) => setSchedUseCron(e.target.checked)} />
                <span className="field-label">Use cron expression (advanced)</span>
              </label>
              {schedUseCron ? (
                <label className="field">
                  <span className="field-label">Cron expression</span>
                  <span className="field-hint">e.g. 0 9 * * MON-FRI (weekdays at 9am UTC)</span>
                  <input placeholder="0 9 * * *" value={schedCron} onChange={(e) => setSchedCron(e.target.value)} />
                </label>
              ) : (
                <div className="interval-picker">
                  <span className="field-label">Every</span>
                  <input type="number" min="1" value={schedIntervalValue} onChange={(e) => setSchedIntervalValue(e.target.value)} />
                  <select value={schedIntervalUnit} onChange={(e) => setSchedIntervalUnit(e.target.value)}>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                  </select>
                </div>
              )}
              <label className="field checkbox-field">
                <input type="checkbox" checked={schedEnabled} onChange={(e) => setSchedEnabled(e.target.checked)} />
                <span className="field-label">Enabled</span>
              </label>
              <div className="form-actions">
                <button onClick={saveSchedule}>{editingSchedule ? "Save" : "Create"}</button>
                <button type="button" onClick={resetScheduleForm}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
