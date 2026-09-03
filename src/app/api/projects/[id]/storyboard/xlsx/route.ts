import path from "node:path";
import { composeImagePrompt } from "@/lib/engine/prompt";
import { buildXlsx } from "@/lib/export/xlsx";
import { getProject } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * 스토리보드를 엑셀로 내려준다.
 *
 * 이미지와 영상 생성은 사용자가 밖에서(플로우·그록) 직접 한다. 이 앱이 붙잡고 있어야
 * 할 것은 '무엇을 만들지'와 '만든 것을 어디에 붙일지'뿐이다. 그 사이는 엑셀 한 장으로
 * 건넨다.
 *
 * 프롬프트 열은 **자기완결이어야 한다.** 화풍 접두·접미까지 붙여서 내보내는 이유가
 * 그것이다 — 사용자가 셀을 복사해 그대로 붙여넣을 수 있어야 하고, 여기서 접두를
 * 빼면 씬마다 그림체가 흔들린다.
 *
 * 열 구성과 시트 이름은 레퍼런스 사이트가 주는 파일에 맞췄다. 두 파일을 같은 자리에
 * 쓰게 되므로 모양이 다르면 사용자가 매번 헷갈린다.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("kind") ?? "image";

  const project = await getProject(id);
  if (!project) {
    return new Response("프로젝트를 찾을 수 없습니다.", { status: 404 });
  }
  if (project.scenes.length === 0) {
    return new Response("스토리보드가 아직 없습니다.", { status: 400 });
  }

  const scenes = [...project.scenes].sort((a, b) => a.index - b.index);

  // 영상 표에는 '컷' 열이 하나 더 붙는다. 그록은 이미지와 프롬프트를 같이 받으므로
  // 어느 파일이 이 행의 컷인지 사용자가 알아야 한다.
  const isVideo = kind === "video";
  const columns = isVideo
    ? [
        { header: "씬번호", width: 8.83 },
        { header: "한글요약", width: 45.83 },
        { header: "컷파일", width: 28.83 },
        { header: "프롬프트", width: 90.83 },
      ]
    : [
        { header: "씬번호", width: 8.83 },
        { header: "한글요약", width: 45.83 },
        { header: "프롬프트", width: 90.83 },
      ];

  const rows = scenes
    // 영상은 선택 산출물이다. 'AI 영상'으로 표시한 씬만 내보내야 94줄짜리 표를 받고
    // 그중 어느 것을 만들어야 하는지 다시 골라내는 일이 없다.
    .filter((scene) => !isVideo || scene.mode === "video")
    .map((scene) => {
      const number = scene.index + 1;
      const summary = scene.summaryKo;
      if (!isVideo) {
        return [number, summary, composeImagePrompt(scene.prompt, project.image)];
      }
      return [
        number,
        summary,
        scene.image ? path.basename(scene.image.path) : "(이미지 없음)",
        scene.motionPrompt,
      ];
    });

  if (rows.length === 0) {
    return new Response(
      "영상으로 표시한 씬이 없습니다. 씬의 모드를 'AI 영상'으로 바꾼 뒤 다시 받으세요.",
      { status: 400 },
    );
  }

  const book = buildXlsx("storyboard", columns, rows);
  // 제목에 경로로 못 쓰는 글자가 섞여 있으면 저장이 실패한다.
  const name = `${project.title.replace(/[\/:*?"<>|]/g, "_") || "storyboard"}${
    isVideo ? "-영상" : ""
  }.xlsx`;

  return new Response(new Uint8Array(book), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // 한글 파일명은 filename*=UTF-8''… 로만 제대로 간다.
      "content-disposition": `attachment; filename="storyboard.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
