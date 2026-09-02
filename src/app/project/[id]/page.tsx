"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { api, assetUrl } from "@/lib/api-client";
import type { Cut, Project } from "@/lib/types";

type Kind = "image" | "video" | "audio";

interface GenerateResult {
  generated: number;
  failed: Array<{ cut: number; error: string }>;
  project?: Project;
  message?: string;
}

interface ExportResult {
  dir: string;
  files: string[];
  warnings: string[];
  installedTo: string | null;
}

const thumbClass = (aspect: string) =>
  aspect === "16:9" ? "thumb wide" : aspect === "1:1" ? "thumb square" : "thumb";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [exported, setExported] = useState<ExportResult | null>(null);

  const load = useCallback(async () => {
    try {
      setProject(await api<Project>(`/api/projects/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const makePlan = () =>
    run("기획 생성 중… (1~3분 걸립니다)", async () => {
      setProject(await api<Project>(`/api/projects/${id}/plan`, { method: "POST" }));
      setInfo("기획이 나왔습니다. 컷을 확인하고 손보세요.");
    });

  const generate = (kind: Kind) =>
    run(`${kind === "image" ? "이미지" : kind === "video" ? "영상" : "음성"} 생성 중…`, async () => {
      const result = await api<GenerateResult>(`/api/projects/${id}/generate`, {
        json: { kind },
      });
      if (result.project) setProject(result.project);
      const failures = result.failed
        .map((f) => `${f.cut}번: ${f.error}`)
        .join("\n");
      if (failures) setError(failures);
      setInfo(result.message ?? `${result.generated}개 생성했습니다.`);
    });

  const doExport = () =>
    run("내보내는 중…", async () => {
      const result = await api<ExportResult>(`/api/projects/${id}/export`, {
        method: "POST",
      });
      setExported(result);
      setInfo("내보내기가 끝났습니다.");
    });

  const patchCut = useCallback(
    async (cutId: string, patch: Partial<Cut>) => {
      const updated = await api<Project>(`/api/projects/${id}`, {
        method: "PATCH",
        json: { cuts: [{ id: cutId, ...patch }] },
      });
      setProject(updated);
    },
    [id],
  );

  if (!project) {
    return error ? <div className="notice error">{error}</div> : <p className="dim">불러오는 중…</p>;
  }

  const { preset, plan, cuts } = project;
  const totalSec = cuts.reduce((sum, cut) => sum + cut.durationSec, 0);
  const counts = {
    image: cuts.filter((c) => c.image).length,
    video: cuts.filter((c) => c.video).length,
    audio: cuts.filter((c) => c.audio).length,
  };

  return (
    <>
      <section className="card">
        <div className="spread">
          <div>
            <h3 style={{ fontSize: 16 }}>{plan?.title ?? project.topic}</h3>
            <small>
              {preset.name} · {preset.aspect} · {preset.fps}fps · 목표{" "}
              {preset.targetDurationSec}초
              {cuts.length > 0 && ` · 현재 ${cuts.length}컷 / ${totalSec.toFixed(1)}초`}
            </small>
          </div>
          <button className="primary" onClick={makePlan} disabled={Boolean(busy)}>
            {plan ? "기획 다시 만들기" : "기획 만들기"}
          </button>
        </div>

        {busy && (
          <div className="notice">
            <span className="spinner" />
            {busy}
          </div>
        )}
        {error && <div className="notice error" style={{ whiteSpace: "pre-wrap" }}>{error}</div>}
        {info && <div className="notice ok">{info}</div>}
      </section>

      {plan && (
        <>
          <h2>기획</h2>
          <div className="card grid two">
            <div>
              <label>훅 (첫 2초)</label>
              <p style={{ margin: "0 0 12px" }}>{plan.hook}</p>
              <label>한 줄 요약</label>
              <p style={{ margin: "0 0 12px" }}>{plan.summary}</p>
              <label>해시태그</label>
              <p className="dim" style={{ margin: 0 }}>
                {plan.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            </div>
            <div>
              <label>설명란</label>
              <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap" }}>
                {plan.description}
              </p>
              <label>썸네일 프롬프트</label>
              <p className="mono" style={{ margin: 0 }}>{plan.thumbnailPrompt}</p>
            </div>
          </div>

          <h2>에셋 생성</h2>
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <button onClick={() => generate("image")} disabled={Boolean(busy)}>
                이미지 만들기 ({counts.image}/{cuts.filter((c) => c.mode === "image").length})
              </button>
              <button onClick={() => generate("video")} disabled={Boolean(busy)}>
                영상 만들기 ({counts.video}/{cuts.filter((c) => c.mode === "video").length})
              </button>
              <button onClick={() => generate("audio")} disabled={Boolean(busy)}>
                음성 만들기 ({counts.audio}/{cuts.length})
              </button>
              <button className="primary" onClick={doExport} disabled={Boolean(busy)}>
                캡컷으로 내보내기
              </button>
            </div>
            <small>
              이미지 {preset.image.provider} · 영상 {preset.video.provider} · 음성{" "}
              {preset.tts.provider}
              {" — "}바꾸려면 스타일 프리셋에서 고치세요. &lsquo;직접 넣기&rsquo;로 두면 컷마다 파일을 올리면 됩니다.
            </small>
          </div>

          {exported && (
            <div className="notice ok">
              <div>
                <strong>내보낸 폴더</strong>
                <br />
                <code>{exported.dir}</code>
              </div>
              {exported.installedTo && (
                <div style={{ marginTop: 8 }}>
                  캡컷 폴더에도 넣었습니다: <code>{exported.installedTo}</code>
                  <br />
                  캡컷을 재시작하면 목록에 뜹니다.
                </div>
              )}
              {exported.warnings.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {exported.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h2>컷 {cuts.length}개</h2>
          <div className="card">
            {cuts.map((cut) => (
              <CutRow
                key={cut.id}
                cut={cut}
                aspect={preset.aspect}
                projectId={id}
                onPatch={patchCut}
                onUploaded={setProject}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function CutRow({
  cut,
  aspect,
  projectId,
  onPatch,
  onUploaded,
}: {
  cut: Cut;
  aspect: string;
  projectId: string;
  onPatch: (cutId: string, patch: Partial<Cut>) => Promise<void>;
  onUploaded: (project: Project) => void;
}) {
  const [narration, setNarration] = useState(cut.narration);
  const [onScreenText, setOnScreenText] = useState(cut.onScreenText);
  const [imagePrompt, setImagePrompt] = useState(cut.imagePrompt);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<Kind>("image");

  // 서버에서 컷이 새로 오면(재생성 등) 입력창도 따라간다.
  useEffect(() => {
    setNarration(cut.narration);
    setOnScreenText(cut.onScreenText);
    setImagePrompt(cut.imagePrompt);
  }, [cut.narration, cut.onScreenText, cut.imagePrompt]);

  const dirty =
    narration !== cut.narration ||
    onScreenText !== cut.onScreenText ||
    imagePrompt !== cut.imagePrompt;

  async function save() {
    setSaving(true);
    try {
      await onPatch(cut.id, { narration, onScreenText, imagePrompt });
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    const form = new FormData();
    form.append("cutId", cut.id);
    form.append("kind", uploadKind);
    form.append("file", file);
    const updated = await api<Project>(`/api/projects/${projectId}/upload`, {
      method: "POST",
      body: form,
    });
    onUploaded(updated);
  }

  const visual = cut.mode === "video" ? cut.video : cut.image;

  return (
    <div className="cut">
      <div>
        <div className={thumbClass(aspect)}>
          {cut.mode === "video" && cut.video ? (
            <video src={assetUrl(cut.video.path)} controls preload="metadata" />
          ) : cut.image ? (
            // 로컬 파일이라 next/image 최적화가 의미 없다.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(cut.image.path)} alt={cut.imageDescription} />
          ) : (
            <span>{visual ? "" : "아직 없음"}</span>
          )}
        </div>
        {cut.audio && <audio src={assetUrl(cut.audio.path)} controls preload="none" />}

        <div className="row" style={{ marginTop: 8 }}>
          <select
            value={uploadKind}
            onChange={(e) => setUploadKind(e.target.value as Kind)}
            style={{ width: 78, padding: "3px 6px", fontSize: 12 }}
          >
            <option value="image">이미지</option>
            <option value="video">영상</option>
            <option value="audio">음성</option>
          </select>
          <button className="sm" onClick={() => fileInput.current?.click()}>
            올리기
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div>
        <div className="meta">
          <span className="num">{cut.index + 1}</span>
          <span className="pill">{cut.section}</span>
          <span className="pill">{cut.durationSec.toFixed(1)}초</span>
          <select
            value={cut.mode}
            onChange={(e) => void onPatch(cut.id, { mode: e.target.value as Cut["mode"] })}
            style={{ width: 96, padding: "2px 6px", fontSize: 12 }}
          >
            <option value="image">이미지</option>
            <option value="video">AI 영상</option>
          </select>
          <label style={{ margin: 0, display: "flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={cut.locked}
              onChange={(e) => void onPatch(cut.id, { locked: e.target.checked })}
              style={{ width: "auto" }}
            />
            잠금
          </label>
          {dirty && (
            <button className="sm primary" onClick={save} disabled={saving}>
              저장
            </button>
          )}
        </div>

        <div className="field">
          <label>나레이션</label>
          <textarea
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid two">
          <div className="field">
            <label>화면 자막</label>
            <input
              value={onScreenText}
              onChange={(e) => setOnScreenText(e.target.value)}
            />
          </div>
          <div className="field">
            <label>이미지 설명</label>
            <p className="dim" style={{ margin: 0, fontSize: 13 }}>
              {cut.imageDescription}
            </p>
          </div>
        </div>

        <div className="field">
          <label>이미지 프롬프트</label>
          <textarea
            className="mono"
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            rows={2}
          />
        </div>

        {cut.mode === "video" && (
          <div className="field">
            <label>모션 프롬프트</label>
            <p className="mono dim" style={{ margin: 0 }}>{cut.motionPrompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}
