import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveAsset } from "@/lib/paths";

type Params = { params: Promise<{ path: string[] }> };

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

/** 생성된 에셋을 브라우저에 그대로 내려준다. data 디렉터리 밖은 막혀 있다. */
export async function GET(_request: Request, { params }: Params) {
  const { path: segments } = await params;

  try {
    // resolveAsset이 data 디렉터리 탈출을 막는다.
    const file = resolveAsset(segments.join("/"));
    const body = await fs.readFile(file);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
