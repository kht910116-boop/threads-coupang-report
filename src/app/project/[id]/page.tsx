"use client";

import { Fragment, use, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Assistant } from "@/app/assistant";
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

