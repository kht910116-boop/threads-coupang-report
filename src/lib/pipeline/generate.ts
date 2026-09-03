import { z } from "zod";
import { extractJson } from "@/lib/engine/json";
import {
  scriptSystemPrompt,
  scriptUserPrompt,
  sectionLabel,
  splitSystemPrompt,
  splitUserPrompt,
  storyboardSystemPrompt,
  storyboardUserPrompt,
} from "@/lib/engine/prompt";
import type { Engine } from "@/lib/engine";
import { uuid } from "@/lib/id";
import {
  SECTION_LABEL,
  scenePlanSchema,
  scriptPlanSchema,
  type Project,
  type Scene,
  type ScriptLine,
  type ScriptSection,
} from "@/lib/types";
import { groupLinesIntoScenes, lineDuration } from "./grouping";

/** zod 스키마를 엔진에 넘길 수 있는 JSON Schema로 바꾼다 ($schema 키는 뺀다). */
function toSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

// ─────────────────────────────────────────────────────────────
// 1~2단계: 대본
// ─────────────────────────────────────────────────────────────

export interface ScriptResult {
  title: string;
  summary: string;
  description: string;
  hashtags: string[];
  thumbnailPrompt: string;
  sections: ScriptSection[];
  lines: ScriptLine[];
}

/** 모델이 낸 계획을 저장할 모양(구간 + 통짜 번호가 붙은 줄)으로 편다. */
function buildScript(plan: z.infer<typeof scriptPlanSchema>): ScriptResult {
  const sections: ScriptSection[] = [];
  const lines: ScriptLine[] = [];
  let partNumber = 0;
  let lineIndex = 0;

  plan.sections.forEach((planned, order) => {
    if (planned.kind === "part") partNumber += 1;
    const section: ScriptSection = {
      id: uuid(),
      kind: planned.kind,
      title: planned.title,
      partNumber: planned.kind === "part" ? partNumber : 0,
      order,
    };
    sections.push(section);

    for (const line of planned.lines) {
      if (!line.text.trim()) continue;
      lines.push({
        id: uuid(),
        sectionId: section.id,
        index: lineIndex++,
        text: line.text.trim(),
        audio: null,
      });
    }
  });

  return {
    title: plan.title,
    summary: plan.summary,
    description: plan.description,
    hashtags: plan.hashtags,
    thumbnailPrompt: plan.thumbnailPrompt,
    sections,
    lines,
  };
}

export async function generateScript(
  engine: Engine,
  project: Project,
): Promise<ScriptResult> {
  const raw = await engine.complete({
    system: scriptSystemPrompt(project.preset),
    user: scriptUserPrompt({
      topic: project.topic,
      brief: project.brief,
      references: project.references,
    }),
    schema: toSchema(scriptPlanSchema),
  });

  return buildScript(scriptPlanSchema.parse(extractJson(raw)));
}

/**
 * 대조용 정규화.
 *
 * 줄을 나누는 과정에서 공백과 줄바꿈은 필연적으로 달라진다(문단이 줄로 쪼개지므로).
 * 그래서 공백만 지우고 나머지 글자를 그대로 비교한다. 맞춤법·문장부호·오타까지
 * 전부 대조 대상이다 — 모델이 "고쳐준" 것을 잡아내는 게 이 함수의 목적이다.
 */
const normalizeForCompare = (text: string) => text.replace(/\s+/gu, "");

/** 처음으로 어긋나는 자리를 사람이 읽을 수 있게 뽑는다. */
function firstDifference(original: string, rebuilt: string): string {
  const at = [...original].findIndex((ch, i) => ch !== rebuilt[i]);
  const from = Math.max(0, (at < 0 ? Math.min(original.length, rebuilt.length) : at) - 20);
  const cut = (text: string) => text.slice(from, from + 60);
  return [`원문: …${cut(original)}…`, `결과: …${cut(rebuilt)}…`].join("\n");
}

/**
 * 이미 써 둔 대본을 구간과 자막 줄로 나눈다.
 *
 * 글을 새로 쓰지 않는다. 모델은 어디서 끊을지만 정하고, 그 결과를 **원문과 기계로
 * 대조한다.** 공백을 지운 뒤 한 글자라도 다르면 저장하지 않고 실패로 돌린다.
 * 프롬프트로 "고치지 마라"라고 시켰어도 모델은 종종 다듬는다. 사용자가 공들여 쓴
 * 대본이 조용히 바뀌는 것보다 실패하는 편이 낫다.
 */
export async function splitScript(
  engine: Engine,
  project: Project,
  text: string,
): Promise<ScriptResult> {
  const raw = await engine.complete({
    system: splitSystemPrompt(project.preset),
    user: splitUserPrompt(text),
    schema: toSchema(scriptPlanSchema),
  });

  const result = buildScript(scriptPlanSchema.parse(extractJson(raw)));

  const original = normalizeForCompare(text);
  const rebuilt = normalizeForCompare(result.lines.map((line) => line.text).join(""));

  if (original !== rebuilt) {
    const missing = original.length - rebuilt.length;
    throw new Error(
      [
        "나눈 결과가 원문과 다릅니다. 대본이 바뀔 수 있어 저장하지 않았습니다.",
        missing > 0
          ? `원문보다 ${missing}자 모자랍니다 (빠뜨렸을 수 있습니다).`
          : missing < 0
            ? `원문보다 ${-missing}자 많습니다 (덧붙였을 수 있습니다).`
            : "글자 수는 같지만 내용이 다릅니다 (다듬었을 수 있습니다).",
        "",
        firstDifference(original, rebuilt),
        "",
        "다시 시도하거나, 대본을 조금 손봐서 넣어보세요.",
      ].join("\n"),
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 4단계: 스토리보드
// ─────────────────────────────────────────────────────────────

const storyboardResponseSchema = z.object({
  scenes: z.array(scenePlanSchema),
});

/**
 * 씬을 만들고 내용을 채운다.
 *
 * 씬을 몇 개로 나눌지는 **모델이 정하지 않는다.** 자막 라인의 실제 음성 길이와
 * 파트별 장면 간격에서 앱이 계산한다. 모델은 이미 정해진 씬에 그림만 붙인다.
 * 그래야 길이 기준이 지켜진다.
 */
export async function generateStoryboard(
  engine: Engine,
  project: Project,
): Promise<Scene[]> {
  const groups = groupLinesIntoScenes({
    sections: project.sections,
    lines: project.lines,
    intervals: project.intervals,
  });
  if (groups.length === 0) {
    throw new Error("대본이 없습니다. 먼저 대본을 만드세요.");
  }

  const sectionById = new Map(project.sections.map((s) => [s.id, s]));
  const lineByIndex = new Map(project.lines.map((l) => [l.index, l]));

  const described = groups.map((group, index) => {
    const section = sectionById.get(group.sectionId);
    const narration: string[] = [];
    for (let i = group.lineFrom; i <= group.lineTo; i += 1) {
      const line = lineByIndex.get(i);
      if (line) narration.push(line.text);
    }
    return {
      index,
      sectionLabel: section ? sectionLabel(section) : SECTION_LABEL.part,
      durationSec: group.durationSec,
      narration: narration.join(" "),
    };
  });

  const raw = await engine.complete({
    system: storyboardSystemPrompt(project),
    user: storyboardUserPrompt({ project, scenes: described }),
    schema: toSchema(storyboardResponseSchema),
  });

  const parsed = storyboardResponseSchema.parse(extractJson(raw));
  if (parsed.scenes.length !== groups.length) {
    throw new Error(
      `장면 개수가 맞지 않습니다. ${groups.length}개를 요청했는데 ${parsed.scenes.length}개가 왔습니다. 다시 시도해 주세요.`,
    );
  }

  // 잠근 씬은 내용을 그대로 살린다.
  const lockedByIndex = new Map(
    project.scenes.filter((s) => s.locked).map((s) => [s.index, s]),
  );
  const rotation = project.effects.rotation;

  return groups.map((group, index) => {
    const locked = lockedByIndex.get(index);
    const plan = parsed.scenes[index];
    const effect = project.effects.rotate
      ? rotation[index % Math.max(1, rotation.length)]
      : project.effects.defaultEffect;

    if (locked) {
      // 씬을 다시 나눴을 수 있으니 범위·길이만 새로 맞춘다.
      return {
        ...locked,
        sectionId: group.sectionId,
        lineFrom: group.lineFrom,
        lineTo: group.lineTo,
        durationSec: group.durationSec,
      };
    }

    return {
      id: uuid(),
      sectionId: group.sectionId,
      index,
      lineFrom: group.lineFrom,
      lineTo: group.lineTo,
      summaryKo: plan.summaryKo,
      prompt: plan.prompt,
      motionPrompt: plan.motionPrompt,
      durationSec: group.durationSec,
      mode: project.preset.video.defaultMode,
      effect,
      replaceable: true,
      image: null,
      video: null,
      locked: false,
    } satisfies Scene;
  });
}

/** 음성이 붙은 뒤 씬 길이를 실제 값으로 다시 맞춘다. */
export function refreshSceneDurations(project: Project): Scene[] {
  const byIndex = new Map(project.lines.map((l) => [l.index, l]));
  return project.scenes.map((scene) => {
    let total = 0;
    for (let i = scene.lineFrom; i <= scene.lineTo; i += 1) {
      const line = byIndex.get(i);
      if (line) total += lineDuration(line);
    }
    return { ...scene, durationSec: total };
  });
}

// ─────────────────────────────────────────────────────────────
// 비서 — 매 단계에 따라다니는 봇
// ─────────────────────────────────────────────────────────────

/** 지금 단계에서 프로젝트가 어떤 상태인지 요약해 비서에게 준다. */
export function assistantContext(project: Project, step: string): string {
  const lineCount = project.lines.length;
  const charCount = project.lines.reduce((sum, l) => sum + [...l.text].length, 0);
  const withAudio = project.lines.filter((l) => l.audio).length;
  const withImage = project.scenes.filter((s) => s.image).length;
  const withVideo = project.scenes.filter((s) => s.video).length;

  const structure = project.sections
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const count = project.lines.filter((l) => l.sectionId === s.id).length;
      return `${sectionLabel(s)}${s.title ? `(${s.title})` : ""} ${count}줄`;
    })
    .join(" · ");

  return [
    `## 지금 프로젝트`,
    `- 주제: ${project.topic}`,
    project.title ? `- 제목: ${project.title}` : "",
    `- 스타일: ${project.preset.name} (${project.preset.aspect}, 목표 ${project.preset.targetDurationSec}초)`,
    project.references.length > 0
      ? `- 레퍼런스: ${project.references.map((r) => r.url).join(", ")}`
      : "",
    structure ? `- 구조: ${structure}` : "- 구조: 아직 대본 없음",
    lineCount > 0 ? `- 자막 ${lineCount}줄 / ${charCount}자, 음성 완료 ${withAudio}줄` : "",
    project.scenes.length > 0
      ? `- 장면 ${project.scenes.length}개, 이미지 ${withImage}개, 영상 ${withVideo}개`
      : "",
    `- 장면 간격: 훅·인트로 ${project.intervals.hookIntro.min}~${project.intervals.hookIntro.max}초 / 파트 ${project.intervals.part.min}~${project.intervals.part.max}초 / 클로징 ${project.intervals.closing.min}~${project.intervals.closing.max}초`,
    `- 지금 보고 있는 단계: ${step}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export const ASSISTANT_SYSTEM = [
  "당신은 유튜브 영상 제작 도구 안에 붙어 있는 비서다.",
  "사용자는 대본 → 음성 → 스토리보드 → 이미지 → 영상 → 자막·효과 → 캡컷 순으로 작업한다.",
  "",
  "지금 프로젝트 상태가 아래에 주어진다. 그걸 근거로 답한다.",
  "",
  "규칙:",
  "- 짧게 답한다. 사용자는 작업 중이다.",
  "- 모르는 건 모른다고 한다. 프로젝트에 없는 내용을 지어내지 않는다.",
  "- 고칠 곳을 말할 때는 몇 번째 줄·몇 번째 장면인지 짚어준다.",
  "- 대본이나 프롬프트를 새로 써달라고 하면 그대로 써준다. 설명은 붙이지 않는다.",
].join("\n");
