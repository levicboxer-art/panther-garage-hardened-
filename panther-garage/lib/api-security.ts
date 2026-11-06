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

export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("BODY_TOO_LARGE");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(text) as T;
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
