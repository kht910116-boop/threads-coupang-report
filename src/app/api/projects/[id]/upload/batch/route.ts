import fs from "node:fs/promises";
import path from "node:path";
import { handle } from "@/lib/http";
import { assetsDir, ensureDir, toRelative } from "@/lib/paths";
import { now } from "@/lib/id";
import { getProject, saveProject } from "@/lib/store";
import type { Project, Scene } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 600;
export const dynamic = "force-dynamic";

/**
 * 파일 여러 개를 한 번에 장면에 붙인다.
 *
 * 이미지와 영상은 사용자가 밖에서(Flow·그록 등) 한꺼번에 만들어 온다. 그걸 장면마다
 * 하나씩 올리게 하면 장면이 여든 개인 대본에서는 쓸 수 없는 기능이 된다.
 *
 * 어느 파일이 어느 장면인지는 두 가지로 정한다.
 *   number  파일 이름 속 숫자를 장면 번호로 본다 (기본)
 *   order   이름순으로 늘어놓고 앞에서부터 채운다
 *
 * 무엇을 어디에 붙였는지 항상 돌려준다. 조용히 엉뚱한 데 붙는 것이 제일 나쁘다.
 */

/**
 * 파일 이름에서 장면 번호를 뽑는다. **맨 뒤 숫자 하나만** 본다.
 *
 * 이름에 숫자가 여럿인 경우가 흔하다 — "Flow_2026-09-03_12.png"처럼 날짜가 섞인다.
 * 처음에는 '범위 안에 드는 숫자 중 마지막 것'으로 했는데, 그게 조용히 틀렸다.
 * 장면이 6개일 때 "Flow_2026-09-03_99.png"는 99가 범위를 벗어나므로 날짜의 03으로
 * 떨어져 **3번 장면에 붙었다.** 사용자는 99번을 올렸다고 생각하는데 3번이 덮인다.
 *
 * 그래서 규칙을 하나로 줄였다. 맨 뒤 숫자가 장면 번호다. 범위를 벗어나면 못 붙인
 * 파일로 돌려보낸다 — 틀린 곳에 붙이느니 안 붙이는 게 낫다. 규칙이 하나뿐이라
 * 화면에 한 문장으로 적을 수 있고, 사용자가 파일명을 그에 맞출 수 있다.
 */
function sceneNumberFrom(fileName: string, sceneCount: number): number | null {
  const base = path.basename(fileName, path.extname(fileName));
  const numbers = [...base.matchAll(/\d+/g)];
  if (numbers.length === 0) return null;
  const last = Number(numbers[numbers.length - 1][0]);
  return last >= 1 && last <= sceneCount ? last : null;
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  return handle(async () => {
    const project = await getProject(id);
    if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

    const form = await request.formData();
    const kind = String(form.get("kind") ?? "");
    const match = String(form.get("match") ?? "number");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (kind !== "image" && kind !== "video") {
      throw new Error(`일괄 업로드는 image/video만 됩니다: ${kind}`);
    }
    if (files.length === 0) throw new Error("파일이 없습니다.");
    if (project.scenes.length === 0) {
      throw new Error("먼저 스토리보드를 만드세요. 붙일 장면이 없습니다.");
    }

    const scenes = [...project.scenes].sort((a, b) => a.index - b.index);
    const byIndex = new Map(scenes.map((s) => [s.index + 1, s]));

    // 이름순으로 세워둔다. order 방식이 여기에 기댄다.
    const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));

    const assigned: Array<{ file: File; scene: Scene }> = [];
    const unmatched: string[] = [];
    const taken = new Set<string>();

    ordered.forEach((file, i) => {
      const scene =
        match === "order"
          ? scenes[i]
          : byIndex.get(sceneNumberFrom(file.name, scenes.length) ?? -1);
      // 같은 장면에 두 파일이 걸리면 뒤엣것은 버린다. 조용히 덮어쓰지 않는다.
      if (!scene || taken.has(scene.id)) {
        unmatched.push(file.name);
        return;
      }
      taken.add(scene.id);
      assigned.push({ file, scene });
    });

    const dir = assetsDir(id);
    await ensureDir(dir);

    const written: Array<{ sceneId: string; sceneNumber: number; file: string; path: string }> = [];
    for (const { file, scene } of assigned) {
      const extension = path.extname(file.name) || (kind === "image" ? ".png" : ".mp4");
      const target = path.join(
        dir,
        `scene-${String(scene.index + 1).padStart(3, "0")}-${kind}-${Date.now()}${extension}`,
      );
      await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
      written.push({
        sceneId: scene.id,
        sceneNumber: scene.index + 1,
        file: file.name,
        path: toRelative(target),
      });
    }

    const pathBySceneId = new Map(written.map((w) => [w.sceneId, w.path]));
    const next: Project = {
      ...project,
      scenes: project.scenes.map((s) => {
        const relative = pathBySceneId.get(s.id);
        if (!relative) return s;
        return {
          ...s,
          [kind]: { path: relative, provider: "upload", createdAt: now() },
          // 영상을 붙였다는 건 이 장면을 영상으로 대체하겠다는 뜻이다. 표시를 따로
          // 하게 두면 파일만 올려놓고 컷 이미지가 나가는 일이 생긴다.
          ...(kind === "video" ? { mode: "video" as const } : {}),
        };
      }),
    };

    return {
      project: await saveProject(next),
      matched: written.map((w) => ({ scene: w.sceneNumber, file: w.file })),
      unmatched,
      // 아직 비어 있는 장면. 몇 개를 더 만들어 와야 하는지 바로 보인다.
      stillEmpty: scenes
        .filter((s) => !pathBySceneId.has(s.id) && !s[kind])
        .map((s) => s.index + 1),
    };
  });
}
