"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { Preset } from "@/lib/types";

interface ProjectRow {
  id: string;
  topic: string;
  title: string | null;
  presetName: string;
  aspect: string;
  cutCount: number;
  status: string;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "기획 전",
  planned: "기획 완료",
  generating: "에셋 생성 중",
  ready: "내보내기 완료",
};

export default function Home() {
  const router = useRouter();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [topic, setTopic] = useState("");
  const [brief, setBrief] = useState("");
  const [presetId, setPresetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [loadedPresets, loadedProjects] = await Promise.all([
          api<Preset[]>("/api/presets"),
          api<ProjectRow[]>("/api/projects"),
        ]);
        setPresets(loadedPresets);
        setProjects(loadedProjects);
        setPresetId((current) => current || loadedPresets[0]?.id || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const project = await api<{ id: string }>("/api/projects", {
        json: { topic, brief, presetId },
      });
      router.push(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const selected = presets.find((p) => p.id === presetId);

  return (
    <>
      <section className="card">
        <h3>새 영상</h3>
        <div className="field">
          <label htmlFor="topic">주제</label>
          <input
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 쿠팡 파트너스 수익이 갑자기 떨어지는 3가지 이유"
          />
        </div>

        <div className="field">
          <label htmlFor="preset">스타일</label>
          <select
            id="preset"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} · {preset.aspect} · {preset.targetDurationSec}초
              </option>
            ))}
          </select>
          {selected && <small>{selected.description}</small>}
        </div>

        <div className="field">
          <label htmlFor="brief">추가 지시사항 (선택)</label>
          <textarea
            id="brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="이번 영상에만 적용할 내용. 예: 초보자 기준으로, 숫자는 2025년 기준으로."
          />
        </div>

        <div className="row">
          <button
            className="primary"
            onClick={create}
            disabled={busy || !topic.trim() || !presetId}
          >
            {busy && <span className="spinner" />}
            만들기
          </button>
          <Link href="/presets">
            <small>스타일을 새로 만들거나 고치기 →</small>
          </Link>
        </div>

        {error && <div className="notice error">{error}</div>}
      </section>

      <h2>내 프로젝트</h2>
      {projects.length === 0 ? (
        <p className="dim">아직 없습니다. 위에서 주제와 스타일을 고르고 시작하세요.</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>스타일</th>
                <th>컷</th>
                <th>상태</th>
                <th>수정</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link href={`/project/${project.id}`}>
                      {project.title ?? project.topic}
                    </Link>
                  </td>
                  <td className="dim">
                    {project.presetName} · {project.aspect}
                  </td>
                  <td className="dim">{project.cutCount}</td>
                  <td>
                    <span className="pill">
                      {STATUS_LABEL[project.status] ?? project.status}
                    </span>
                  </td>
                  <td className="dim">
                    {new Date(project.updatedAt).toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
