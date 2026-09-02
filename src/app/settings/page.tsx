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
  available: boolean;
  reason: string;
}

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
      <h2>기획 엔진</h2>
      <div className="card">
        <p className="dim" style={{ marginTop: 0 }}>
          둘 중 하나만 있으면 됩니다. 구독제(Claude Pro/Max)는 API 키를 주지 않으므로
          Claude Code CLI를 경유합니다.
        </p>
        <table>
          <tbody>
            {status.engines.map((engine) => {
              const active =
                status.engineForced === engine.id ||
                (!status.engineForced &&
                  engine.available &&
                  // 지정이 없으면 API가 우선, 없으면 CLI.
                  (engine.id === "api" ||
                    !status.engines.find((e) => e.id === "api")?.available));
              return (
                <tr key={engine.id}>
                  <td>
                    <strong>{engine.label}</strong>
                    {active && engine.available && (
                      <span className="pill ok" style={{ marginLeft: 6 }}>사용 중</span>
                    )}
                    {!engine.available && <br />}
                    {!engine.available && <small>{engine.reason}</small>}
                  </td>
                  <td style={{ width: 1, whiteSpace: "nowrap" }}>
                    <span className={engine.available ? "pill ok" : "pill off"}>
                      {engine.available ? "준비됨" : "사용 불가"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <small>
          <code>PLANNER_ENGINE</code>을 <code>cli</code> 또는 <code>api</code>로 두면
          고정됩니다{status.engineForced && ` (지금: ${status.engineForced})`}.
        </small>
        {!status.engines.some((e) => e.available) && (
          <div className="notice error">
            기획을 만들 방법이 없습니다. Claude Code CLI를 설치해 <code>claude</code>로
            로그인하거나, <code>ANTHROPIC_API_KEY</code>를 넣으세요.
          </div>
        )}
      </div>

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
