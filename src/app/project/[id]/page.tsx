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

      <Assistant projectId={project.id} step={step} />
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
function Assistant({ projectId, step }: { projectId: string; step: Step }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setBusy(true);
    try {
      const result = await api<{ answer: string }>(`/api/projects/${projectId}/assistant`, {
        json: { message, step, history: messages.slice(-10) },
      });
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
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
