import { NextResponse } from "next/server";

/**
 * Best-effort process-local limiter. Use a shared/external limiter when the
 * deployment has one; this fallback still slows abuse per running instance.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const DEFAULT_WINDOW_MS = 60_000;

export function requestKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:${forwarded || request.headers.get("x-real-ip") || "unknown"}`;
}

export function rateLimit(key: string, limit: number, windowMs = DEFAULT_WINDOW_MS) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function rateLimitedResponse(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/** Read JSON without buffering an unbounded request body into memory. */
export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
      throw new Error("BODY_TOO_LARGE");
    }
  }

  if (!request.body) throw new Error("INVALID_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export function invalidBodyResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error && error.message === "BODY_TOO_LARGE" ? "Request body is too large." : "Invalid request body." },
    { status: 400 },
  );
}

export function dbErrorResponse(status = 400) {
  return NextResponse.json({ error: "The requested operation could not be completed." }, { status });
}

export function serverErrorResponse() {
  return NextResponse.json({ error: "The service is temporarily unavailable." }, { status: 503 });
}
