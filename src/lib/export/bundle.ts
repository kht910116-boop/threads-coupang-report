import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, exportsDir, resolveAsset } from "@/lib/paths";
import { slugify } from "@/lib/id";
import { composeImagePrompt, sectionLabel } from "@/lib/engine/prompt";
import { buildTimeline } from "@/lib/pipeline/timeline";
import { EFFECT_LABEL, type Project } from "@/lib/types";
import { buildCapCutDraft, MANUAL_EFFECTS } from "./capcut";

/**
 * 내보내기 번들.
 *
 * 캡컷 드래프트가 안 열려도 작업이 멈추지 않게 범용 산출물을 항상 같이 낸다.
 *
 *   <제목>/
 *     capcut/         캡컷 드래프트 폴더
 *     assets/         씬·라인 순서대로 번호 붙인 이미지·영상·음성
 *     subtitles.srt   타이밍 맞는 자막
 *     storyboard.csv  씬별 시각·길이·한글요약·프롬프트 (첨부 스토리보드와 같은 구성)
 *     script.md       대본 + 스토리보드 + 효과 지시
 *     project.json    원본 데이터
 *     README.txt      쓰는 법
 */

function srtTime(totalSeconds: number): string {
  const ms = Math.round(totalSeconds * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor((ms % 3_600_000) / 60_000))}:${pad(
    Math.floor((ms % 60_000) / 1000),
  )},${pad(ms % 1000, 3)}`;
}

const csvCell = (value: string | number): string =>
  `"${String(value).replace(/"/g, '""')}"`;

export interface ExportResult {
  dir: string;
  files: string[];
  warnings: string[];
}

export async function exportProject(project: Project): Promise<ExportResult> {
  const warnings: string[] = [];
  const files: string[] = [];
  const timeline = buildTimeline(project);

  const folderName = slugify(project.title || project.topic, project.id);
  const root = path.join(exportsDir(project.id), folderName);
  const assetsOut = path.join(root, "assets");
  const capcutOut = path.join(root, "capcut");
  await ensureDir(assetsOut);
  await ensureDir(capcutOut);

  // ── 에셋 복사 ──
  // 원본 파일명은 UUID라 순서를 알 수 없다. 편집기에서 바로 쓰려면 번호가 필요하다.
  const copied = new Map<string, string>();
  const copy = async (relative: string, name: string) => {
    const target = path.join(assetsOut, `${name}${path.extname(relative)}`);
    try {
      await fs.copyFile(resolveAsset(relative), target);
      copied.set(relative, target);
      files.push(path.relative(root, target));
    } catch {
      warnings.push(`파일을 찾지 못했습니다: ${relative}`);
    }
  };

  for (const scene of [...project.scenes].sort((a, b) => a.index - b.index)) {
    const num = String(scene.index + 1).padStart(3, "0");
    if (scene.image) await copy(scene.image.path, `scene-${num}-img`);
    if (scene.video) await copy(scene.video.path, `scene-${num}-vid`);
  }
  for (const line of [...project.lines].sort((a, b) => a.index - b.index)) {
    if (line.audio) {
      await copy(line.audio.path, `line-${String(line.index + 1).padStart(3, "0")}-aud`);
    }
  }

  // 영상으로 표시한 장면도 영상이 아직 없으면 컷 이미지로 나간다(capcut.ts가 그렇게
  // 고른다). 그러니 '빠지는 장면'은 이미지도 영상도 없는 것뿐이다.
  const missingVisual = project.scenes.filter((s) => !s.image && !s.video).length;
  if (missingVisual > 0) {
    warnings.push(`${missingVisual}개 장면에 이미지/영상이 없어 타임라인에서 빠집니다.`);
  }
  const missingAudio = project.lines.filter((l) => !l.audio).length;
  if (missingAudio > 0) {
    warnings.push(
      `${missingAudio}개 자막 줄에 음성이 없습니다. 길이는 글자수 추정치로 계산했습니다.`,
    );
  }

  // ── 캡컷 드래프트 ──
  const draft = buildCapCutDraft(
    project,
    (relative) => copied.get(relative) ?? resolveAsset(relative),
    capcutOut,
  );
  await fs.writeFile(
    path.join(capcutOut, "draft_content.json"),
    JSON.stringify(draft.content),
    "utf8",
  );
  await fs.writeFile(
    path.join(capcutOut, "draft_meta_info.json"),
    JSON.stringify(draft.meta),
    "utf8",
  );
  files.push("capcut/draft_content.json", "capcut/draft_meta_info.json");

  if (draft.manualEffects.length > 0) {
    warnings.push(
      `키프레임으로 못 거는 효과가 ${draft.manualEffects.length}개 있습니다 ` +
        `(${draft.manualEffects.map((e) => `${e.scene}번 ${EFFECT_LABEL[e.effect]}`).join(", ")}). ` +
        `캡컷에서 직접 걸어주세요 — script.md에 목록이 있습니다.`,
    );
  }

  // ── 자막 ──
  const srt = timeline.lines
    .map(
      (line, i) =>
        `${i + 1}\n${srtTime(line.startSec)} --> ${srtTime(line.endSec)}\n${line.text}\n`,
    )
    .join("\n");

  // ── 스토리보드 CSV ── 첨부 파일과 같은 구성 + 타임라인 정보
  const sectionById = new Map(project.sections.map((s) => [s.id, s]));
  const sceneTimingById = new Map(timeline.scenes.map((s) => [s.sceneId, s]));
  const lineByIndex = new Map(project.lines.map((l) => [l.index, l]));

  const csvHeader = [
    "씬번호", "파트", "시작(초)", "길이(초)", "자막범위", "모드", "효과",
    "한글요약", "프롬프트", "모션프롬프트", "나레이션", "이미지파일", "영상파일",
  ];
  const csvRows = [...project.scenes]
    .sort((a, b) => a.index - b.index)
    .map((scene) => {
      const timing = sceneTimingById.get(scene.id);
      const section = sectionById.get(scene.sectionId);
      const narration: string[] = [];
      for (let i = scene.lineFrom; i <= scene.lineTo; i += 1) {
        const line = lineByIndex.get(i);
        if (line) narration.push(line.text);
      }
      return [
        scene.index + 1,
        section ? sectionLabel(section) : "",
        (timing?.startSec ?? 0).toFixed(2),
        (timing?.durationSec ?? scene.durationSec).toFixed(2),
        `${scene.lineFrom + 1}~${scene.lineTo + 1}`,
        scene.mode === "video" ? "영상" : "이미지",
        EFFECT_LABEL[scene.effect],
        scene.summaryKo,
        composeImagePrompt(scene.prompt, project.image),
        scene.motionPrompt,
        narration.join(" "),
        scene.image ? path.basename(scene.image.path) : "",
        scene.video ? path.basename(scene.video.path) : "",
      ]
        .map(csvCell)
        .join(",");
    });
  // BOM을 붙여야 엑셀이 한글을 UTF-8로 읽는다.
  const csv = `﻿${csvHeader.map(csvCell).join(",")}\n${csvRows.join("\n")}\n`;

  const plain: Array<[string, string]> = [
    ["subtitles.srt", srt],
    ["storyboard.csv", csv],
    ["script.md", buildScriptMarkdown(project, timeline, draft.manualEffects)],
    ["project.json", JSON.stringify(project, null, 2)],
    ["README.txt", readmeText(folderName, project)],
  ];
  for (const [name, body] of plain) {
    // root는 data/exports 아래의 런타임 경로다. 번들러가 이걸 모듈 경로로 오해하면
    // 프로젝트 전체를 추적해 standalone 출력에 소스를 통째로 넣는다. 그래서 추적에서 뺀다.
    await fs.writeFile(path.join(/*turbopackIgnore: true*/ root, name), body, "utf8");
    files.push(name);
  }

  return { dir: root, files, warnings };
}

function buildScriptMarkdown(
  project: Project,
  timeline: ReturnType<typeof buildTimeline>,
  manualEffects: Array<{ scene: number; effect: Project["scenes"][number]["effect"] }>,
): string {
  const lines: string[] = [];
  const sectionById = new Map(project.sections.map((s) => [s.id, s]));
  const sceneTimingById = new Map(timeline.scenes.map((s) => [s.sceneId, s]));
  const lineByIndex = new Map(project.lines.map((l) => [l.index, l]));

  lines.push(`# ${project.title || project.topic}`, "");
  lines.push(`- 스타일: **${project.preset.name}** (${project.preset.aspect}, ${project.preset.fps}fps)`);
  lines.push(`- 길이: ${timeline.totalSec.toFixed(1)}초 (목표 ${project.preset.targetDurationSec}초)`);
  lines.push(`- 자막 ${project.lines.length}줄 / 장면 ${project.scenes.length}개`);
  if (project.references.length > 0) {
    lines.push("", "**레퍼런스**", ...project.references.map((r) => `- ${r.url}`));
  }
  lines.push("", `**요약** ${project.summary}`, "");
  lines.push("**설명란**", "", project.description, "");
  lines.push(`**해시태그** ${project.hashtags.map((t) => `#${t}`).join(" ")}`, "");
  lines.push(`**썸네일 프롬프트** \`${project.thumbnailPrompt}\``, "");

  if (manualEffects.length > 0) {
    lines.push(
      "## 캡컷에서 직접 걸 효과",
      "",
      "아래는 키프레임으로 표현할 수 없어 드래프트에 안 들어갔습니다. 캡컷에서 직접 걸어주세요.",
      "",
      ...manualEffects.map((e) => `- ${e.scene}번 장면: **${EFFECT_LABEL[e.effect]}**`),
      "",
    );
  }

  lines.push("## 장면", "");
  for (const scene of [...project.scenes].sort((a, b) => a.index - b.index)) {
    const timing = sceneTimingById.get(scene.id);
    const section = sectionById.get(scene.sectionId);
    const narration: string[] = [];
    for (let i = scene.lineFrom; i <= scene.lineTo; i += 1) {
      const line = lineByIndex.get(i);
      if (line) narration.push(line.text);
    }

    const start = timing?.startSec ?? 0;
    const duration = timing?.durationSec ?? scene.durationSec;
    lines.push(
      `### 씬 ${scene.index + 1} · ${section ? sectionLabel(section) : ""} · ` +
        `${start.toFixed(1)}s → ${(start + duration).toFixed(1)}s (${duration.toFixed(1)}초)`,
      "",
      `- 자막 ${scene.lineFrom + 1}~${scene.lineTo + 1} · ${scene.mode === "video" ? "AI 영상" : "이미지"} · 효과 ${EFFECT_LABEL[scene.effect]}`,
      "",
      `> ${narration.join(" ")}`,
      "",
      `**${scene.summaryKo}**`,
      "",
      "```",
      composeImagePrompt(scene.prompt, project.image),
      "```",
      "",
    );
    if (scene.mode === "video") {
      lines.push(`모션: \`${scene.motionPrompt}\``, "");
    }
  }
  return lines.join("\n");
}

function readmeText(folderName: string, project: Project): string {
  return [
    "이 폴더 쓰는 법",
    "",
    "[캡컷으로 바로 열기]",
    "  capcut/ 폴더를 통째로 캡컷 프로젝트 폴더에 복사하고 캡컷을 재시작하세요.",
    "    macOS : ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/",
    "    Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\",
    `  프로젝트 목록에 '${folderName}'로 뜹니다.`,
    "",
    "  ⚠️ 캡컷은 버전마다 드래프트 형식이 달라 안 열릴 수 있습니다.",
    "     그럴 땐 아래로 하세요 — 결과물은 같습니다.",
    "",
    "[수동으로 올리기]",
    "  1. assets/ 파일은 scene-001, scene-002 … line-001 … 순서로 번호가 붙어 있습니다.",
    "  2. subtitles.srt 를 자막 트랙으로 불러오면 타이밍이 맞습니다.",
    "  3. storyboard.csv 에 씬별 시작 시각·길이·효과·프롬프트가 다 있습니다.",
    "",
    "[자막 폰트]",
    `  이 프로젝트의 자막 폰트는 '${project.caption.fontFamily}' 입니다.`,
    "  캡컷에 그 폰트가 설치돼 있어야 그대로 나옵니다.",
    "  미리캔버스·캔바에서 쓰던 폰트라면 로컬에 설치한 뒤 캡컷을 재시작하세요.",
    "",
    "[대본만 볼 때]",
    "  script.md — 대본, 장면별 한글 요약, 이미지 프롬프트, 직접 걸 효과 목록.",
  ].join("\n");
}
