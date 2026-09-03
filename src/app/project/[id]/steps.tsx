"use client";

import { useEffect, useRef, useState } from "react";
import { api, assetUrl } from "@/lib/api-client";
import {
  EFFECT_LABEL,
  MAX_REFERENCES,
  SCENE_EFFECTS,
  SECTION_LABEL,
  type Project,
  type Scene,
  type ScriptSection,
} from "@/lib/types";

interface Choice {
  id: string;
  label: string;
  kind: "builtin" | "web";
  needsApiKey: boolean;
  configured: boolean;
}

interface Choices {
  tts: Choice[];
  image: Choice[];
  video: Choice[];
}

/**
 * 쓸 수 있는 서비스 목록.
 * 코드에 박힌 어댑터와 구독 웹 레시피가 한 목록으로 온다.
 * API 키를 안 쓰는 사람은 '(웹)' 이나 '직접 넣기'만 고르면 된다.
 */
function useChoices(): Choices | null {
  const [choices, setChoices] = useState<Choices | null>(null);
  useEffect(() => {
    void api<Choices>("/api/providers/choices").then(setChoices).catch(() => setChoices(null));
  }, []);
  return choices;
}

/** 서비스 고르는 드롭다운. API 키가 필요한데 없는 항목은 표시해준다. */
function ProviderSelect({
  choices,
  value,
  onChange,
}: {
  choices: Choice[] | undefined;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {(choices ?? [{ id: value, label: value, kind: "builtin", needsApiKey: false, configured: true }]).map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
          {c.needsApiKey && !c.configured ? " — API 키 없음" : ""}
        </option>
      ))}
    </select>
  );
}

export interface PanelProps {
  project: Project;
  setProject: (project: Project) => void;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  busy: string;
}

const sectionName = (section: ScriptSection) =>
  section.kind === "part" ? `파트${section.partNumber}` : SECTION_LABEL[section.kind];

const fmt = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const thumbClass = (aspect: string) =>
  aspect === "16:9" ? "thumb wide" : aspect === "1:1" ? "thumb square" : "thumb";

/** 장면·자막 줄에 파일을 직접 올린다. */
function UploadButton({
  projectId,
  kind,
  targetId,
  onDone,
  label = "올리기",
}: {
  projectId: string;
  kind: "image" | "video" | "audio";
  targetId: string;
  onDone: (project: Project) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="sm" onClick={() => input.current?.click()}>{label}</button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const form = new FormData();
          form.append("kind", kind);
          form.append("targetId", targetId);
          form.append("file", file);
          onDone(
            await api<Project>(`/api/projects/${projectId}/upload`, {
              method: "POST",
              body: form,
            }),
          );
        }}
      />
    </>
  );
}

/**
 * 이름 붙인 선택지 + 고른 결과를 말로 설명하는 힌트.
 *
 * 숫자를 그대로 받지 않으려고 만들었다. 사용자는 '줄 사이 200ms'가 어느 정도인지
 * 모르지만 '보통 — 숨 쉴 틈은 있고 늘어지지 않습니다'는 안다. 오른쪽 힌트가
 * 고를 때마다 바뀌어서, 누르기 전에 결과를 읽을 수 있다.
 */
function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string; hint: string }>;
  onChange: (id: T) => void;
}) {
  const hint = options.find((o) => o.id === value)?.hint ?? "";
  return (
    <div className="seg-field">
      <div className="seg-label">
        <span>{label}</span>
        <span className="seg-hint">{hint}</span>
      </div>
      <div className="seg">
        {options.map((o) => (
          <button key={o.id} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 되돌릴 수 없는 일 앞에서 한 번 막는다.
 *
 * 무엇을 잃는지 먼저 보여주고 나서 묻는다. '정말요?'만 띄우면 사용자는
 * 무엇이 사라지는지 모른 채 확인을 누른다.
 */
function Confirm({
  title,
  warn,
  cost,
  basis,
  confirmLabel = "진행",
  onConfirm,
  onCancel,
}: {
  title: string;
  warn?: string;
  cost?: string;
  basis?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {warn && <div className="warn">{warn}</div>}
        {cost && <div className="cost">{cost}</div>}
        {basis && <div className="basis">{basis}</div>}
        <div className="acts">
          <button onClick={onCancel}>취소</button>
          <button className="primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** 아직 아무것도 없을 때. 무엇이 여기 나타나는지를 미리 말해준다. */
function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <span>{desc}</span>
    </div>
  );
}

// ─── 1. 대본 ────────────────────────────────────────────────

/**
 * 대본을 어떻게 마련할지.
 *
 * write — 주제를 주면 앱이 쓴다.
 * paste — 밖에서 써 온 대본을 넣는다. 앱은 나누기만 한다.
 *
 * 드롭다운이 아니라 카드 두 장으로 묻는다. 고르기 전에 차이를 읽을 수 있어야 한다.
 */
type ScriptMode = "write" | "paste";

export function StepScript({ project, setProject, run, busy }: PanelProps) {
  const [topic, setTopic] = useState(project.topic);
  const [brief, setBrief] = useState(project.brief);
  const [refs, setRefs] = useState(project.references);
  const [pasted, setPasted] = useState("");
  // 이미 대본이 있으면 갈림길을 다시 묻지 않는다. 주제가 있으면 그때 쓴 것으로 본다.
  const [mode, setMode] = useState<ScriptMode | null>(() =>
    project.lines.length > 0 ? "write" : null,
  );

  const save = () =>
    run("저장 중…", async () => {
      setProject(
        await api<Project>(`/api/projects/${project.id}`, {
          method: "PATCH",
          json: { topic, brief, references: refs },
        }),
      );
    });

  const generate = () =>
    run("대본을 쓰는 중… (1~3분)", async () => {
      // 고친 내용을 먼저 저장하고 생성한다.
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        json: { topic, brief, references: refs },
      });
      setProject(await api<Project>(`/api/projects/${project.id}/script`, { method: "POST" }));
    });

  const split = () =>
    run("대본을 구간과 자막 줄로 나누는 중… (1~3분)", async () => {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        json: { topic, brief, references: refs },
      });
      setProject(
        await api<Project>(`/api/projects/${project.id}/script`, {
          json: { mode: "paste", text: pasted },
        }),
      );
    });

  // 아직 고르지 않았으면 갈림길부터 보여준다.
  if (mode === null) {
    return (
      <div className="choice-grid">
        <button className="choice" onClick={() => setMode("write")}>
          <strong>AI로 대본 생성</strong>
          <span>
            주제와 레퍼런스 링크를 주면 이 스타일에 맞는 대본을 씁니다.
            구간과 자막 줄까지 한 번에 나옵니다.
          </span>
        </button>
        <button className="choice" onClick={() => setMode("paste")}>
          <strong>직접 넣기</strong>
          <span>
            써 둔 대본을 붙여 넣습니다. 글은 그대로 두고 구간과 자막 줄로 나누기만 합니다.
          </span>
        </button>
      </div>
    );
  }

  if (mode === "paste") {
    const chars = [...pasted].length;
    return (
      <>
        <div className="mode-line">
          <span>직접 넣기</span>
          <button className="sm" onClick={() => setMode(null)}>방식 바꾸기</button>
        </div>

        <div className="card">
          {/*
            붙여넣기 칸 바로 위에 둔다. 다 넣고 나서 읽으라고 하면 아무도 안 읽는다.
            여기 적힌 것들은 전부 TTS가 이상하게 읽는 것들이다.
          */}
          <h3>대본 작성 가이드</h3>
          <ul className="dim" style={{ margin: "0 0 14px", paddingLeft: 18, lineHeight: 1.9 }}>
            <li>문장 끝 온점(.) 뒤에는 반드시 띄어쓰기</li>
            <li>따옴표는 피하세요 — 자막이 지저분해지고 음성이 끊깁니다</li>
            <li>문단 구분은 줄바꿈으로</li>
            <li>특수문자(※ ★ → 등)와 이모지는 넣지 마세요</li>
            <li>URL·이메일 주소는 그대로 읽힙니다. 넣지 마세요</li>
            <li>단어 뒤 괄호 금지 (예: 클로드(Claude) → 클로드)</li>
          </ul>

          <div className="seg-label">
            <span>대본</span>
            <span className="seg-hint">{chars.toLocaleString()}자</span>
          </div>
          <textarea
            rows={14}
            value={pasted}
            placeholder="써 둔 대본을 여기에 붙여 넣으세요."
            onChange={(e) => setPasted(e.target.value)}
          />

          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={split} disabled={Boolean(busy) || chars === 0}>
              {project.lines.length > 0 ? "다시 나누기" : "구간·자막 줄로 나누기"}
            </button>
            <small className="dim">
              글자는 한 자도 바꾸지 않습니다. 바뀌면 저장하지 않고 알려드립니다.
            </small>
          </div>
        </div>

        {project.lines.length === 0 ? (
          <Empty
            title="나누면 여기에 구간이 나타납니다."
            desc="훅·인트로부터 클로징까지 어떻게 나뉘었는지 보여줍니다. 줄 단위 편집은 2단계에서 합니다."
          />
        ) : (
          <div className="card">
            <div className="card-head">
              <h3>
                나뉜 결과{" "}
                <span className="count">
                  {project.sections.length}구간 · {project.lines.length}줄
                </span>
              </h3>
            </div>
            {[...project.sections]
              .sort((a, b) => a.order - b.order)
              .map((section) => {
                const count = project.lines.filter((l) => l.sectionId === section.id).length;
                return (
                  <div className="row" key={section.id} style={{ marginBottom: 6 }}>
                    <span className={`badge ${section.kind === "hook" ? "hook" : "accent"}`}>
                      {sectionName(section)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>{section.title}</span>
                    <small>{count}줄</small>
                  </div>
                );
              })}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mode-line">
        <span>AI로 대본 생성</span>
        <button className="sm" onClick={() => setMode(null)}>방식 바꾸기</button>
      </div>

      <div className="card">
        <div className="field">
          <label>주제</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="field">
          <label>지시사항 (선택)</label>
          <textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} />
        </div>

        <div className="field">
          <label>
            레퍼런스 링크 — 최대 {MAX_REFERENCES}개. 대본의 근거가 됩니다.
          </label>
          {refs.map((ref, i) => (
            <div className="row" key={i} style={{ marginBottom: 6, flexWrap: "nowrap" }}>
              <input
                className="mono"
                value={ref.url}
                placeholder="https://..."
                onChange={(e) =>
                  setRefs(refs.map((r, j) => (i === j ? { ...r, url: e.target.value } : r)))
                }
              />
              <input
                style={{ maxWidth: 220 }}
                value={ref.note}
                placeholder="여기서 뭘 가져올지"
                onChange={(e) =>
                  setRefs(refs.map((r, j) => (i === j ? { ...r, note: e.target.value } : r)))
                }
              />
              <button className="sm danger" onClick={() => setRefs(refs.filter((_, j) => j !== i))}>
                −
              </button>
            </div>
          ))}
          {refs.length < MAX_REFERENCES && (
            <button
              className="sm"
              onClick={() => setRefs([...refs, { url: "", title: "", note: "" }])}
            >
              링크 추가
            </button>
          )}
        </div>

        <div className="row">
          <button className="primary" onClick={generate} disabled={Boolean(busy)}>
            {project.lines.length > 0 ? "대본 다시 쓰기" : "대본 쓰기"}
          </button>
          <button onClick={save} disabled={Boolean(busy)}>저장만</button>
        </div>
      </div>

      {project.title && (
        <div className="card grid two">
          <div>
            <label>제목</label>
            <p style={{ margin: "0 0 12px" }}>{project.title}</p>
            <label>요약</label>
            <p style={{ margin: "0 0 12px" }}>{project.summary}</p>
            <label>해시태그</label>
            <p className="dim" style={{ margin: 0 }}>
              {project.hashtags.map((t) => `#${t}`).join(" ")}
            </p>
          </div>
          <div>
            <label>설명란</label>
            <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{project.description}</p>
            <label>썸네일 프롬프트</label>
            <p className="mono" style={{ margin: 0 }}>{project.thumbnailPrompt}</p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 2. 구조 ────────────────────────────────────────────────

export function StepStructure({ project, setProject, run, busy }: PanelProps) {
  const [edits, setEdits] = useState<Record<string, string>>({});

  const dirty = Object.entries(edits).filter(([id, text]) => {
    const line = project.lines.find((l) => l.id === id);
    return line && line.text !== text;
  });

  const save = () =>
    run("저장 중…", async () => {
      setProject(
        await api<Project>(`/api/projects/${project.id}`, {
          method: "PATCH",
          json: { lines: dirty.map(([id, text]) => ({ id, text })) },
        }),
      );
      setEdits({});
    });

  const totalChars = project.lines.reduce((sum, l) => sum + [...l.text].length, 0);

  return (
    <>
      <div className="card spread">
        <div>
          <strong>{project.lines.length}줄 / {totalChars}자</strong>
          <br />
          <small>
            한 줄이 자막 한 줄이자 음성 한 덩어리입니다. 고치면 그 줄의 음성은 지워집니다.
          </small>
        </div>
        {dirty.length > 0 && (
          <button className="primary" onClick={save} disabled={Boolean(busy)}>
            {dirty.length}줄 저장
          </button>
        )}
      </div>

      {project.lines.length === 0 && (
        <Empty
          title="아직 대본이 없습니다."
          desc="1단계에서 대본을 쓰면 훅·인트로부터 클로징까지 구간이 나뉘어 여기 나타납니다."
        />
      )}

      {/*
        구간 설명을 본문 옆 거터에 붙인다. 구간 목록을 위에 따로 두면 어느 줄이
        어느 구간인지 보려고 눈이 위아래로 왔다 갔다 해야 한다.
      */}
      {[...project.sections]
        .sort((a, b) => a.order - b.order)
        .map((section) => {
          const lines = project.lines
            .filter((l) => l.sectionId === section.id)
            .sort((a, b) => a.index - b.index);
          const chars = lines.reduce((sum, l) => sum + [...(edits[l.id] ?? l.text)].length, 0);
          const withAudio = lines.filter((l) => l.audio).length;
          return (
            <div className="card" key={section.id}>
              <div className="gutter">
                <div className="body" style={{ whiteSpace: "normal" }}>
                  {lines.map((line) => (
                    <div
                      className="row"
                      key={line.id}
                      style={{ flexWrap: "nowrap", marginBottom: 6 }}
                    >
                      <span className="num dim" style={{ width: 34, textAlign: "right" }}>
                        {line.index + 1}
                      </span>
                      <input
                        value={edits[line.id] ?? line.text}
                        onChange={(e) => setEdits({ ...edits, [line.id]: e.target.value })}
                      />
                      <small style={{ width: 52, textAlign: "right" }}>
                        {[...(edits[line.id] ?? line.text)].length}자
                      </small>
                      {line.audio && <span className="pill ok">음성</span>}
                    </div>
                  ))}
                </div>
                <div className="note">
                  <strong>
                    <span className={`badge ${section.kind === "hook" ? "hook" : "accent"}`}>
                      {sectionName(section)}
                    </span>
                  </strong>
                  <span>{section.title}</span>
                  <span className="len">
                    {lines.length}줄 · {chars}자
                    {withAudio > 0 && ` · 음성 ${withAudio}/${lines.length}`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
    </>
  );
}

// ─── 3. 음성 ────────────────────────────────────────────────

/**
 * 쉼.
 *
 * 무음은 값이 넷(앞·뒤·줄사이·파트사이)이라 따로 받으면 네 번 고민해야 하고,
 * 넷이 서로 안 맞으면 결과가 이상해진다. 함께 움직이는 값이라 한 덩어리로 묶었다.
 *
 * 절대값 프리셋을 두지 않고 **스타일이 정한 값에 배율**을 건다. 쉼의 기준은
 * 스타일마다 다르기 때문이다 — 쇼츠는 100ms가 보통이고 느린 해설은 320ms가
 * 보통이다. 절대값으로 두면 어느 스타일에서도 '보통'에 걸리지 않아, 새 프로젝트가
 * 늘 '직접'으로 열린다. 실제로 그렇게 만들었다가 화면에서 확인하고 고쳤다.
 */
const PACE_FACTORS = { tight: 0.5, normal: 1, loose: 1.6 } as const;

type Pace = keyof typeof PACE_FACTORS | "custom";

const SILENCE_FIELDS = ["leadSilenceMs", "tailSilenceMs", "gapMs", "sectionGapMs"] as const;
type SilenceField = (typeof SILENCE_FIELDS)[number];

const PACE_OPTIONS = [
  { id: "tight", label: "촘촘", hint: "스타일 기준의 절반. 줄이 바짝 붙습니다" },
  { id: "normal", label: "보통", hint: "권장 — 이 스타일이 정한 기본 쉼" },
  { id: "loose", label: "여유", hint: "기본보다 넉넉합니다. 차분한 해설에" },
  { id: "custom", label: "직접", hint: "네 값을 직접 넣습니다" },
] as const satisfies ReadonlyArray<{ id: Pace; label: string; hint: string }>;

/** 스타일 기준값에 배율을 건 무음 네 값. */
function scaledSilence(base: Project["preset"]["tts"], factor: number): Record<SilenceField, number> {
  return Object.fromEntries(
    SILENCE_FIELDS.map((field) => [field, Math.round(base[field] * factor)]),
  ) as Record<SilenceField, number>;
}

/** 지금 값이 어느 배율인지 되짚는다. 어느 것도 아니면 '직접'이다. */
function paceOf(tts: Project["tts"], base: Project["preset"]["tts"]): Pace {
  const match = (Object.keys(PACE_FACTORS) as Array<keyof typeof PACE_FACTORS>).find((key) => {
    const want = scaledSilence(base, PACE_FACTORS[key]);
    return SILENCE_FIELDS.every((field) => tts[field] === want[field]);
  });
  return match ?? "custom";
}

export function StepTts({ project, setProject, run, busy }: PanelProps) {
  const [tts, setTts] = useState(project.tts);
  const [redoAsk, setRedoAsk] = useState(false);
  // 값만 보고 프리셋을 되짚으면 '직접'을 누른 순간이 표현되지 않는다 —
  // 값이 아직 프리셋과 같으니 계속 그 프리셋으로 읽혀서 숫자 칸이 안 열린다.
  // 그래서 '직접을 골랐다'는 사실만 따로 들고 있는다.
  const [manual, setManual] = useState(
    () => paceOf(project.tts, project.preset.tts) === "custom",
  );
  const choices = useChoices();
  const withAudio = project.lines.filter((l) => l.audio).length;
  const pace: Pace = manual ? "custom" : paceOf(tts, project.preset.tts);

  const saveSettings = () =>
    run("저장 중…", async () => {
      setProject(
        await api<Project>(`/api/projects/${project.id}`, { method: "PATCH", json: { tts } }),
      );
    });

  const generate = (redo: boolean) =>
    run(redo ? "음성 전부 다시 만드는 중…" : "음성 만드는 중…", async () => {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { tts } });
      const result = await api<{ project: Project; failed: Array<{ line: number; error: string }> }>(
        `/api/projects/${project.id}/tts`,
        { json: { redo } },
      );
      setProject(result.project);
      if (result.failed.length > 0) {
        throw new Error(result.failed.map((f) => `${f.line}번 줄: ${f.error}`).join("\n"));
      }
    });

  return (
    <>
      <div className="card">
        <div className="grid two">
          <div className="field">
            <label>TTS 서비스</label>
            <ProviderSelect
              choices={choices?.tts}
              value={tts.provider}
              onChange={(id) => setTts({ ...tts, provider: id })}
            />
          </div>
          <div className="field">
            <label>세부 모델</label>
            <input
              value={tts.model}
              placeholder="비우면 기본값"
              onChange={(e) => setTts({ ...tts, model: e.target.value })}
            />
          </div>
          <div className="field">
            <label>voice id</label>
            <input value={tts.voiceId} onChange={(e) => setTts({ ...tts, voiceId: e.target.value })} />
          </div>
          <div className="field">
            <label>속도</label>
            <input
              type="number" step="0.01" value={tts.speed}
              onChange={(e) => setTts({ ...tts, speed: Number(e.target.value) })}
            />
          </div>
        </div>

        <Seg
          label="쉼"
          value={pace}
          options={PACE_OPTIONS}
          onChange={(id) => {
            setManual(id === "custom");
            if (id !== "custom") {
              setTts({ ...tts, ...scaledSilence(project.preset.tts, PACE_FACTORS[id]) });
            }
          }}
        />

        {/* '직접'을 골랐을 때만 숫자를 연다. 평소에는 네 칸이 화면을 차지할 이유가 없다. */}
        {pace === "custom" && (
          <div className="grid two">
            {(
              [
                ["leadSilenceMs", "영상 앞"],
                ["tailSilenceMs", "영상 뒤"],
                ["gapMs", "줄 사이"],
                ["sectionGapMs", "파트 사이"],
              ] as const
            ).map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label} (ms)</label>
                <input
                  type="number" value={tts[key]}
                  onChange={(e) => setTts({ ...tts, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="row">
          <button className="primary" onClick={() => generate(false)} disabled={Boolean(busy)}>
            음성 만들기 ({withAudio}/{project.lines.length})
          </button>
          <button onClick={() => setRedoAsk(true)} disabled={Boolean(busy)}>전부 다시</button>
          <button onClick={saveSettings} disabled={Boolean(busy)}>설정만 저장</button>
        </div>
      </div>

      {redoAsk && (
        <Confirm
          title="음성을 전부 다시 만들까요?"
          warn={`이미 만들어 둔 음성 ${withAudio}개가 지워지고 처음부터 다시 만듭니다. 되돌릴 수 없습니다.`}
          basis={`자막 ${project.lines.length}줄 · 구독 사용량을 씁니다`}
          confirmLabel="전부 다시"
          onCancel={() => setRedoAsk(false)}
          onConfirm={() => {
            setRedoAsk(false);
            void generate(true);
          }}
        />
      )}

      <div className="card">
        {[...project.lines]
          .sort((a, b) => a.index - b.index)
          .map((line) => (
            <div className="row" key={line.id} style={{ flexWrap: "nowrap", marginBottom: 6 }}>
              <span className="num dim" style={{ width: 34, textAlign: "right" }}>
                {line.index + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{line.text}</span>
              {line.audio ? (
                <>
                  <small style={{ width: 48, textAlign: "right" }}>
                    {line.audio.durationSec.toFixed(1)}s
                  </small>
                  <audio
                    src={assetUrl(line.audio.path)}
                    controls
                    preload="none"
                    style={{ width: 180, height: 28 }}
                  />
                </>
              ) : (
                <span className="pill off">없음</span>
              )}
              <UploadButton
                projectId={project.id} kind="audio" targetId={line.id} onDone={setProject}
              />
            </div>
          ))}
      </div>
    </>
  );
}

// ─── 4. 스토리보드 ──────────────────────────────────────────

interface GroupPreview {
  count: number;
  groups: Array<{ index: number; durationSec: number; lineFrom: number; lineTo: number }>;
  problems: Array<{ index: number; message: string }>;
}

export function StepStoryboard({ project, setProject, run, busy }: PanelProps) {
  const [intervals, setIntervals] = useState(project.intervals);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [tab, setTab] = useState<string>("");
  const [redoAsk, setRedoAsk] = useState(false);

  const loadPreview = async () =>
    setPreview(await api<GroupPreview>(`/api/projects/${project.id}/storyboard`));

  useEffect(() => {
    void loadPreview().catch(() => setPreview(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.lines.length]);

  const applyIntervals = () =>
    run("적용 중…", async () => {
      setProject(
        await api<Project>(`/api/projects/${project.id}`, {
          method: "PATCH",
          json: { intervals },
        }),
      );
      await loadPreview();
    });

  const generate = () =>
    run("장면을 짜는 중… (2~5분)", async () => {
      await api(`/api/projects/${project.id}`, { method: "PATCH", json: { intervals } });
      setProject(
        await api<Project>(`/api/projects/${project.id}/storyboard`, { method: "POST" }),
      );
    });

  const sections = [...project.sections].sort((a, b) => a.order - b.order);
  const activeTab = tab || sections[0]?.id || "";
  const tabAt = sections.findIndex((s) => s.id === activeTab);
  const ordered = [...project.scenes].sort((a, b) => a.index - b.index);
  const shown = ordered.filter((s) => !activeTab || s.sectionId === activeTab);
  // 이 구간이 영상 전체의 어디쯤인지. 앞 장면들의 길이를 더해 시작 시각을 낸다.
  const spanStart = ordered
    .slice(0, shown.length > 0 ? ordered.indexOf(shown[0]) : 0)
    .reduce((sum, s) => sum + s.durationSec, 0);
  const spanLength = shown.reduce((sum, s) => sum + s.durationSec, 0);

  return (
    <>
      <div className="card">
        <h3>장면 간격</h3>
        <p className="dim" style={{ marginTop: 0 }}>
          장면 하나가 화면에 머무는 기준 시간입니다. 자막 줄을 이 범위에 맞게 묶습니다.
        </p>
        {(
          [
            ["hookIntro", "훅+인트로"],
            ["part", "파트"],
            ["closing", "클로징"],
          ] as const
        ).map(([key, label]) => (
          <div className="row" key={key} style={{ marginBottom: 8, flexWrap: "nowrap" }}>
            <span style={{ width: 90 }}>{label}</span>
            <input
              type="range" min={1} max={40} step={0.5}
              value={intervals[key].min}
              onChange={(e) =>
                setIntervals({
                  ...intervals,
                  [key]: {
                    ...intervals[key],
                    min: Math.min(Number(e.target.value), intervals[key].max),
                  },
                })
              }
            />
            <input
              type="range" min={1} max={40} step={0.5}
              value={intervals[key].max}
              onChange={(e) =>
                setIntervals({
                  ...intervals,
                  [key]: {
                    ...intervals[key],
                    max: Math.max(Number(e.target.value), intervals[key].min),
                  },
                })
              }
            />
            <strong style={{ width: 90, textAlign: "right", color: "var(--accent)" }}>
              {intervals[key].min}~{intervals[key].max}초
            </strong>
          </div>
        ))}

        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={applyIntervals} disabled={Boolean(busy)}>미리보기 갱신</button>
          <button
            className="primary"
            onClick={() => (project.scenes.length > 0 ? setRedoAsk(true) : void generate())}
            disabled={Boolean(busy)}
          >
            {project.scenes.length > 0 ? "장면 다시 만들기" : "장면 만들기"}
          </button>
          {preview && (
            <small>
              이 설정이면 장면 <strong>{preview.count}개</strong>
              {preview.problems.length > 0 && ` · 기준을 벗어난 장면 ${preview.problems.length}개`}
            </small>
          )}
        </div>
      </div>

      {redoAsk && (
        <Confirm
          title="장면을 다시 만들까요?"
          warn={`장면 ${project.scenes.length}개가 새로 묶이고 그림 설명도 다시 씁니다. 붙여둔 이미지와 영상은 장면이 바뀌면 떨어져 나갑니다.`}
          basis={`자막 ${project.lines.length}줄 · 구독 사용량을 씁니다`}
          confirmLabel="다시 만들기"
          onCancel={() => setRedoAsk(false)}
          onConfirm={() => {
            setRedoAsk(false);
            void generate();
          }}
        />
      )}

      {project.scenes.length === 0 ? (
        <Empty
          title="아직 장면이 없습니다."
          desc="위에서 간격을 정하고 만들면, 음성 길이 합이 그 범위에 들어오도록 자막 줄이 묶여 여기 나타납니다."
        />
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>
              장면 <span className="count">{project.scenes.length}개</span>
            </h3>
            <small>{fmt(spanStart)}~{fmt(spanStart + spanLength)}</small>
          </div>

          {/* 파트별로 걸러 본다. 장면이 수십 개가 되면 한 번에 다 보는 게 오히려 안 읽힌다. */}
          <div className="chips">
            {sections.map((section) => {
              const count = project.scenes.filter((s) => s.sectionId === section.id).length;
              return (
                <button
                  key={section.id}
                  className={activeTab === section.id ? "on" : ""}
                  onClick={() => setTab(section.id)}
                >
                  {sectionName(section)}
                  <span className="count">{count}</span>
                </button>
              );
            })}
          </div>

          {shown.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              project={project}
              setProject={setProject}
              compact
            />
          ))}

          {/* 알약을 일일이 겨누지 않고 순서대로 넘길 수 있게 한다. */}
          <div className="pager">
            <button
              className="sm"
              disabled={tabAt <= 0}
              onClick={() => setTab(sections[tabAt - 1].id)}
            >
              ← 이전 구간
            </button>
            <span className="at">
              {tabAt + 1} / {sections.length} 구간
            </span>
            <button
              className="sm"
              disabled={tabAt >= sections.length - 1}
              onClick={() => setTab(sections[tabAt + 1].id)}
            >
              다음 구간 →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** 스토리보드·이미지·효과 단계가 공유하는 장면 카드. */
function SceneCard({
  scene,
  project,
  setProject,
  compact = false,
  showImage = false,
}: {
  scene: Scene;
  project: Project;
  setProject: (p: Project) => void;
  compact?: boolean;
  showImage?: boolean;
}) {
  const [summary, setSummary] = useState(scene.summaryKo);
  const [prompt, setPrompt] = useState(scene.prompt);
  const dirty = summary !== scene.summaryKo || prompt !== scene.prompt;

  useEffect(() => {
    setSummary(scene.summaryKo);
    setPrompt(scene.prompt);
  }, [scene.summaryKo, scene.prompt]);

  const patch = async (fields: Record<string, unknown>) =>
    setProject(
      await api<Project>(`/api/projects/${project.id}`, {
        method: "PATCH",
        json: { scenes: [{ id: scene.id, ...fields }] },
      }),
    );

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
      <div className="meta">
        <span className="num">씬 {scene.index + 1}</span>
        <span className="pill">자막 {scene.lineFrom + 1}~{scene.lineTo + 1}</span>
        <span className="pill">{scene.durationSec.toFixed(1)}초</span>
        <select
          value={scene.mode}
          onChange={(e) => void patch({ mode: e.target.value })}
          style={{ width: 96, padding: "2px 6px", fontSize: 12 }}
        >
          <option value="image">이미지</option>
          <option value="video">AI 영상</option>
        </select>
        <select
          value={scene.effect}
          onChange={(e) => void patch({ effect: e.target.value })}
          style={{ width: 110, padding: "2px 6px", fontSize: 12 }}
        >
          {SCENE_EFFECTS.map((e) => <option key={e} value={e}>{EFFECT_LABEL[e]}</option>)}
        </select>
        <label style={{ margin: 0, display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="checkbox" style={{ width: "auto" }} checked={scene.locked}
            onChange={(e) => void patch({ locked: e.target.checked })}
          />
          잠금
        </label>
        {dirty && (
          <button className="sm primary" onClick={() => void patch({ summaryKo: summary, prompt })}>
            저장
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showImage ? "132px 1fr" : "1fr", gap: 12 }}>
        {showImage && (
          <div>
            <div className={thumbClass(project.preset.aspect)}>
              {scene.mode === "video" && scene.video ? (
                <video src={assetUrl(scene.video.path)} controls preload="metadata" />
              ) : scene.image ? (
                // 로컬 파일이라 next/image 최적화가 의미 없다.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(scene.image.path)} alt={scene.summaryKo} />
              ) : (
                <span>아직 없음</span>
              )}
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <UploadButton
                projectId={project.id}
                kind={scene.mode === "video" ? "video" : "image"}
                targetId={scene.id}
                onDone={setProject}
              />
            </div>
          </div>
        )}

        <div>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            style={{ fontWeight: 600, marginBottom: 6 }}
          />
          <textarea
            className="mono dim"
            rows={compact ? 2 : 3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {scene.mode === "video" && (
            <small className="mono dim">모션: {scene.motionPrompt}</small>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 5. 이미지 / 6. 영상화 ──────────────────────────────────

export function StepVisuals({
  project,
  setProject,
  run,
  busy,
  kind,
}: PanelProps & { kind: "image" | "video" }) {
  const [image, setImage] = useState(project.image);
  const [tab, setTab] = useState<string>("");
  const [redoAsk, setRedoAsk] = useState(false);
  const choices = useChoices();

  const scenes = [...project.scenes].sort((a, b) => a.index - b.index);
  const targets = kind === "image" ? scenes : scenes.filter((s) => s.mode === "video");
  const done = targets.filter((s) => (kind === "image" ? s.image : s.video)).length;
  const sections = [...project.sections].sort((a, b) => a.order - b.order);
  // 여기는 스토리보드와 달리 '전체'가 기본이다. 그림이 다 찼는지 훑어보는 자리라서다.
  const activeTab = tab;
  const shown = activeTab ? targets.filter((s) => s.sectionId === activeTab) : targets;

  const generate = (redo: boolean) =>
    run(kind === "image" ? "이미지 만드는 중…" : "영상 만드는 중… (오래 걸립니다)", async () => {
      if (kind === "image") {
        await api(`/api/projects/${project.id}`, { method: "PATCH", json: { image } });
      }
      const result = await api<{
        project: Project;
        failed: Array<{ scene: number; error: string }>;
      }>(`/api/projects/${project.id}/visuals`, { json: { kind, redo } });
      setProject(result.project);
      if (result.failed.length > 0) {
        throw new Error(result.failed.map((f) => `${f.scene}번 장면: ${f.error}`).join("\n"));
      }
    });

  return (
    <>
      <div className="card">
        {kind === "image" && (
          <>
            <div className="grid two">
              <div className="field">
                <label>이미지 서비스</label>
                <ProviderSelect
                  choices={choices?.image}
                  value={image.provider}
                  onChange={(id) => setImage({ ...image, provider: id })}
                />
              </div>
              <div className="field">
                <label>모델</label>
                <input
                  value={image.model}
                  placeholder="비우면 기본값"
                  onChange={(e) => setImage({ ...image, model: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>화풍 접두부 — 모든 장면에 똑같이 붙어 그림체를 고정합니다</label>
              <textarea
                className="mono" rows={3} value={image.prefix}
                onChange={(e) => setImage({ ...image, prefix: e.target.value })}
              />
            </div>
            <div className="field">
              <label>접미부</label>
              <textarea
                className="mono" rows={2} value={image.suffix}
                onChange={(e) => setImage({ ...image, suffix: e.target.value })}
              />
            </div>
          </>
        )}
        {kind === "video" && (
          <p className="dim" style={{ marginTop: 0 }}>
            장면 카드에서 모드를 <strong>AI 영상</strong>으로 바꾼 장면만 만듭니다. 비싸고 느립니다.
          </p>
        )}

        <div className="row">
          <button className="primary" onClick={() => generate(false)} disabled={Boolean(busy)}>
            {kind === "image" ? "이미지" : "영상"} 만들기 ({done}/{targets.length})
          </button>
          <button onClick={() => setRedoAsk(true)} disabled={Boolean(busy) || done === 0}>
            전부 다시
          </button>
        </div>
      </div>

      {redoAsk && (
        <Confirm
          title={`${kind === "image" ? "이미지" : "영상"}를 전부 다시 만들까요?`}
          warn={`이미 만들어 둔 ${done}개가 지워지고 처음부터 다시 만듭니다. 잠근 장면도 함께 지워집니다.`}
          basis={`장면 ${targets.length}개 · 구독 사용량을 씁니다`}
          confirmLabel="전부 다시"
          onCancel={() => setRedoAsk(false)}
          onConfirm={() => {
            setRedoAsk(false);
            void generate(true);
          }}
        />
      )}

      {targets.length === 0 ? (
        <Empty
          title={kind === "video" ? "영상으로 만들 장면이 없습니다." : "아직 장면이 없습니다."}
          desc={
            kind === "video"
              ? "장면 카드에서 모드를 'AI 영상'으로 바꾸면 그 장면만 여기 모입니다."
              : "4단계 스토리보드에서 장면을 만들면 여기에 한 장씩 채워집니다."
          }
        />
      ) : (
        <div className="card">
          <div className="card-head">
            <h3>
              장면 <span className="count">{done}/{targets.length} 완료</span>
            </h3>
          </div>

          {/* 장면이 수십 개라 파트로 걸러 본다. 스토리보드 단계와 같은 조작이다. */}
          <div className="chips">
            <button className={activeTab === "" ? "on" : ""} onClick={() => setTab("")}>
              전체
              <span className="count">{targets.length}</span>
            </button>
            {sections.map((section) => {
              const count = targets.filter((s) => s.sectionId === section.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={section.id}
                  className={activeTab === section.id ? "on" : ""}
                  onClick={() => setTab(section.id)}
                >
                  {sectionName(section)}
                  <span className="count">{count}</span>
                </button>
              );
            })}
          </div>

          {shown.map((scene) => (
            <SceneCard
              key={scene.id} scene={scene} project={project} setProject={setProject} showImage
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── 7. 자막·효과 ───────────────────────────────────────────

export function StepStyling({ project, setProject, run, busy }: PanelProps) {
  const [caption, setCaption] = useState(project.caption);
  const [effects, setEffects] = useState(project.effects);

  const save = () =>
    run("저장 중…", async () => {
      setProject(
        await api<Project>(`/api/projects/${project.id}`, {
          method: "PATCH",
          json: { caption, effects },
        }),
      );
    });

  const applyRotation = () =>
    run("효과 다시 배치 중…", async () => {
      const rotation = effects.rotation.length > 0 ? effects.rotation : [effects.defaultEffect];
      setProject(
        await api<Project>(`/api/projects/${project.id}`, {
          method: "PATCH",
          json: {
            effects,
            scenes: [...project.scenes]
              .sort((a, b) => a.index - b.index)
              .map((scene, i) => ({
                id: scene.id,
                effect: effects.rotate ? rotation[i % rotation.length] : effects.defaultEffect,
              })),
          },
        }),
      );
    });

  return (
    <>
      <div className="card">
        <h3>자막</h3>
        <div className="grid two">
          <div className="field">
            <label>폰트 — 캡컷에 설치된 이름 그대로 (미리캔버스·캔바 폰트 가능)</label>
            <input
              value={caption.fontFamily}
              onChange={(e) => setCaption({ ...caption, fontFamily: e.target.value })}
            />
          </div>
          <div className="field">
            <label>크기</label>
            <input
              type="number" value={caption.fontSize}
              onChange={(e) => setCaption({ ...caption, fontSize: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>위치</label>
            <select
              value={caption.position}
              onChange={(e) =>
                setCaption({ ...caption, position: e.target.value as typeof caption.position })
              }
            >
              <option value="top">위</option>
              <option value="center">가운데</option>
              <option value="bottom">아래</option>
            </select>
          </div>
          <div className="field">
            <label>가장자리 여백 (0~0.5)</label>
            <input
              type="number" step="0.01" value={caption.marginRatio}
              onChange={(e) => setCaption({ ...caption, marginRatio: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>글자색</label>
            <input value={caption.color}
              onChange={(e) => setCaption({ ...caption, color: e.target.value })} />
          </div>
          <div className="field">
            <label>테두리색</label>
            <input value={caption.strokeColor}
              onChange={(e) => setCaption({ ...caption, strokeColor: e.target.value })} />
          </div>
          <div className="field">
            <label>한 줄 최대 글자수</label>
            <input
              type="number" value={caption.maxCharsPerLine}
              onChange={(e) => setCaption({ ...caption, maxCharsPerLine: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>자막 켜기</label>
            <select
              value={caption.enabled ? "on" : "off"}
              onChange={(e) => setCaption({ ...caption, enabled: e.target.value === "on" })}
            >
              <option value="on">켬</option>
              <option value="off">끔</option>
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: 16 }}>효과</h3>
        <div className="grid two">
          <div className="field">
            <label>기본 효과</label>
            <select
              value={effects.defaultEffect}
              onChange={(e) =>
                setEffects({ ...effects, defaultEffect: e.target.value as typeof effects.defaultEffect })
              }
            >
              {SCENE_EFFECTS.map((e) => <option key={e} value={e}>{EFFECT_LABEL[e]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>전환 길이(초)</label>
            <input
              type="number" step="0.05" value={effects.transitionSec}
              onChange={(e) => setEffects({ ...effects, transitionSec: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="field">
          <label>돌려쓸 효과 순서</label>
          <input
            className="mono" value={effects.rotation.join(", ")}
            onChange={(e) =>
              setEffects({
                ...effects,
                rotation: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s): s is typeof effects.defaultEffect =>
                    (SCENE_EFFECTS as readonly string[]).includes(s)),
              })
            }
          />
          <small>
            블러·글리치·오버레이는 캡컷 드래프트에 못 실립니다. 골라두면 내보낼 때 목록으로
            알려주고, 캡컷에서 직접 걸면 됩니다.
          </small>
        </div>

        <div className="row">
          <button className="primary" onClick={applyRotation} disabled={Boolean(busy)}>
            모든 장면에 효과 다시 배치
          </button>
          <button onClick={save} disabled={Boolean(busy)}>설정만 저장</button>
        </div>
      </div>

      <div className="card">
        <h3>장면별 효과</h3>
        <table>
          <tbody>
            {[...project.scenes]
              .sort((a, b) => a.index - b.index)
              .map((scene) => (
                <tr key={scene.id}>
                  <td style={{ width: 60 }}>씬 {scene.index + 1}</td>
                  <td>{scene.summaryKo}</td>
                  <td style={{ width: 130 }}>
                    <select
                      value={scene.effect}
                      onChange={async (e) =>
                        setProject(
                          await api<Project>(`/api/projects/${project.id}`, {
                            method: "PATCH",
                            json: { scenes: [{ id: scene.id, effect: e.target.value }] },
                          }),
                        )
                      }
                      style={{ padding: "2px 6px", fontSize: 12 }}
                    >
                      {SCENE_EFFECTS.map((e) => (
                        <option key={e} value={e}>{EFFECT_LABEL[e]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── 8. 캡컷 ────────────────────────────────────────────────

interface ExportResult {
  dir: string;
  files: string[];
  warnings: string[];
  installedTo: string | null;
}

export function StepExport({ project, run, busy }: PanelProps) {
  const [result, setResult] = useState<ExportResult | null>(null);

  const totalSec = project.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const missingImage = project.scenes.filter(
    (s) => !(s.mode === "video" ? s.video : s.image),
  ).length;
  const missingAudio = project.lines.filter((l) => !l.audio).length;

  return (
    <>
      <div className="card">
        <table>
          <tbody>
            <tr><td>길이</td><td>{fmt(totalSec)} (목표 {fmt(project.preset.targetDurationSec)})</td></tr>
            <tr><td>자막</td><td>{project.lines.length}줄 · 음성 없는 줄 {missingAudio}개</td></tr>
            <tr><td>장면</td><td>{project.scenes.length}개 · 그림 없는 장면 {missingImage}개</td></tr>
            <tr><td>자막 폰트</td><td>{project.caption.fontFamily}</td></tr>
          </tbody>
        </table>

        <button
          className="primary"
          style={{ marginTop: 12 }}
          disabled={Boolean(busy)}
          onClick={() =>
            run("내보내는 중…", async () => {
              setResult(
                await api<ExportResult>(`/api/projects/${project.id}/export`, { method: "POST" }),
              );
            })
          }
        >
          캡컷으로 내보내기
        </button>
      </div>

      {result && (
        <div className="notice ok">
          <div>
            <strong>내보낸 폴더</strong>
            <br />
            <code>{result.dir}</code>
          </div>
          {result.installedTo && (
            <div style={{ marginTop: 8 }}>
              캡컷 폴더에도 넣었습니다: <code>{result.installedTo}</code>
              <br />
              캡컷을 재시작하면 목록에 뜹니다.
            </div>
          )}
          {result.warnings.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {result.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
