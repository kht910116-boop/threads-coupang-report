"use client";

/** 브라우저 쪽 fetch 래퍼. 서버가 보낸 에러 메시지를 그대로 살려서 던진다. */
export async function api<T>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? {
          method: rest.method ?? "POST",
          headers: { "content-type": "application/json", ...rest.headers },
          body: JSON.stringify(json),
        }
      : {}),
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON이 아니면 원문을 에러로 올린다.
  }

  if (!response.ok) {
    const payload = data as { error?: string; detail?: string[] } | null;
    const detail = payload?.detail?.length ? `\n${payload.detail.join("\n")}` : "";
    throw new Error((payload?.error ?? text ?? `HTTP ${response.status}`) + detail);
  }
  return data as T;
}

export const assetUrl = (relativePath: string) =>
  `/api/assets/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
