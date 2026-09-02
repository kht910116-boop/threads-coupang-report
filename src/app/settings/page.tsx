"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface ProviderStatus {
  id: string;
  label: string;
  envKeys: string[];
  configured: boolean;
  canListVoices?: boolean;
}

interface EngineStatus {
  id: string;
  label: string;
  target: string;
  kind: "cli" | "web" | "api";
  /** 웹은 확인에 브라우저가 필요해 기본은 null(미확인)이다. */
  ready: boolean | null;
  verified: boolean;
  notes: string;
}

const KIND_LABEL: Record<EngineStatus["kind"], string> = {
  cli: "cli",
  web: "웹 자동화",
  api: "api",
};

interface Status {
  engines: EngineStatus[];
  engineForced: string | null;
  tts: ProviderStatus[];
  image: ProviderStatus[];
  video: ProviderStatus[];
  capcutDraftDir: string | null;
}

interface Voice {
  id: string;
  name: string;
  detail: string;
}

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesOf, setVoicesOf] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api<Status>("/api/providers")
      .then(setStatus)
      .catch((err) => setError(String(err)));
  }, []);

  async function loadVoices(providerId: string) {
    setError("");
    setVoicesOf(providerId);
    setVoices([]);
    try {
      const result = await api<{ voices: Voice[]; message?: string }>(
        `/api/providers?voices=${providerId}`,
      );
      setVoices(result.voices);
      if (result.message) setError(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!status) {
    return error ? <div className="notice error">{error}</div> : <p className="dim">불러오는 중…</p>;
  }

  const section = (title: string, providers: ProviderStatus[], withVoices = false) => (
    <>
      <h2>{title}</h2>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td>
                  <strong>{provider.label}</strong>
                  <br />
                  <small className="mono">
                    {provider.envKeys.join(", ") || "키 필요 없음"}
                  </small>
                </td>
                <td style={{ width: 1, whiteSpace: "nowrap" }}>
                  <span className={provider.configured ? "pill ok" : "pill off"}>
                    {provider.configured ? "연결됨" : "키 없음"}
                  </span>
                </td>
                <td style={{ width: 1 }}>
                  {withVoices && provider.canListVoices && provider.configured && (
                    <button className="sm" onClick={() => void loadVoices(provider.id)}>
                      목소리 목록
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <>
      <h2>기획 엔진 (구독 CLI)</h2>
      <div className="card">
        <p className="dim" style={{ marginTop: 0 }}>
          구독 요금제는 API 키를 주지 않지만 CLI는 구독 로그인으로 돕니다. 아래 목록에서
          설치된 것을 위에서부터 찾아 씁니다. 새 CLI를 붙이는 건 플래그 설정을 추가하는
          일이고, 코드는 건드리지 않습니다.
        </p>
        <table>
          <tbody>
            {status.engines.map((engine, index) => {
              const active = status.engineForced
                ? status.engineForced === engine.id
                : engine.ready === true &&
                  status.engines.findIndex((e) => e.ready === true) === index;
              return (
                <tr key={`${engine.kind}-${engine.id}`}>
                  <td>
                    <strong>{engine.label}</strong>
                    <span className="pill" style={{ marginLeft: 6 }}>
                      {KIND_LABEL[engine.kind]}
                    </span>
                    {active && (
                      <span className="pill ok" style={{ marginLeft: 6 }}>사용 중</span>
                    )}
                    {engine.kind !== "api" && !engine.verified && (
                      <span className="pill" style={{ marginLeft: 6 }}>미검증</span>
                    )}
                    <br />
                    <small className="mono">{engine.target}</small>
                    {engine.notes && (
                      <>
                        <br />
                        <small>{engine.notes}</small>
                      </>
                    )}
                  </td>
                  <td style={{ width: 1, whiteSpace: "nowrap" }}>
                    {engine.ready === null ? (
                      <span className="pill off">미확인</span>
                    ) : (
                      <span className={engine.ready ? "pill ok" : "pill off"}>
                        {engine.ready ? "준비됨" : "안 됨"}
                      </span>
                    )}
                  </td>
                  <td style={{ width: 1 }}>
                    {engine.kind === "web" && <WebProviderActions id={engine.id} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <small>
          <code>PLANNER_AGENT</code>에 id를 넣으면 고정됩니다 (예: <code>claude</code>,{" "}
          <code>chatgpt</code>, 종량제는 <code>api</code>)
          {status.engineForced && ` — 지금: ${status.engineForced}`}.
          {" 웹 자동화는 확인에 브라우저를 띄워야 해서 상태를 미리 조회하지 않습니다."}
        </small>
      </div>

      <AgentEditor />

      {section("음성 (TTS)", status.tts, true)}

      {voicesOf && (
        <div className="card">
          <div className="spread">
            <h3 style={{ margin: 0 }}>{voicesOf} 목소리</h3>
            <button className="sm" onClick={() => setVoicesOf("")}>닫기</button>
          </div>
          {voices.length === 0 ? (
            <p className="dim">없습니다.</p>
          ) : (
            <table>
              <thead>
                <tr><th>이름</th><th>voice id</th><th>정보</th></tr>
              </thead>
              <tbody>
                {voices.map((voice) => (
                  <tr key={voice.id}>
                    <td>{voice.name}</td>
                    <td><code>{voice.id}</code></td>
                    <td className="dim">{voice.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {section("이미지", status.image)}
      {section("영상", status.video)}

      <h2>캡컷</h2>
      <div className="card">
        {status.capcutDraftDir ? (
          <>
            내보내면 여기까지 자동으로 복사합니다:
            <br />
            <code>{status.capcutDraftDir}</code>
          </>
        ) : (
          <>
            <span className="pill off">설정 안 됨</span>
            <p className="dim" style={{ marginBottom: 0 }}>
              <code>CAPCUT_DRAFT_DIR</code>을 정하면 내보낼 때 캡컷 프로젝트 폴더까지
              바로 넣어줍니다. 없어도 내보낸 폴더를 직접 복사하면 됩니다.
            </p>
          </>
        )}
      </div>

      {error && <div className="notice error">{error}</div>}
    </>
  );
}

/**
 * 웹 프로바이더 조작 버튼.
 *
 * 로그인은 이때만 창이 뜬다. 나머지(확인·시험)는 전부 백그라운드다.
 */
function WebProviderActions({ id }: { id: string }) {
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState("");

  async function act(action: string, label: string) {
    setBusy(label);
    setResult("");
    try {
      const data = await api<Record<string, unknown>>(`/api/web-providers/${id}`, {
        json: { action },
      });
      if (action === "login") {
        setResult(data.loggedIn ? "로그인됨" : "로그인 확인 실패");
      } else if (action === "check") {
        setResult(data.loggedIn ? "세션 살아 있음" : "세션 없음");
      } else if (action === "cookies") {
        setResult(`쿠키 ${String(data.count)}개`);
      } else {
        setResult(String(data.answer ?? "").slice(0, 80) || "빈 응답");
      }
    } catch (err) {
      setResult(err instanceof Error ? err.message.slice(0, 160) : String(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button className="sm" disabled={Boolean(busy)} onClick={() => act("login", "로그인")}>
          로그인
        </button>
        <button className="sm" disabled={Boolean(busy)} onClick={() => act("check", "확인")}>
          확인
        </button>
        <button className="sm" disabled={Boolean(busy)} onClick={() => act("ask", "시험")}>
          시험
        </button>
        <button className="sm" disabled={Boolean(busy)} onClick={() => act("cookies", "쿠키")}>
          쿠키
        </button>
      </div>
      {busy && <small><span className="spinner" />{busy} 중…</small>}
      {result && <small style={{ display: "block", maxWidth: 260 }}>{result}</small>}
    </div>
  );
}

interface Agent {
  id: string;
  label: string;
  command: string;
  args: string[];
  promptVia: "stdin" | "arg";
  supportsSchema: boolean;
  resultPath: string;
  versionArgs: string[];
  timeoutMs: number;
  verified: boolean;
  notes: string;
}

const NEW_AGENT: Agent = {
  id: "",
  label: "",
  command: "",
  args: ["-p", "{{user}}"],
  promptVia: "arg",
  supportsSchema: false,
  resultPath: "",
  versionArgs: ["--version"],
  timeoutMs: 900000,
  verified: false,
  notes: "",
};

/**
 * CLI 설정 편집기.
 *
 * CLI마다 플래그가 달라서, 새 구독 CLI를 붙이는 일이 코드 수정이 되지 않도록
 * 여기서 직접 고치게 한다.
 */
function AgentEditor() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");

  useEffect(() => {
    void api<Agent[]>("/api/agents")
      .then(setAgents)
      .catch((err) => setFailure(String(err)));
  }, []);

  function update(index: number, patch: Partial<Agent>) {
    setAgents((current) =>
      current
        ? current.map((agent, i) => (i === index ? { ...agent, ...patch } : agent))
        : current,
    );
  }

  async function save() {
    if (!agents) return;
    setBusy(true);
    setMessage("");
    setFailure("");
    try {
      setAgents(await api<Agent[]>("/api/agents", { method: "PUT", json: agents }));
      setMessage("저장했습니다. 목록 위쪽 상태는 새로고침하면 갱신됩니다.");
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!agents) return null;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>CLI 플래그 설정</h3>
        <button className="sm" onClick={() => setOpen(!open)}>
          {open ? "접기" : "펼치기"}
        </button>
      </div>

      {open && (
        <>
          <p className="dim">
            자리표시자: <code>{"{{system}}"}</code> 시스템 프롬프트,{" "}
            <code>{"{{user}}"}</code> 사용자 프롬프트, <code>{"{{schema}}"}</code> JSON
            Schema. 값이 비는 자리표시자는 짝이 되는 앞 플래그까지 같이 빠집니다.
          </p>

          {agents.map((agent, index) => (
            <div
              key={index}
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 12,
                marginTop: 12,
              }}
            >
              <div className="grid two">
                <div className="field">
                  <label>id (PLANNER_AGENT에 쓰는 값)</label>
                  <input
                    value={agent.id}
                    onChange={(e) => update(index, { id: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>이름</label>
                  <input
                    value={agent.label}
                    onChange={(e) => update(index, { label: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>실행 명령 (또는 전체 경로)</label>
                  <input
                    className="mono"
                    value={agent.command}
                    onChange={(e) => update(index, { command: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>프롬프트 전달</label>
                  <select
                    value={agent.promptVia}
                    onChange={(e) =>
                      update(index, { promptVia: e.target.value as Agent["promptVia"] })
                    }
                  >
                    <option value="stdin">stdin으로</option>
                    <option value="arg">인자로 ({"{{user}}"} 자리)</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>인자 (한 줄에 하나)</label>
                <textarea
                  className="mono"
                  rows={Math.min(12, agent.args.length + 1)}
                  value={agent.args.join("\n")}
                  onChange={(e) => update(index, { args: e.target.value.split("\n") })}
                />
              </div>

              <div className="grid two">
                <div className="field">
                  <label>결과 경로 (JSON 봉투일 때, 비우면 stdout 전체)</label>
                  <input
                    className="mono"
                    value={agent.resultPath}
                    onChange={(e) => update(index, { resultPath: e.target.value })}
                    placeholder="예: result"
                  />
                </div>
                <div className="field">
                  <label>설치 확인 인자</label>
                  <input
                    className="mono"
                    value={agent.versionArgs.join(" ")}
                    onChange={(e) =>
                      update(index, { versionArgs: e.target.value.split(/\s+/).filter(Boolean) })
                    }
                  />
                </div>
              </div>

              <div className="row">
                <label style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={agent.supportsSchema}
                    onChange={(e) => update(index, { supportsSchema: e.target.checked })}
                  />
                  JSON Schema 플래그 지원
                </label>
                <label style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={agent.verified}
                    onChange={(e) => update(index, { verified: e.target.checked })}
                  />
                  검증 완료
                </label>
                <button
                  className="sm danger"
                  onClick={() => setAgents(agents.filter((_, i) => i !== index))}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={() => setAgents([...agents, { ...NEW_AGENT }])}>
              CLI 추가
            </button>
            <button className="primary" onClick={save} disabled={busy}>
              {busy && <span className="spinner" />}
              저장
            </button>
          </div>

          {message && <div className="notice ok">{message}</div>}
          {failure && <div className="notice error">{failure}</div>}
        </>
      )}
    </div>
  );
}
