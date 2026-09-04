"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { STEP_LABEL, type Step } from "@/lib/types";

/**
 * 단계마다 따라다니는 비서.
 *
 * 프로젝트 화면과 첫 화면이 같이 쓴다. 첫 화면에는 프로젝트가 없으므로 대화 탭이
 * 없고 **앱 고치기만** 나온다 — 앱을 고치는 일은 어느 프로젝트에 있든 상관이 없는데,
 * 그걸 프로젝트 안에만 두면 앱을 고치려고 아무 프로젝트나 열어야 한다.
 */

interface Message {
  role: "user" | "assistant";
  content: string;
}

/**
 * 단계마다 따라다니는 비서.
 *
 * 지금 어느 단계에 있는지와 프로젝트 상태가 매번 서버로 같이 넘어가서,
 * "3번째 줄이 너무 길다" 같은 구체적인 말을 할 수 있다.
 */
interface ProposedEdit {
  target: "line" | "scene" | "setting";
  number?: number;
  id?: string;
  field: string;
  value: string;
  before: string;
  why: string;
}

/** 무엇을 고치는 것인지 사람 말로. field 이름을 그대로 보여주면 안 읽힌다. */
const EDIT_LABEL: Record<string, string> = {
  text: "자막 글자",
  spokenText: "읽는 글자",
  summaryKo: "한글요약",
  prompt: "이미지 프롬프트",
  motionPrompt: "모션 프롬프트",
  effect: "효과",
  mode: "모드",
};

function editTitle(edit: ProposedEdit): string {
  if (edit.target === "line") return `${edit.number}번 줄 · ${EDIT_LABEL[edit.field] ?? edit.field}`;
  if (edit.target === "scene") return `${edit.number}번 장면 · ${EDIT_LABEL[edit.field] ?? edit.field}`;
  return `설정 · ${edit.field}`;
}

interface DevState {
  ok: boolean;
  reason: string;
  sourceDir: string;
  branch: string;
  agents: Array<{ id: string; label: string; models: Array<{ id: string; label: string }> }>;
}

interface PatchResult {
  output: string;
  code: number | null;
  touched: string[];
  preexisting: string[];
  stat: string;
  diff: string;
}

interface EngineRow {
  id: string;
  label: string;
  kind: "cli" | "web" | "api";
  ready: boolean | null;
  models: Array<{ id: string; label: string; note: string }>;
}

export function Assistant({
  projectId,
  step,
  onApplied,
}: {
  /** 없으면 프로젝트가 없는 화면이다. 대화 탭 없이 앱 고치기만 나온다. */
  projectId?: string;
  step?: Step;
  /** 비서가 프로젝트를 고친 뒤. 화면이 옛 값을 들고 있으면 안 된다. */
  onApplied?: () => void;
}) {
  /*
    기본이 '열림'이다.

    예전에는 동그란 버튼 하나만 떠 있고 눌러야 열렸다. 앱을 켠 사용자가
    "비서봇이 안 보인다"고 했다 — 버튼 하나는 비서로 안 읽힌다. 옆에 늘 붙어
    있어야 물어볼 생각이 든다. 접는 것은 되지만 그건 사용자가 정하는 일이다.
  */
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engines, setEngines] = useState<EngineRow[]>([]);
  const [engineId, setEngineId] = useState("");
  const [model, setModel] = useState("");
  const [edits, setEdits] = useState<ProposedEdit[]>([]);
  // 프로젝트를 고치는 쪽과 앱을 고치는 쪽. 전혀 다른 일이라 자리를 나눈다.
  const [tab, setTab] = useState<"ask" | "app">("ask");
  const [dev, setDev] = useState<DevState | null>(null);
  const [patch, setPatch] = useState<PatchResult | null>(null);
  const [patchBusy, setPatchBusy] = useState(false);
  const [devAgent, setDevAgent] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  // 기본은 전부 켬. 비서가 시킨 것만 담게 되어 있으니 대개 그대로 받는다.
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  /*
    엔진 목록은 비서를 열 때 한 번만 가져온다. 목록을 뽑으려면 CLI마다 --version을
    돌려봐야 해서 몇 초 걸린다 — 화면을 열 때마다 하면 안 된다.
  */
  useEffect(() => {
    if (!open || engines.length > 0) return;
    api<EngineRow[]>("/api/engines")
      .then(setEngines)
      .catch(() => setEngines([]));
  }, [open, engines.length]);

  useEffect(() => {
    if (!open || tab !== "app" || dev) return;
    api<DevState>("/api/dev")
      .then((d) => {
        setDev(d);
        setDevAgent((current) => current || d.agents[0]?.id || "");
      })
      .catch(() => setDev(null));
  }, [open, tab, dev]);

  async function patchApp(ask: string) {
    setPatchBusy(true);
    setPatch(null);
    try {
      setPatch(
        await api<PatchResult>("/api/dev/patch", {
          json: { request: ask, agentId: devAgent, model },
        }),
      );
    } catch (err) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setPatchBusy(false);
    }
  }

  async function revertPatch() {
    if (!patch || patch.touched.length === 0) return;
    setPatchBusy(true);
    try {
      await api("/api/dev/revert", { json: { files: patch.touched } });
      setPatch(null);
    } finally {
      setPatchBusy(false);
    }
  }

  const chosenEngine = engines.find((e) => e.id === engineId);

  async function applyEdits() {
    const picked = edits.filter((_, i) => chosen.has(i));
    if (picked.length === 0 || !projectId) return;
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/assistant`, {
        method: "PUT",
        json: {
          edits: picked.map((e) => ({
            target: e.target,
            id: e.id,
            field: e.field,
            value: e.value,
          })),
        },
      });
      setEdits([]);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `${picked.length}군데 고쳤습니다.` },
      ]);
      // 프로젝트가 바뀌었으니 화면을 다시 읽는다. 비서 창은 열어둔다.
      onApplied?.();
    } catch (err) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setBusy(false);
    }
  }
  // 엔진을 바꾸면 모델은 초기화한다. 클로드의 'opus'를 그록에 넘기면 실패한다.
  const pickEngine = (id: string) => {
    setEngineId(id);
    setModel("");
  };

  async function send() {
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setBusy(true);
    try {
      /*
        프로젝트가 있으면 그 대본·장면을 들고 답하고, 없으면 앱 자체를 설명한다.
        첫 화면에서 묻는 말은 "7번 줄 고쳐줘"가 아니라 "이거 어떻게 쓰냐"다.
      */
      const result = await api<{
        answer: string;
        edits: ProposedEdit[];
        rejected: string[];
      }>(projectId ? `/api/projects/${projectId}/assistant` : "/api/assistant", {
        json: { message, step, history: messages.slice(-10), engineId, model },
      });
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
      setEdits(result.edits);
      setChosen(new Set(result.edits.map((_, i) => i)));
      if (result.rejected.length > 0) {
        // 걸러낸 제안도 말해준다. 조용히 빼면 비서가 대답만 하고 안 고친 것처럼 보인다.
        setMessages((current) => [
          ...current,
          { role: "assistant", content: `못 적용한 것: ${result.rejected.join(" / ")}` },
        ]);
      }
    } catch (err) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="assistant-fab" onClick={() => setOpen(true)}>
        비서 열기
      </button>
    );
  }

  return (
    <div className="assistant">
      <div className="spread" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div className="tabs">
          <button className={tab === "ask" ? "on" : ""} onClick={() => setTab("ask")}>
            {projectId ? "이 프로젝트" : "묻기"}
          </button>
          <button className={tab === "app" ? "on" : ""} onClick={() => setTab("app")}>
            앱 고치기
          </button>
        </div>
        <button className="sm" onClick={() => setOpen(false)}>접기</button>
      </div>

      {/*
        어느 AI에게 물을지 고른다.

        기본은 '자동'이다 — 쓸 수 있는 것 중 첫 번째를 서버가 고른다. 대부분은
        그걸로 충분하고, 어느 CLI가 로그인돼 있는지 사용자가 외울 이유가 없다.
        다만 모델은 답의 질이 눈에 띄게 갈리므로 고를 수 있어야 한다.
      */}
      <div className="assistant-pick">
        <select value={engineId} onChange={(e) => pickEngine(e.target.value)}>
          <option value="">자동 (쓸 수 있는 것)</option>
          {engines.map((e) => (
            <option key={e.id} value={e.id} disabled={e.ready === false}>
              {e.label}
              {e.ready === false ? " · 준비 안 됨" : ""}
            </option>
          ))}
        </select>
        {chosenEngine && chosenEngine.models.length > 0 && (
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">기본 모델</option>
            {chosenEngine.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {chosenEngine?.models.find((m) => m.id === model) && (
        <p className="assistant-note">
          {chosenEngine.models.find((m) => m.id === model)?.note}
        </p>
      )}

      {tab === "app" ? (
        <AppPatch
          dev={dev}
          devAgent={devAgent}
          setDevAgent={setDevAgent}
          patch={patch}
          busy={patchBusy}
          showDiff={showDiff}
          setShowDiff={setShowDiff}
          onPatch={patchApp}
          onRevert={revertPatch}
        />
      ) : (
      <>
      <div className="assistant-log">
        {messages.length === 0 && (
          <p className="dim" style={{ margin: 0 }}>
            {projectId
              ? "지금 단계에 대해 물어보세요. 프로젝트 내용을 보고 답합니다."
              : "이 앱에 대해 무엇이든 물어보세요. 프로젝트를 열면 그 대본과 장면을 보고 답합니다."}
            <br />
            <br />
            {projectId
              ? "예: 훅이 약한 것 같은데 어때? · 7번 줄 더 짧게 고쳐줘 · 장면 12번 프롬프트를 더 구체적으로"
              : "예: 쇼츠는 어느 프리셋을 써? · 발음 검수는 어디에 있어? · 이미지는 어떻게 만들어?"}
          </p>
        )}
        {messages.map((message, i) => (
          <div key={i} className={`bubble ${message.role}`}>
            {message.content}
          </div>
        ))}
        {busy && <div className="bubble assistant"><span className="spinner" />생각 중…</div>}

        {/*
          비서가 바꾸겠다는 것들. 여기서 누르기 전까지 아무것도 안 바뀐다.
          되돌리기가 없으므로 전과 후를 나란히 보여주는 것이 이 기능의 절반이다.
        */}
        {edits.length > 0 && (
          <div className="edits">
            <div className="spread">
              <strong>이렇게 고칩니다</strong>
              <button className="sm" onClick={() => setEdits([])}>버리기</button>
            </div>
            {edits.map((edit, i) => (
              <label className={`edit${chosen.has(i) ? " on" : ""}`} key={i}>
                <input
                  type="checkbox"
                  checked={chosen.has(i)}
                  onChange={() =>
                    setChosen((current) => {
                      const next = new Set(current);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                />
                <div>
                  <span className="what">{editTitle(edit)}</span>
                  <p className="was">{edit.before || "(비어 있음)"}</p>
                  <p className="now">{edit.value}</p>
                  <p className="why">{edit.why}</p>
                </div>
              </label>
            ))}
            <button
              className="primary"
              style={{ width: "100%" }}
              disabled={busy || chosen.size === 0}
              onClick={() => void applyEdits()}
            >
              고른 {chosen.size}군데 적용
            </button>
          </div>
        )}
      </div>

      <div className="row" style={{ padding: 10, flexWrap: "nowrap", gap: 6 }}>
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="물어보기 (Enter 전송)"
          style={{ minHeight: 0 }}
        />
        <button className="primary sm" onClick={send} disabled={busy}>보내기</button>
      </div>
      </>
      )}
    </div>
  );
}

/**
 * 앱 자체를 고치는 자리.
 *
 * 프로젝트를 고치는 것과 자리를 나눈 이유는 위험이 다르기 때문이다. 저쪽은
 * 데이터고 이쪽은 돌고 있는 프로그램이다. 섞어두면 "짧게 고쳐줘" 한마디가
 * 대본을 고칠지 소스를 고칠지 알 수 없다.
 *
 * 커밋하지 않고 푸시하지 않는다. 바꾼 것을 보여주고 되돌릴 길을 준다.
 */
function AppPatch({
  dev,
  devAgent,
  setDevAgent,
  patch,
  busy,
  showDiff,
  setShowDiff,
  onPatch,
  onRevert,
}: {
  dev: DevState | null;
  devAgent: string;
  setDevAgent: (id: string) => void;
  patch: PatchResult | null;
  busy: boolean;
  showDiff: boolean;
  setShowDiff: (v: boolean) => void;
  onPatch: (ask: string) => Promise<void>;
  onRevert: () => Promise<void>;
}) {
  const [ask, setAsk] = useState("");
  const [dir, setDir] = useState("");

  if (!dev) return <div className="assistant-log"><p className="dim">불러오는 중…</p></div>;

  // 소스가 없으면 왜 없는지 쓰고, 넣을 칸을 준다.
  if (!dev.ok) {
    return (
      <div className="assistant-log">
        <p className="dim" style={{ margin: "0 0 10px" }}>{dev.reason}</p>
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          placeholder="예: C:\\Users\\나\\autotube-studio"
        />
        <button
          className="primary sm"
          onClick={async () => {
            await api("/api/dev", { method: "PUT", json: { sourceDir: dir } });
            location.reload();
          }}
        >
          이 폴더로 지정
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="assistant-log">
        <p className="dim" style={{ margin: "0 0 8px", fontSize: 11.5 }}>
          {dev.sourceDir} · <strong>{dev.branch}</strong>
          <br />
          앱 소스를 고칩니다. <strong>커밋하지 않고 푸시하지 않습니다.</strong> 바꾼
          것을 보여드리면 두고 갈지 되돌릴지 정하세요. 반영하려면 앱을 다시
          빌드해야 합니다.
        </p>

        {dev.agents.length > 1 && (
          <select
            value={devAgent}
            onChange={(e) => setDevAgent(e.target.value)}
            style={{ marginBottom: 8 }}
          >
            {dev.agents.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        )}

        {busy && <div className="bubble assistant"><span className="spinner" />고치는 중… (몇 분 걸립니다)</div>}

        {patch && (
          <div className="patch">
            <p className="out">{patch.output || "(아무 말도 없었습니다)"}</p>
            {patch.touched.length === 0 ? (
              <p className="dim">바뀐 파일이 없습니다.</p>
            ) : (
              <>
                <p>
                  <strong>바뀐 파일 {patch.touched.length}개</strong>
                  {patch.preexisting.length > 0 && (
                    <span className="dim">
                      {" "}· 원래 손대고 계시던 {patch.preexisting.length}개는 건드리지
                      않았습니다
                    </span>
                  )}
                </p>
                <pre className="stat">{patch.stat}</pre>
                <div className="row">
                  <button className="sm" onClick={() => setShowDiff(!showDiff)}>
                    {showDiff ? "diff 접기" : "diff 보기"}
                  </button>
                  <button className="sm" onClick={() => void onRevert()} disabled={busy}>
                    되돌리기
                  </button>
                </div>
                {showDiff && <pre className="diff">{patch.diff}</pre>}
              </>
            )}
          </div>
        )}
      </div>

      <div className="row" style={{ padding: 10, flexWrap: "nowrap", gap: 6 }}>
        <textarea
          rows={2}
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="앱에서 고칠 것 (예: 음성 단계에 미리듣기 버튼 추가)"
          style={{ minHeight: 0 }}
        />
        <button
          className="primary sm"
          disabled={busy || !ask.trim()}
          onClick={() => {
            const text = ask.trim();
            setAsk("");
            void onPatch(text);
          }}
        >
          고치기
        </button>
      </div>
    </>
  );
}
