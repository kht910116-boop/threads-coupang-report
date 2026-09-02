"use client";

import { use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { STEPS, STEP_LABEL, type Project, type Step } from "@/lib/types";
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

  return (
    <>
      <div className="card spread" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{project.title || project.topic}</h3>
          <small>
            {project.preset.name} · {project.preset.aspect} · 목표{" "}
            {project.preset.targetDurationSec}초
          </small>
        </div>
      </div>

      <nav className="steps">
        {STEPS.map((s) => (
          <button
            key={s}
            className={`step ${step === s ? "active" : ""} ${project.done.includes(s) ? "done" : ""}`}
            onClick={() => setStep(s)}
          >
            {STEP_LABEL[s]}
          </button>
        ))}
      </nav>

      {busy && (
        <div className="notice">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {error && (
        <div className="notice error" style={{ whiteSpace: "pre-wrap" }}>{error}</div>
      )}

      {panel}

      <Assistant projectId={project.id} step={step} />
    </>
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
