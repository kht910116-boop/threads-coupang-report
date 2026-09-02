import { randomUUID } from "node:crypto";

export const uuid = (): string => randomUUID();

/** 캡컷 드래프트는 대문자 UUID를 쓴다. */
export const upperUuid = (): string => randomUUID().toUpperCase();

export const now = (): string => new Date().toISOString();

/** 사람이 읽을 수 있는 파일/폴더 이름으로 정리한다. */
export function slugify(input: string, fallback = "untitled"): string {
  const cleaned = input
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : fallback;
}
