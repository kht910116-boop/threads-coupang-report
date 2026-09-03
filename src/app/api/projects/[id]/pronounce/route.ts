import fs from "node:fs/promises";
import path from "node:path";
import { handle } from "@/lib/http";
import { dataDir } from "@/lib/paths";
import { needsReview, toSpoken, type Rule } from "@/lib/pipeline/pronounce";
import { getProject, saveProject } from "@/lib/store";
import type { Project } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * 발음 검수.
 *
 * GET  제안을 만든다. **바뀐 줄만** 돌려준다 — 455줄을 다 보여주면 아무도 안 읽는다.
 * POST 사람이 확정한 것을 저장한다.
 *
 * 제안을 자동으로 저장하지 않는 것이 핵심이다. 기계는 고유명사나 말맛을 모른다.
 * "1,030억"은 규칙으로 풀리지만 "3분"이 삼 분인지 세 문인지는 문맥이 정한다.
 */

/** 사용자가 더 넣은 규칙. 코드를 고치지 않고 읽는 법을 바꿀 수 있어야 한다. */
async function userRules(): Promise<Rule[]> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), "pronunciation.json"), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is Rule =>
        typeof r === "object" && r !== null &&
        typeof (r as Rule).find === "string" && typeof (r as Rule).replace === "string",
    );
  } catch {
    // 파일이 없는 게 정상이다. 규칙을 안 넣은 사람이 대부분이다.
    return [];
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const rules = await userRules();
    const suggestions = project.lines
      .map((line) => ({
        lineId: line.id,
        number: line.index + 1,
        text: line.text,
        // 이미 손봐둔 게 있으면 그걸 보여준다. 제안으로 덮어쓰면 사람이 한 일이 사라진다.
        spoken: line.spokenText || toSpoken(line.text, rules),
        suggested: toSpoken(line.text, rules),
        settled: Boolean(line.spokenText),
      }))
      .filter((s) => needsReview(s.text, s.suggested) || s.settled);

    return {
      total: project.lines.length,
      rules: rules.length,
      suggestions,
    };
  });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const body = (await request.json()) as {
      /** lineId → 읽을 글자. 빈 문자열이면 원문을 그대로 읽는다. */
      spoken?: Record<string, string>;
      /** 제안을 전부 그대로 받는다 */
      acceptAll?: boolean;
    };

    const rules = await userRules();
    let changed = 0;

    const next: Project = {
      ...project,
      lines: project.lines.map((line) => {
        if (body.acceptAll) {
          const spoken = toSpoken(line.text, rules);
          if (!needsReview(line.text, spoken)) return line;
          changed++;
          return { ...line, spokenText: spoken };
        }
        const given = body.spoken?.[line.id];
        if (given === undefined) return line;
        changed++;
        // 원문과 같아졌으면 비운다. 굳이 같은 글자를 두 벌 들고 있을 이유가 없다.
        return { ...line, spokenText: given.trim() === line.text.trim() ? "" : given };
      }),
    };

    return { project: await saveProject(next), changed };
  });
}
