import { HttpError } from "./auth.ts";

export type FetchOptions = RequestInit & {
  timeoutMs?: number;
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^\[?::1\]?$/i,
];

export function assertPublicHttpUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new HttpError(400, "Only http and https URLs are allowed");
  }

  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw new HttpError(400, "Private network URLs are not allowed");
  }

  return url;
}

export async function fetchWithTimeout(
  url: string | URL,
  options: FetchOptions = {},
) {
  const timeoutMs = options.timeoutMs ?? 12000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new HttpError(504, "Upstream request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message = "Operation timed out",
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(504, message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchArrayBufferWithLimit(
  url: string,
  maxBytes: number,
  timeoutMs = 15000,
) {
  const safeUrl = assertPublicHttpUrl(url);
  const response = await fetchWithTimeout(safeUrl, { timeoutMs });
  if (!response.ok) throw new HttpError(400, "Unable to fetch remote file");

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new HttpError(413, "Remote file is too large");
  }

  if (!response.body) return await response.arrayBuffer();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw new HttpError(413, "Remote file is too large");
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output.buffer;
}
