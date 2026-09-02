"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import {
  ASPECTS,
  CUT_MODES,
  IMAGE_PROVIDERS,
  TTS_PROVIDERS,
  VIDEO_PROVIDERS,
  type Preset,
  type PresetInput,
} from "@/lib/types";

/** 프리셋에서 서버가 채우는 필드를 떼어내 편집용 값으로 만든다. */
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
  cutDurationSec: { min: 2, max: 4 },
  script: {
    language: "ko",
    persona: "",
    tone: "",
    charCount: { min: 300, max: 400 },
    structure: ["훅", "전개", "마무리"],
    avoid: [],
  },
  image: { provider: "manual", model: "", stylePrompt: "", negativePrompt: "" },
  video: {
    defaultMode: "image",
    provider: "manual",
    model: "",
    kenBurns: { enabled: true, scaleFrom: 1, scaleTo: 1.1 },
    transition: { type: "none", durationSec: 0.3 },
  },
  tts: { provider: "manual", voiceId: "", speed: 1, pitch: 0 },
  caption: { enabled: true, source: "onScreenText", fontSize: 12, position: "bottom" },
};

export default function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PresetInput>(BLANK);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setPresets(await api<Preset[]>("/api/presets"));
  }

  useEffect(() => {
    void reload().catch((err) => setError(String(err)));
  }, []);

  function edit(preset: Preset) {
    setEditingId(preset.id);
    setDraft(toInput(preset));
    setInfo("");
    setError("");
  }

  function duplicate(preset: Preset) {
    setEditingId(null);
    setDraft({ ...toInput(preset), name: `${preset.name} 복사본` });
    setInfo("복사본입니다. 저장하면 새 스타일로 추가됩니다.");
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

  /** 중첩 객체 한 겹을 갈아끼운다. */
  function patch<K extends keyof PresetInput>(key: K, value: Partial<PresetInput[K]>) {
    setDraft((current) => ({
      ...current,
      [key]: { ...(current[key] as object), ...value },
    }));
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
        스타일이 결과물의 핏을 잠급니다. 화면비·컷 길이·화풍·말투·자막이 전부 여기서 결정됩니다.
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
                      {preset.aspect} · {preset.targetDurationSec}초 · {preset.tts.provider}
                    </small>
                  </td>
                  <td style={{ width: 1, whiteSpace: "nowrap" }}>
                    <div className="row">
                      <button className="sm" onClick={() => edit(preset)}>수정</button>
                      <button className="sm" onClick={() => duplicate(preset)}>복제</button>
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
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
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
                onChange={(e) =>
                  setDraft({ ...draft, aspect: e.target.value as Preset["aspect"] })
                }
              >
                {ASPECTS.map((aspect) => (
                  <option key={aspect} value={aspect}>{aspect}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>fps</label>
              <input
                type="number"
                value={draft.fps}
                onChange={(e) => setDraft({ ...draft, fps: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>목표 길이(초)</label>
              <input
                type="number"
                value={draft.targetDurationSec}
                onChange={(e) =>
                  setDraft({ ...draft, targetDurationSec: Number(e.target.value) })
                }
              />
            </div>
            <div className="field">
              <label>컷 길이(초) 최소 / 최대</label>
              <div className="row">
                <input
                  type="number" step="0.5" style={{ width: 80 }}
                  value={draft.cutDurationSec.min}
                  onChange={(e) => patch("cutDurationSec", { min: Number(e.target.value) })}
                />
                <input
                  type="number" step="0.5" style={{ width: 80 }}
                  value={draft.cutDurationSec.max}
                  onChange={(e) => patch("cutDurationSec", { max: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>대본</h3>
          <div className="field">
            <label>화자</label>
            <input
              value={draft.script.persona}
              onChange={(e) => patch("script", { persona: e.target.value })}
            />
          </div>
          <div className="field">
            <label>말투</label>
            <textarea
              rows={2}
              value={draft.script.tone}
              onChange={(e) => patch("script", { tone: e.target.value })}
            />
          </div>
          <div className="field">
            <label>구성 뼈대 (쉼표로 구분)</label>
            <input
              value={draft.script.structure.join(", ")}
              onChange={(e) =>
                patch("script", {
                  structure: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>금지 사항 (쉼표로 구분)</label>
            <input
              value={draft.script.avoid.join(", ")}
              onChange={(e) =>
                patch("script", {
                  avoid: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>나레이션 글자수 최소 / 최대</label>
            <div className="row">
              <input
                type="number" style={{ width: 90 }}
                value={draft.script.charCount.min}
                onChange={(e) =>
                  patch("script", {
                    charCount: { ...draft.script.charCount, min: Number(e.target.value) },
                  })
                }
              />
              <input
                type="number" style={{ width: 90 }}
                value={draft.script.charCount.max}
                onChange={(e) =>
                  patch("script", {
                    charCount: { ...draft.script.charCount, max: Number(e.target.value) },
                  })
                }
              />
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>이미지</h3>
          <div className="grid two">
            <div className="field">
              <label>생성 서비스</label>
              <select
                value={draft.image.provider}
                onChange={(e) =>
                  patch("image", { provider: e.target.value as Preset["image"]["provider"] })
                }
              >
                {IMAGE_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>모델 (비우면 기본값)</label>
              <input
                value={draft.image.model}
                onChange={(e) => patch("image", { model: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>고정 화풍 프롬프트 — 모든 컷 뒤에 붙습니다</label>
            <textarea
              className="mono" rows={3}
              value={draft.image.stylePrompt}
              onChange={(e) => patch("image", { stylePrompt: e.target.value })}
            />
          </div>

          <h3 style={{ marginTop: 16 }}>영상</h3>
          <div className="grid two">
            <div className="field">
              <label>컷 기본 모드</label>
              <select
                value={draft.video.defaultMode}
                onChange={(e) =>
                  patch("video", { defaultMode: e.target.value as Preset["video"]["defaultMode"] })
                }
              >
                {CUT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "image" ? "이미지 + 줌" : "AI 영상"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>영상 생성 서비스</label>
              <select
                value={draft.video.provider}
                onChange={(e) =>
                  patch("video", { provider: e.target.value as Preset["video"]["provider"] })
                }
              >
                {VIDEO_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>음성</h3>
          <div className="grid two">
            <div className="field">
              <label>TTS 서비스</label>
              <select
                value={draft.tts.provider}
                onChange={(e) =>
                  patch("tts", { provider: e.target.value as Preset["tts"]["provider"] })
                }
              >
                {TTS_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="field">
              <label>voice id</label>
              <input
                value={draft.tts.voiceId}
                onChange={(e) => patch("tts", { voiceId: e.target.value })}
                placeholder="연결 상태 화면에서 목록을 볼 수 있습니다"
              />
            </div>
            <div className="field">
              <label>속도</label>
              <input
                type="number" step="0.01"
                value={draft.tts.speed}
                onChange={(e) => patch("tts", { speed: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>피치</label>
              <input
                type="number" step="0.5"
                value={draft.tts.pitch}
                onChange={(e) => patch("tts", { pitch: Number(e.target.value) })}
              />
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>자막</h3>
          <div className="grid two">
            <div className="field">
              <label>내용</label>
              <select
                value={draft.caption.source}
                onChange={(e) =>
                  patch("caption", { source: e.target.value as Preset["caption"]["source"] })
                }
              >
                <option value="onScreenText">짧은 화면 자막</option>
                <option value="narration">나레이션 전문</option>
              </select>
            </div>
            <div className="field">
              <label>위치</label>
              <select
                value={draft.caption.position}
                onChange={(e) =>
                  patch("caption", { position: e.target.value as Preset["caption"]["position"] })
                }
              >
                <option value="top">위</option>
                <option value="center">가운데</option>
                <option value="bottom">아래</option>
              </select>
            </div>
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
