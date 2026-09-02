import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, exportsDir, resolveAsset } from "@/lib/paths";
import { slugify } from "@/lib/id";
import type { Project } from "@/lib/types";
import { buildCapCutDraft } from "./capcut";

/**
 * 내보내기 번들.
 *
 * 캡컷 드래프트가 안 열려도 작업이 멈추지 않게, 항상 범용 산출물을 같이 낸다.
 *
 *   <프로젝트명>/
 *     capcut/            ← 캡컷 드래프트 폴더 (통째로 캡컷 프로젝트 폴더에 복사)
 *       draft_content.json
 *       draft_meta_info.json
 *     assets/            ← 컷 순서대로 번호 붙인 이미지·영상·음성
 *     subtitles.srt      ← 어떤 편집기든 읽는 자막
 *     shotlist.csv       ← 컷편집용 샷리스트
 *     script.md          ← 대본 + 이미지 설명 + 스토리보드
 *     plan.json          ← 원본 기획 데이터
 */

/** 00:00:03,500 — SRT 타임코드 */
function srtTime(totalSeconds: number): string {
  const ms = Math.round(totalSeconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`;
}

function buildSrt(project: Project): string {
  const useNarration = project.preset.caption.source === "narration";
  let cursor = 0;
  const blocks: string[] = [];

  project.cuts.forEach((cut, index) => {
    const text = useNarration ? cut.narration : cut.onScreenText;
    const start = cursor;
    cursor += cut.durationSec;
    if (!text.trim()) return;
    blocks.push(
      `${index + 1}\n${srtTime(start)} --> ${srtTime(cursor)}\n${text.trim()}\n`,
    );
  });
  return blocks.join("\n");
}

/** 엑셀에서 열어도 안 깨지게 따옴표를 이스케이프한다. */
const csvCell = (value: string | number): string =>
  `"${String(value).replace(/"/g, '""')}"`;

function buildShotlist(project: Project): string {
  const header = [
    "컷", "시작(초)", "길이(초)", "구성", "모드",
    "나레이션", "화면자막", "이미지설명", "이미지프롬프트", "모션프롬프트",
    "이미지파일", "영상파일", "음성파일",
  ];

  let cursor = 0;
  const rows = project.cuts.map((cut, index) => {
    const start = cursor;
    cursor += cut.durationSec;
    return [
      index + 1,
      start.toFixed(2),
      cut.durationSec.toFixed(2),
      cut.section,
      cut.mode,
      cut.narration,
      cut.onScreenText,
      cut.imageDescription,
      cut.imagePrompt,
      cut.motionPrompt,
      cut.image ? path.basename(cut.image.path) : "",
      cut.video ? path.basename(cut.video.path) : "",
      cut.audio ? path.basename(cut.audio.path) : "",
    ].map(csvCell).join(",");
  });

  // BOM을 붙여야 엑셀이 한글을 UTF-8로 읽는다.
  return `﻿${header.map(csvCell).join(",")}\n${rows.join("\n")}\n`;
}

function buildScriptMarkdown(project: Project): string {
  const { plan, preset } = project;
  const lines: string[] = [];

  lines.push(`# ${plan?.title ?? project.topic}`, "");
  lines.push(`- 스타일: **${preset.name}** (${preset.aspect}, ${preset.fps}fps)`);
  lines.push(`- 주제: ${project.topic}`);
  if (project.brief.trim()) lines.push(`- 지시사항: ${project.brief.trim()}`);
  lines.push(
    `- 컷 ${project.cuts.length}개 / 총 ${project.cuts
      .reduce((sum, c) => sum + c.durationSec, 0)
      .toFixed(1)}초`,
    "",
  );

  if (plan) {
    lines.push("## 기획", "");
    lines.push(`**훅** ${plan.hook}`, "");
    lines.push(`**한 줄 요약** ${plan.summary}`, "");
    lines.push("**설명란**", "", plan.description, "");
    lines.push(`**해시태그** ${plan.hashtags.map((t) => `#${t}`).join(" ")}`, "");
    lines.push(`**썸네일 프롬프트** \`${plan.thumbnailPrompt}\``, "");
  }

  lines.push("## 컷 구성", "");
  let cursor = 0;
  for (const [index, cut] of project.cuts.entries()) {
    const start = cursor;
    cursor += cut.durationSec;
    lines.push(
      `### ${index + 1}. ${cut.section} — ${start.toFixed(1)}s → ${cursor.toFixed(1)}s (${cut.durationSec.toFixed(1)}초, ${cut.mode})`,
      "",
      `> ${cut.narration}`,
      "",
      `- **화면 자막**: ${cut.onScreenText}`,
      `- **이미지 설명**: ${cut.imageDescription}`,
      `- **이미지 프롬프트**: \`${cut.imagePrompt}\``,
      `- **모션 프롬프트**: \`${cut.motionPrompt}\``,
      "",
    );
  }
  return lines.join("\n");
}

export interface ExportResult {
  /** 번들 폴더의 절대 경로 */
  dir: string;
  files: string[];
  warnings: string[];
}

export async function exportProject(project: Project): Promise<ExportResult> {
  const warnings: string[] = [];
  const files: string[] = [];

  const folderName = slugify(project.plan?.title ?? project.topic, project.id);
  const root = path.join(exportsDir(project.id), folderName);
  const assetsOut = path.join(root, "assets");
  const capcutOut = path.join(root, "capcut");

  await ensureDir(assetsOut);
  await ensureDir(capcutOut);

  // ── 에셋을 컷 순서대로 번호 붙여 복사한다 ──
  // 원본 파일명은 UUID라 순서를 알 수 없다. 편집기에서 바로 쓰려면 번호가 필요하다.
  const copied = new Map<string, string>(); // 원본 상대경로 → 복사본 절대경로
  for (const [index, cut] of project.cuts.entries()) {
    const prefix = String(index + 1).padStart(3, "0");
    const jobs = [
      { ref: cut.image, tag: "img" },
      { ref: cut.video, tag: "vid" },
      { ref: cut.audio, tag: "aud" },
    ];
    for (const { ref, tag } of jobs) {
      if (!ref) continue;
      const source = resolveAsset(ref.path);
      const target = path.join(
        assetsOut,
        `${prefix}-${tag}${path.extname(ref.path)}`,
      );
      try {
        await fs.copyFile(source, target);
        copied.set(ref.path, target);
        files.push(path.relative(root, target));
      } catch {
        warnings.push(`${index + 1}번 컷의 ${tag} 파일을 찾지 못했습니다: ${ref.path}`);
      }
    }
  }

  const missingVisual = project.cuts.filter(
    (cut) => !(cut.mode === "video" ? cut.video : cut.image),
  ).length;
  if (missingVisual > 0) {
    warnings.push(
      `${missingVisual}개 컷에 아직 이미지/영상이 없어 캡컷 타임라인에서 빠집니다.`,
    );
  }

  // ── 캡컷 드래프트 ──
  // 드래프트가 참조하는 경로는 번들 안의 복사본이다. 번들 폴더째 옮겨도 살아 있게.
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

  // ── 범용 산출물 ──
  const plain: Array<[string, string]> = [
    ["subtitles.srt", buildSrt(project)],
    ["shotlist.csv", buildShotlist(project)],
    ["script.md", buildScriptMarkdown(project)],
    ["plan.json", JSON.stringify({ plan: project.plan, cuts: project.cuts }, null, 2)],
    ["README.txt", readmeText(folderName)],
  ];
  for (const [name, body] of plain) {
    await fs.writeFile(path.join(root, name), body, "utf8");
    files.push(name);
  }

  return { dir: root, files, warnings };
}

function readmeText(folderName: string): string {
  return [
    "이 폴더 쓰는 법",
    "",
    "[캡컷으로 바로 열기]",
    "  capcut/ 폴더를 통째로 캡컷 프로젝트 폴더 안에 복사한 뒤 캡컷을 재시작하세요.",
    "    macOS : ~/Movies/CapCut/User Data/Projects/com.lveditor.draft/",
    "    Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft\\",
    `  폴더 이름은 그대로 두면 프로젝트 목록에 '${folderName}'로 뜹니다.`,
    "",
    "  ⚠️ 캡컷은 버전마다 드래프트 형식이 달라서 안 열릴 수 있습니다.",
    "     그럴 땐 아래 방법으로 하세요 — 결과물은 같습니다.",
    "",
    "[수동으로 편집기에 올리기]",
    "  1. assets/ 안의 파일은 컷 순서대로 001, 002... 번호가 붙어 있습니다.",
    "     번호 순서대로 타임라인에 올리면 됩니다.",
    "  2. subtitles.srt 를 자막 트랙으로 불러오면 타이밍이 맞습니다.",
    "  3. shotlist.csv 에 컷별 시작 시각·길이·프롬프트가 다 들어 있습니다.",
    "",
    "[대본만 볼 때]",
    "  script.md — 대본, 컷별 이미지 설명, 스토리보드가 한 파일에 있습니다.",
  ].join("\n");
}
