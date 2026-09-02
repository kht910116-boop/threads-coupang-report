import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * standalone 출력을 실행 가능한 상태로 채운다.
 *
 * Next는 standalone에 서버와 서버가 쓰는 모듈만 넣고, 브라우저로 내려보낼 정적
 * 파일(.next/static)과 public은 넣지 않는다. 배포처가 CDN에 올릴 것을 전제하기
 * 때문이다. 이 앱은 CDN이 없고 서버가 전부 내보내야 하므로 여기서 직접 옮긴다.
 * 이 단계를 빼면 앱은 뜨지만 스타일과 스크립트가 전부 404가 난다.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyInto(from, to, label) {
  if (!(await exists(from))) return false;
  await fs.rm(to, { recursive: true, force: true });
  await fs.cp(from, to, { recursive: true });
  console.log(`  ${label} → ${path.relative(root, to)}`);
  return true;
}

if (!(await exists(standalone))) {
  console.error(
    "standalone 출력이 없습니다. next.config.mjs의 output이 \"standalone\"인지 확인하고 `npm run build`를 먼저 실행하세요.",
  );
  process.exit(1);
}

console.log("standalone 채우는 중");
const copiedStatic = await copyInto(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  ".next/static",
);
if (!copiedStatic) {
  console.error("  .next/static이 없습니다. 빌드가 끝까지 돌았는지 확인하세요.");
  process.exit(1);
}

await copyInto(path.join(root, "public"), path.join(standalone, "public"), "public");
console.log("완료");
