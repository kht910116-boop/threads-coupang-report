"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
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
        스타일이 결과물의 핏을 잠급니다. 화면비·장면 간격·화풍·말투·자막·효과가 전부 여기서
        결정됩니다.
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

          <div className="grid two">
            <div className="field">
              <label>화면비</label>
              <select
                value={draft.aspect}
                onChange={(e) => setDraft({ ...draft, aspect: e.target.value as Preset["aspect"] })}
              >
                {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="field">
              <label>fps</label>
              <input type="number" value={draft.fps}
                onChange={(e) => setDraft({ ...draft, fps: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>목표 길이(초)</label>
              <input type="number" value={draft.targetDurationSec}
                onChange={(e) => setDraft({ ...draft, targetDurationSec: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>파트 개수</label>
              <input type="number" value={draft.script.partCount}
                onChange={(e) => patch("script", { partCount: Number(e.target.value) })} />
            </div>
          </div>

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
          <div className="field">
            <label>화자</label>
            <input value={draft.script.persona}
              onChange={(e) => patch("script", { persona: e.target.value })} />
          </div>
          <div className="field">
            <label>말투</label>
            <textarea rows={2} value={draft.script.tone}
              onChange={(e) => patch("script", { tone: e.target.value })} />
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
