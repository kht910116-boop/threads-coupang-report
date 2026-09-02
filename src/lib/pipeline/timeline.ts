import type { Project, Scene, ScriptLine } from "@/lib/types";
import { lineDuration } from "./grouping";

/**
 * 타임라인 계산 — 무음까지 포함한 실제 시각을 낸다.
 *
 * 자막(SRT)·캡컷 타임라인·스토리보드 화면이 전부 여기서 나온 값을 쓴다.
 * 한 곳에서만 계산해야 셋의 시각이 어긋나지 않는다.
 *
 * 배치:
 *   [앞 무음] 라인 [간격] 라인 [간격] ... [파트 바뀜: 파트 간격] ... [뒤 무음]
 */

export interface LineTiming {
  lineId: string;
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface SceneTiming {
  sceneId: string;
  index: number;
  startSec: number;
  /** 이 씬이 화면에 머무는 시간 (앞뒤 무음 몫까지 포함) */
  durationSec: number;
}

export interface Timeline {
  lines: LineTiming[];
  scenes: SceneTiming[];
  totalSec: number;
}

export function buildTimeline(project: Project): Timeline {
  const { tts } = project;
  const lead = tts.leadSilenceMs / 1000;
  const gap = tts.gapMs / 1000;
  const sectionGap = tts.sectionGapMs / 1000;
  const tail = tts.tailSilenceMs / 1000;

  const ordered = [...project.lines].sort((a, b) => a.index - b.index);
  const lineById = new Map<string, ScriptLine>(ordered.map((l) => [l.id, l]));

  const lines: LineTiming[] = [];
  let cursor = lead;
  let previousSectionId: string | null = null;

  for (const line of ordered) {
    // 파트가 바뀌면 호흡을 더 준다.
    if (previousSectionId !== null && line.sectionId !== previousSectionId) {
      cursor += sectionGap;
    } else if (previousSectionId !== null) {
      cursor += gap;
    }
    previousSectionId = line.sectionId;

    const duration = lineDuration(line);
    lines.push({
      lineId: line.id,
      index: line.index,
      startSec: cursor,
      endSec: cursor + duration,
      text: line.text,
    });
    cursor += duration;
  }

  const totalSec = cursor + tail;
  const timingByLineId = new Map(lines.map((t) => [t.lineId, t]));

  // 씬은 자기가 덮는 라인의 시작~끝을 차지한다.
  // 씬 사이 무음은 앞 씬이 머무는 시간에 붙여, 화면에 빈틈이 생기지 않게 한다.
  const orderedScenes = [...project.scenes].sort((a, b) => a.index - b.index);
  const bounds = orderedScenes.map((scene: Scene) => {
    const covered = project.lines
      .filter((l) => l.index >= scene.lineFrom && l.index <= scene.lineTo)
      .map((l) => timingByLineId.get(l.id))
      .filter((t): t is LineTiming => Boolean(t));

    if (covered.length === 0) return { sceneId: scene.id, index: scene.index, start: 0, end: 0 };
    return {
      sceneId: scene.id,
      index: scene.index,
      start: Math.min(...covered.map((t) => t.startSec)),
      end: Math.max(...covered.map((t) => t.endSec)),
    };
  });

  const scenes: SceneTiming[] = bounds.map((bound, i) => {
    // 첫 씬은 앞 무음까지 덮고, 마지막 씬은 뒤 무음까지 덮는다.
    const start = i === 0 ? 0 : bound.start;
    const end = i === bounds.length - 1 ? totalSec : bounds[i + 1].start;
    return {
      sceneId: bound.sceneId,
      index: bound.index,
      startSec: start,
      durationSec: Math.max(0.1, end - start),
    };
  });

  // 라인 없는 씬이 섞이면 0초짜리가 나온다. 그건 걸러낸다.
  return { lines, scenes: scenes.filter((s) => s.durationSec > 0.1), totalSec };
}

/** 씬 하나가 화면에 있는 구간. 캡컷 익스포터가 쓴다. */
export function sceneWindow(
  timeline: Timeline,
  sceneId: string,
): { startSec: number; durationSec: number } | null {
  const found = timeline.scenes.find((s) => s.sceneId === sceneId);
  return found ? { startSec: found.startSec, durationSec: found.durationSec } : null;
}
