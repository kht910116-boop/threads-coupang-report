import path from "node:path";
import fs from "node:fs/promises";

/** 모든 로컬 상태가 사는 곳. 기본은 repo 안의 ./data (gitignore됨). */
export function dataDir(): string {
  const configured = process.env.AUTOTUBE_DATA_DIR;
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), "data");
}

export const presetsFile = () => path.join(dataDir(), "presets.json");
export const projectsDir = () => path.join(dataDir(), "projects");
export const projectFile = (id: string) => path.join(projectsDir(), `${id}.json`);
export const assetsDir = (projectId: string) =>
  path.join(dataDir(), "assets", projectId);
export const exportsDir = (projectId: string) =>
  path.join(dataDir(), "exports", projectId);

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * data 디렉터리 기준 상대 경로를 절대 경로로 되돌린다.
 * 저장된 에셋 경로는 항상 상대로 두어 data 디렉터리를 통째로 옮겨도 깨지지 않게 한다.
 */
export function resolveAsset(relativePath: string): string {
  const abs = path.resolve(dataDir(), relativePath);
  // 저장된 경로가 data 밖을 가리키면 읽지 않는다.
  if (abs !== dataDir() && !abs.startsWith(dataDir() + path.sep)) {
    throw new Error(`data 디렉터리 밖의 경로입니다: ${relativePath}`);
  }
  return abs;
}

export function toRelative(absolutePath: string): string {
  return path.relative(dataDir(), absolutePath).split(path.sep).join("/");
}
