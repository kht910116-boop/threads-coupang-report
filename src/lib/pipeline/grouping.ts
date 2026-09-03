import {
  estimateDurationSec,
  intervalGroupOf,
  type Intervals,
  type ScriptLine,
  type ScriptSection,
} from "@/lib/types";

/**
 * 자막 라인을 씬으로 묶는다 — 4단계 스토리보드의 뼈대.
 *
 * 씬은 임의로 나누지 않는다. 연속된 라인의 **음성 길이 합**이 그 파트의
 * '장면 간격' 범위에 들어오도록 묶는다. 그래서 훅은 짧고 촘촘하게,
 * 본문 파트는 길고 여유 있게 붙는다.
 *
 * 규칙:
 *  - 씬은 파트를 가로지르지 않는다. 파트가 바뀌면 무조건 새 씬이다.
 *  - 라인을 계속 담다가 max를 넘기 직전에 끊는다. **상한은 무조건 지킨다.**
 *  - 라인 하나가 이미 max보다 길면 그 라인 혼자 한 씬이 된다 (쪼갤 수 없다).
 *  - 파트 마지막 씬이 min보다 짧으면 앞 씬에서 라인을 넘겨받아 채운다.
 *    앞 씬이 min 아래로 내려가면 멈춘다.
 */

export interface SceneGroup {
  sectionId: string;
  lineFrom: number;
  lineTo: number;
  durationSec: number;
  lineIds: string[];
}

/** 음성이 있으면 실제 길이를, 없으면 글자수 추정치를 쓴다. */
export const lineDuration = (line: ScriptLine): number =>
  line.audio?.durationSec ?? estimateDurationSec(line.text);

/**
 * 파트 마지막 씬이 기준보다 짧을 때 앞 씬에서 라인을 한 줄씩 넘겨받는다.
 *
 * 앞 씬이 최소 기준 아래로 내려가면 멈춘다. 그래도 짧으면, 둘을 합쳐도
 * 상한을 안 넘길 때만 합친다 — 합쳐서 상한을 넘길 바에는 짧은 채로 두는 게 낫다.
 */
function balanceTail(
  groups: SceneGroup[],
  sectionLines: ScriptLine[],
  range: { min: number; max: number },
): void {
  const tail = groups[groups.length - 1];
  const previous = groups[groups.length - 2];
  if (!tail || !previous || previous.sectionId !== tail.sectionId) return;
  if (tail.durationSec >= range.min) return;

  const durationOf = new Map(sectionLines.map((l) => [l.id, lineDuration(l)]));

  while (tail.durationSec < range.min && previous.lineIds.length > 1) {
    const movedId = previous.lineIds[previous.lineIds.length - 1];
    const moved = durationOf.get(movedId) ?? 0;
    // 앞 씬이 기준 아래로 내려가면 넘기지 않는다.
    if (previous.durationSec - moved < range.min) break;

    previous.lineIds.pop();
    previous.durationSec -= moved;
    previous.lineTo -= 1;

    tail.lineIds.unshift(movedId);
    tail.durationSec += moved;
    tail.lineFrom -= 1;
  }

  // 그래도 짧고, 합쳐도 상한을 안 넘기면 합친다.
  if (
    tail.durationSec < range.min &&
    previous.durationSec + tail.durationSec <= range.max
  ) {
    previous.lineTo = tail.lineTo;
    previous.durationSec += tail.durationSec;
    previous.lineIds.push(...tail.lineIds);
    groups.pop();
  }
}

/**
 * 파트가 진행될수록 장면을 조금씩 빠르게 한다.
 *
 * 같은 파트 간격을 처음부터 끝까지 그대로 쓰면 뒤로 갈수록 늘어진다. 이야기는
 * 뒤로 갈수록 조여야 하는데 화면은 같은 속도로 머문다. 그래서 뒤 파트일수록
 * 상한을 최소치 쪽으로 당긴다 — 마지막 파트가 가장 빠르다.
 *
 * **상한은 여전히 무조건 지킨다.** 당기기만 하지 늘리지 않으므로 원래 상한을
 * 넘는 장면은 생기지 않는다(HANDOFF의 불변식).
 *
 * 훅·인트로와 클로징은 건드리지 않는다. 훅은 원래 빠르고 클로징은 여운이 필요하다.
 */
const TENSION = 0.45;

export function tensionRange(
  section: ScriptSection,
  intervals: Intervals,
  partOrder: number,
  partCount: number,
): { min: number; max: number } {
  const base = intervals[intervalGroupOf(section.kind)];
  if (section.kind !== "part" || partCount <= 1 || partOrder < 0) return base;

  const t = partOrder / (partCount - 1); // 첫 파트 0 → 마지막 파트 1
  const max = base.max - (base.max - base.min) * TENSION * t;
  return { min: base.min, max: Math.max(base.min, max) };
}

/** 파트 구간만 순서대로 세어 각 파트가 몇 번째인지 알려준다. */
function partOrderMap(sections: ScriptSection[]): { order: Map<string, number>; count: number } {
  const order = new Map<string, number>();
  let n = 0;
  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    if (section.kind === "part") order.set(section.id, n++);
  }
  return { order, count: n };
}

export function groupLinesIntoScenes(args: {
  sections: ScriptSection[];
  lines: ScriptLine[];
  intervals: Intervals;
}): SceneGroup[] {
  const { sections, lines, intervals } = args;
  const groups: SceneGroup[] = [];

  const byOrder = [...sections].sort((a, b) => a.order - b.order);
  const parts = partOrderMap(sections);

  for (const section of byOrder) {
    const range = tensionRange(
      section,
      intervals,
      parts.order.get(section.id) ?? -1,
      parts.count,
    );
    const sectionLines = lines
      .filter((line) => line.sectionId === section.id)
      .sort((a, b) => a.index - b.index);
    if (sectionLines.length === 0) continue;

    let current: SceneGroup | null = null;

    for (const line of sectionLines) {
      const duration = lineDuration(line);

      if (current === null) {
        current = {
          sectionId: section.id,
          lineFrom: line.index,
          lineTo: line.index,
          durationSec: duration,
          lineIds: [line.id],
        };
        // 한 줄만으로 이미 최대치를 넘으면 더 담지 않고 확정한다.
        if (duration >= range.max) {
          groups.push(current);
          current = null;
        }
        continue;
      }

      const next = current.durationSec + duration;

      // 상한을 넘기면 끊는다. 상한은 무조건 지킨다 — 아직 최소치를 못 채웠어도
      // 넘겨서 담는 것보다 짧게 두는 편이 낫고, 짧은 씬은 뒤에서 다시 채운다.
      if (next > range.max) {
        groups.push(current);
        current = {
          sectionId: section.id,
          lineFrom: line.index,
          lineTo: line.index,
          durationSec: duration,
          lineIds: [line.id],
        };
        if (duration >= range.max) {
          groups.push(current);
          current = null;
        }
        continue;
      }

      current.lineTo = line.index;
      current.durationSec = next;
      current.lineIds.push(line.id);
    }

    if (current !== null) {
      groups.push(current);
      // 파트의 마지막 씬이 기준보다 짧으면 앞 씬에서 라인을 넘겨받아 채운다.
      // 그냥 앞 씬에 합쳐버리면 앞 씬이 상한을 넘겨버린다.
      balanceTail(groups, sectionLines, range);
    }
  }

  return groups;
}

/** 씬이 각 파트의 간격 기준을 지키는지 검사한다. UI에 경고를 띄우는 데 쓴다. */
export function checkGroups(
  groups: SceneGroup[],
  sections: ScriptSection[],
  intervals: Intervals,
): Array<{ index: number; message: string }> {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const parts = partOrderMap(sections);
  const problems: Array<{ index: number; message: string }> = [];

  groups.forEach((group, index) => {
    const section = sectionById.get(group.sectionId);
    if (!section) return;
    // 묶을 때 쓴 것과 같은 기준으로 재야 한다. 원래 간격으로 재면 뒤 파트가
    // 전부 '기준보다 짧다'로 잡힌다 — 일부러 빠르게 만든 건데.
    const range = tensionRange(
      section,
      intervals,
      parts.order.get(section.id) ?? -1,
      parts.count,
    );
    // 라인 하나가 통째로 긴 경우는 어쩔 수 없으니 넘어간다.
    if (group.durationSec > range.max && group.lineIds.length > 1) {
      problems.push({
        index,
        message: `${group.durationSec.toFixed(1)}초 — 기준(${range.max}초)보다 깁니다.`,
      });
    }
    if (group.durationSec < range.min) {
      problems.push({
        index,
        message: `${group.durationSec.toFixed(1)}초 — 기준(${range.min}초)보다 짧습니다.`,
      });
    }
  });

  return problems;
}
