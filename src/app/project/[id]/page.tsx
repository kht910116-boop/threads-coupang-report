"use client";

import { Fragment, use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { STEPS, STEP_DESC, STEP_LABEL, type Project, type Step } from "@/lib/types";
import {
  StepExport,
  StepScript,
  StepStoryboard,
  StepStructure,
  StepStyling,
  StepTts,
  StepVisuals,
  type PanelProps,
} from "./steps";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<Step>("script");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const loaded = await api<Project>(`/api/projects/${id}`);
      setProject(loaded);
      // 처음 열 때는 아직 안 끝난 첫 단계로 데려간다.
      setStep((current) =>
        current === "script" && loaded.done.length > 0
          ? (STEPS.find((s) => !loaded.done.includes(s)) ?? "export")
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run: PanelProps["run"] = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  if (!project) {
    return error ? <div className="notice error">{error}</div> : <p className="dim">불러오는 중…</p>;
  }

  const panelProps: PanelProps = { project, setProject, run, busy };

  const panel = {
    script: <StepScript {...panelProps} />,
    structure: <StepStructure {...panelProps} />,
    tts: <StepTts {...panelProps} />,
    storyboard: <StepStoryboard {...panelProps} />,
    images: <StepVisuals {...panelProps} kind="image" />,
    videos: <StepVisuals {...panelProps} kind="video" />,
    styling: <StepStyling {...panelProps} />,
    export: <StepExport {...panelProps} />,
  }[step];

  const at = STEPS.indexOf(step);

  return (
    <>
      <div className="crumb">
        <span className="chip">{project.preset.name}</span>
        <span>›</span>
        <strong>{project.title || project.topic}</strong>
        <span>
          · {project.preset.aspect} · 목표 {project.preset.targetDurationSec}초
        </span>
      </div>

      <StepRail step={step} done={project.done} onGo={setStep} />

      <div className="step-head">
        <h2>{STEP_LABEL[step]}</h2>
        <p>{STEP_DESC[step]}</p>
      </div>

      {/*
        진행 표시는 화면 맨 위 한 자리에 고정한다. 오래 걸리는 작업이 많은데
        버튼 옆에서 돌면 스크롤을 내린 사이에 끝났는지를 알 수 없다.
      */}
      {busy && (
        <div className="status" style={{ marginBottom: 14 }}>
          <div className="line">
            <span className="spinner" />
            {busy}
          </div>
        </div>
      )}
      {error && (
        <div className="notice error" style={{ whiteSpace: "pre-wrap" }}>{error}</div>
      )}

      <div className="step-body">{panel}</div>

      <div className="step-foot">
        <button disabled={at === 0} onClick={() => setStep(STEPS[at - 1])}>
          ← {at > 0 ? STEP_LABEL[STEPS[at - 1]] : "이전"}
        </button>
        <div className="right">
          <button
            className="primary"
            disabled={at === STEPS.length - 1}
            onClick={() => setStep(STEPS[at + 1])}
          >
            {at < STEPS.length - 1 ? STEP_LABEL[STEPS[at + 1]] : "마지막"} →
          </button>
        </div>
      </div>

      <Assistant projectId={project.id} step={step} onApplied={() => void load()} />
    </>
  );
}

/**
 * 단계 레일.
 *
 * 끝난 단계는 체크, 지금 단계는 채운 알약, 남은 단계는 흐린 숫자로 둔다.
 * 사이의 연결선은 이게 순서가 있는 절차라는 걸 보여준다 — 알약만 나열하면
 * 그냥 탭처럼 보여서 어디까지 왔는지가 안 읽힌다.
 *
 * 다만 이동은 막지 않는다. 레퍼런스 사이트는 앞 단계로 못 돌아가는데,
 * 이건 개인용 로컬 도구라 되돌아가 고치는 일이 훨씬 잦다.
 */
function StepRail({
  step,
  done,
  onGo,
}: {
  step: Step;
  done: Step[];
  onGo: (step: Step) => void;
}) {
  return (
    <nav className="rail">
      {STEPS.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && <span className={`link ${done.includes(STEPS[i - 1]) ? "done" : ""}`} />}
          <button
            className={`step ${step === s ? "active" : ""} ${done.includes(s) ? "done" : ""}`}
            onClick={() => onGo(s)}
            title={STEP_DESC[s]}
          >
            <span className="n">{done.includes(s) && step !== s ? "✓" : i + 1}</span>
            {STEP_LABEL[s]}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}

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

interface EngineRow {
  id: string;
  label: string;
  kind: "cli" | "web" | "api";
  ready: boolean | null;
  models: Array<{ id: string; label: string; note: string }>;
}

function Assistant({
  projectId,
  step,
  onApplied,
}: {
  projectId: string;
  step: Step;
  /** 비서가 프로젝트를 고친 뒤. 화면이 옛 값을 들고 있으면 안 된다. */
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engines, setEngines] = useState<EngineRow[]>([]);
  const [engineId, setEngineId] = useState("");
  const [model, setModel] = useState("");
  const [edits, setEdits] = useState<ProposedEdit[]>([]);
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

  const chosenEngine = engines.find((e) => e.id === engineId);

  async function applyEdits() {
    const picked = edits.filter((_, i) => chosen.has(i));
    if (picked.length === 0) return;
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
      onApplied();
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
      const result = await api<{
        answer: string;
        edits: ProposedEdit[];
        rejected: string[];
      }>(`/api/projects/${projectId}/assistant`, {
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
        비서
      </button>
    );
  }

  return (
    <div className="assistant">
      <div className="spread" style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <strong>비서 · {STEP_LABEL[step]}</strong>
        <button className="sm" onClick={() => setOpen(false)}>닫기</button>
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

      <div className="assistant-log">
        {messages.length === 0 && (
          <p className="dim" style={{ margin: 0 }}>
            지금 단계에 대해 물어보세요. 프로젝트 내용을 보고 답합니다.
            <br />
            <br />
            예: &ldquo;훅이 약한 것 같은데 어때?&rdquo; · &ldquo;7번 줄 더 짧게 고쳐줘&rdquo; ·
            &ldquo;장면 12번 프롬프트를 더 구체적으로&rdquo;
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
    </div>
  );
}
