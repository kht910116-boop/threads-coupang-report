"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { ART_STYLES, artStyleOf } from "@/lib/presets/art-styles";
import {
  ASPECTS,
  CUT_MODES,
  IMAGE_PROVIDERS,
  SCENE_EFFECTS,
  EFFECT_LABEL,
  TTS_PROVIDERS,
  VIDEO_PROVIDERS,
  type Preset,
  type PresetInput,
} from "@/lib/types";

/** 화면비를 고를 때 그게 무슨 뜻인지 옆에 적어준다. */
const ASPECT_HINT: Record<string, string> = {
  "16:9": "가로 — 유튜브 일반 영상",
  "9:16": "세로 — 쇼츠·릴스",
  "1:1": "정사각 — 피드용",
};

/** 초를 사람이 읽는 길이로. 1620을 보고 27분을 떠올리는 사람은 없다. */
function fmtLen(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

function toInput(preset: Preset): PresetInput {
  const { id, createdAt, updatedAt, builtin, ...input } = preset;
  return input;
}

const BLANK: PresetInput = {
  name: "새 스타일",
  description: "",
  aspect: "9:16",
  fps: 30,
  targetDurationSec: 60,
  script: {
    language: "ko",
    persona: "",
    tone: "",
    partCount: 3,
    charsPerLine: { min: 12, max: 24 },
    avoid: [],
  },
  intervals: {
    hookIntro: { min: 4, max: 8 },
    part: { min: 8, max: 16 },
    closing: { min: 8, max: 16 },
  },
  image: { provider: "manual", model: "", prefix: "", suffix: "", negativePrompt: "" },
  video: { defaultMode: "image", provider: "manual", model: "" },
  tts: {
    provider: "manual", model: "", voiceId: "", speed: 1, pitch: 0,
    leadSilenceMs: 300, tailSilenceMs: 500, gapMs: 180, sectionGapMs: 450,
  },
  caption: {
    enabled: true, fontFamily: "Pretendard", fontSize: 12,
    color: "#FFFFFF", strokeColor: "#000000", strokeWidth: 0.08,
    position: "bottom", marginRatio: 0.12, maxCharsPerLine: 20,
  },
  effects: {
    defaultEffect: "fade", transitionSec: 0.4,
    kenBurns: { enabled: true, scaleFrom: 1, scaleTo: 1.1 },
    rotate: true, rotation: ["fade", "dissolve", "zoomIn", "zoomOut"],
  },
};

export default function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PresetInput>(BLANK);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => setPresets(await api<Preset[]>("/api/presets"));

  useEffect(() => {
    void reload().catch((err) => setError(String(err)));
  }, []);

  const picked = artStyleOf(draft.image.prefix);

  function patch<K extends keyof PresetInput>(key: K, value: Partial<PresetInput[K]>) {
    setDraft((current) => ({
      ...current,
      [key]: { ...(current[key] as object), ...value },
    }));
  }

  async function save() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (editingId) {
        await api(`/api/presets/${editingId}`, { method: "PUT", json: draft });
        setInfo("저장했습니다.");
      } else {
        const created = await api<Preset>("/api/presets", { json: draft });
        setEditingId(created.id);
        setInfo("새 스타일을 만들었습니다.");
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(preset: Preset) {
    if (!confirm(`'${preset.name}'을(를) 지울까요?`)) return;
    try {
      await api(`/api/presets/${preset.id}`, { method: "DELETE" });
      if (editingId === preset.id) {
        setEditingId(null);
        setDraft(BLANK);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="spread">
        <h2 style={{ margin: 0 }}>스타일 프리셋</h2>
        <button
          onClick={() => {
            setEditingId(null);
            setDraft(BLANK);
            setInfo("");
          }}
        >
          새로 만들기
        </button>
      </div>
      <p className="dim">
        스타일은 <strong>그림체와 말투</strong>를 정합니다. 같은 주제를 넣어도 스타일마다 다른
        영상이 나오게 하는 값입니다. 장면 간격·자막 모양·무음 같은 수치는 그 값을 쓰는 단계
        화면에서 바꾸는 편이 빠릅니다.
      </p>

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <tbody>
              {presets.map((preset) => (
                <tr key={preset.id}>
                  <td>
                    <strong>{preset.name}</strong>
                    {preset.builtin && <span className="pill" style={{ marginLeft: 6 }}>기본</span>}
                    <br />
                    <small>
                      {preset.aspect} · {preset.targetDurationSec}초 · 파트{" "}
                      {preset.script.partCount}개 · {preset.tts.provider}
                    </small>
                  </td>
                  <td style={{ width: 1, whiteSpace: "nowrap" }}>
                    <div className="row">
                      <button
                        className="sm"
                        onClick={() => {
                          setEditingId(preset.id);
                          setDraft(toInput(preset));
                          setInfo("");
                          setError("");
                        }}
                      >
                        수정
                      </button>
                      <button
                        className="sm"
                        onClick={() => {
                          setEditingId(null);
                          setDraft({ ...toInput(preset), name: `${preset.name} 복사본` });
                          setInfo("복사본입니다. 저장하면 새 스타일로 추가됩니다.");
                        }}
                      >
                        복제
                      </button>
                      {!preset.builtin && (
                        <button className="sm danger" onClick={() => void remove(preset)}>
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>{editingId ? "수정 중" : "새 스타일"}</h3>

          <div className="field">
            <label>이름</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="field">
            <label>설명</label>
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className="seg-field">
            <div className="seg-label">
              <span>화면비</span>
              <span className="seg-hint">{ASPECT_HINT[draft.aspect] ?? ""}</span>
            </div>
            <div className="seg">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  className={draft.aspect === a ? "on" : ""}
                  onClick={() => setDraft({ ...draft, aspect: a })}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>목표 길이 — {fmtLen(draft.targetDurationSec)}</label>
            <input type="number" value={draft.targetDurationSec}
              onChange={(e) => setDraft({ ...draft, targetDurationSec: Number(e.target.value) })} />
          </div>

          {/*
            화풍은 영문 프롬프트 한 덩어리다. 빈 칸에 직접 쓰라고 하면 아무도 못 쓴다.
            카드로 깔아 고르게 하고, 고른 뒤에 고치고 싶으면 고급에서 열면 된다.
          */}
          <div className="seg-field">
            <div className="seg-label">
              <span>그림체</span>
              <span className="seg-hint">{picked ? picked.note : "직접 쓴 화풍"}</span>
            </div>
            <div className="art-grid">
              {ART_STYLES.map((style) => (
                <button
                  key={style.id}
                  className={`art ${picked?.id === style.id ? "on" : ""}`}
                  onClick={() => patch("image", { prefix: style.prompt })}
                  title={style.prompt}
                >
                  <strong>{style.name}</strong>
                  <span>{style.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>화자 — 누가 말하는지</label>
            <input value={draft.script.persona}
              onChange={(e) => patch("script", { persona: e.target.value })} />
          </div>
          <div className="field">
            <label>말투 — 어떻게 말하는지</label>
            <textarea rows={2} value={draft.script.tone}
              onChange={(e) => patch("script", { tone: e.target.value })} />
          </div>

          {/*
            나머지는 대부분 프리셋이 이미 정해둔 값이고, 고칠 일이 있으면 그 값을 쓰는
            단계 화면에서 고치는 편이 낫다. 여기서는 접어둔다.
          */}
          <details className="adv">
            <summary>고급 설정 — 장면 간격 · 이미지 · 영상 · 음성 · 자막 · 효과</summary>

          <h3 style={{ marginTop: 16 }}>장면 간격 (초)</h3>
          <p className="dim" style={{ marginTop: 0 }}>
            자막 줄을 이 길이에 맞게 묶어 장면을 만듭니다.
          </p>
          {(
            [
              ["hookIntro", "훅+인트로"],
              ["part", "파트"],
              ["closing", "클로징"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <div className="row">
                <input type="number" step="0.5" style={{ width: 90 }}
                  value={draft.intervals[key].min}
                  onChange={(e) =>
                    patch("intervals", {
                      [key]: { ...draft.intervals[key], min: Number(e.target.value) },
                    } as Partial<PresetInput["intervals"]>)
                  } />
                <span className="dim">~</span>
                <input type="number" step="0.5" style={{ width: 90 }}
                  value={draft.intervals[key].max}
                  onChange={(e) =>
                    patch("intervals", {
                      [key]: { ...draft.intervals[key], max: Number(e.target.value) },
                    } as Partial<PresetInput["intervals"]>)
                  } />
                <span className="dim">초</span>
              </div>
            </div>
          ))}

          <h3 style={{ marginTop: 16 }}>대본</h3>
          <div className="grid two">
            <div className="field">
              <label>파트 개수</label>
              <input type="number" value={draft.script.partCount}
                onChange={(e) => patch("script", { partCount: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>fps</label>
              <input type="number" value={draft.fps}
                onChange={(e) => setDraft({ ...draft, fps: Number(e.target.value) })} />
            </div>
          </div>
          <div className="field">
            <label>자막 한 줄 글자수 (최소 / 최대)</label>
            <div className="row">
              <input type="number" style={{ width: 90 }} value={draft.script.charsPerLine.min}
                onChange={(e) =>
                  patch("script", {
                    charsPerLine: { ...draft.script.charsPerLine, min: Number(e.target.value) },
                  })} />
              <input type="number" style={{ width: 90 }} value={draft.script.charsPerLine.max}
                onChange={(e) =>
                  patch("script", {
                    charsPerLine: { ...draft.script.charsPerLine, max: Number(e.target.value) },
                  })} />
            </div>
          </div>
          <div className="field">
            <label>금지 사항 (쉼표로 구분)</label>
            <input value={draft.script.avoid.join(", ")}
              onChange={(e) =>
                patch("script", {
                  avoid: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })} />
          </div>

          <h3 style={{ marginTop: 16 }}>이미지 화풍</h3>
          <div className="grid two">
            <div className="field">
              <label>생성 서비스</label>
              <select value={draft.image.provider}
                onChange={(e) => patch("image", { provider: e.target.value as Preset["image"]["provider"] })}>
                {IMAGE_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>모델 (비우면 기본값)</label>
              <input value={draft.image.model}
                onChange={(e) => patch("image", { model: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>화풍 접두부 — 모든 장면 프롬프트 앞에 붙습니다</label>
            <textarea className="mono" rows={4} value={draft.image.prefix}
              onChange={(e) => patch("image", { prefix: e.target.value })} />
          </div>
          <div className="field">
            <label>접미부 — 모든 장면 프롬프트 뒤에 붙습니다</label>
            <textarea className="mono" rows={2} value={draft.image.suffix}
              onChange={(e) => patch("image", { suffix: e.target.value })} />
          </div>

          <h3 style={{ marginTop: 16 }}>영상</h3>
          <div className="grid two">
            <div className="field">
              <label>장면 기본 모드</label>
              <select value={draft.video.defaultMode}
                onChange={(e) => patch("video", { defaultMode: e.target.value as Preset["video"]["defaultMode"] })}>
                {CUT_MODES.map((m) => (
                  <option key={m} value={m}>{m === "image" ? "이미지 + 줌" : "AI 영상"}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>영상 생성 서비스</label>
              <select value={draft.video.provider}
                onChange={(e) => patch("video", { provider: e.target.value as Preset["video"]["provider"] })}>
                {VIDEO_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>음성</h3>
          <div className="grid two">
            <div className="field">
              <label>TTS 서비스</label>
              <select value={draft.tts.provider}
                onChange={(e) => patch("tts", { provider: e.target.value as Preset["tts"]["provider"] })}>
                {TTS_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>세부 모델</label>
              <input value={draft.tts.model} placeholder="비우면 기본값"
                onChange={(e) => patch("tts", { model: e.target.value })} />
            </div>
            <div className="field">
              <label>voice id</label>
              <input value={draft.tts.voiceId}
                onChange={(e) => patch("tts", { voiceId: e.target.value })} />
            </div>
            <div className="field">
              <label>속도</label>
              <input type="number" step="0.01" value={draft.tts.speed}
                onChange={(e) => patch("tts", { speed: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid two">
            {(
              [
                ["leadSilenceMs", "앞 무음(ms)"],
                ["tailSilenceMs", "뒤 무음(ms)"],
                ["gapMs", "줄 사이(ms)"],
                ["sectionGapMs", "파트 사이(ms)"],
              ] as const
            ).map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input type="number" value={draft.tts[key]}
                  onChange={(e) => patch("tts", { [key]: Number(e.target.value) })} />
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 16 }}>자막</h3>
          <div className="grid two">
            <div className="field">
              <label>폰트 (미리캔버스·캔바 폰트 이름 그대로)</label>
              <input value={draft.caption.fontFamily}
                onChange={(e) => patch("caption", { fontFamily: e.target.value })} />
            </div>
            <div className="field">
              <label>크기</label>
              <input type="number" value={draft.caption.fontSize}
                onChange={(e) => patch("caption", { fontSize: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>위치</label>
              <select value={draft.caption.position}
                onChange={(e) => patch("caption", { position: e.target.value as Preset["caption"]["position"] })}>
                <option value="top">위</option>
                <option value="center">가운데</option>
                <option value="bottom">아래</option>
              </select>
            </div>
            <div className="field">
              <label>한 줄 최대 글자수</label>
              <input type="number" value={draft.caption.maxCharsPerLine}
                onChange={(e) => patch("caption", { maxCharsPerLine: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>글자색</label>
              <input value={draft.caption.color}
                onChange={(e) => patch("caption", { color: e.target.value })} />
            </div>
            <div className="field">
              <label>테두리색</label>
              <input value={draft.caption.strokeColor}
                onChange={(e) => patch("caption", { strokeColor: e.target.value })} />
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>효과</h3>
          <div className="grid two">
            <div className="field">
              <label>기본 효과</label>
              <select value={draft.effects.defaultEffect}
                onChange={(e) => patch("effects", { defaultEffect: e.target.value as Preset["effects"]["defaultEffect"] })}>
                {SCENE_EFFECTS.map((e) => <option key={e} value={e}>{EFFECT_LABEL[e]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>전환 길이(초)</label>
              <input type="number" step="0.05" value={draft.effects.transitionSec}
                onChange={(e) => patch("effects", { transitionSec: Number(e.target.value) })} />
            </div>
          </div>
          <div className="field">
            <label>돌려쓸 효과 순서 (쉼표로 구분)</label>
            <input className="mono" value={draft.effects.rotation.join(", ")}
              onChange={(e) =>
                patch("effects", {
                  rotation: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s): s is Preset["effects"]["defaultEffect"] =>
                      (SCENE_EFFECTS as readonly string[]).includes(s)),
                })} />
            <small>쓸 수 있는 값: {SCENE_EFFECTS.join(", ")}</small>
          </div>

          </details>

          {error && <div className="notice error">{error}</div>}
          {info && <div className="notice ok">{info}</div>}

          <button className="primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner" />}
            {editingId ? "저장" : "만들기"}
          </button>
        </div>
      </div>
    </>
  );
}
