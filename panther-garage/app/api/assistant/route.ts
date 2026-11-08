import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invalidBodyResponse, rateLimit, rateLimitedResponse, readJson, requestKey } from "@/lib/api-security";
import {
  aiConfig,
  buildBusinessDigest,
  buildShiftReportsDigest,
  buildSystemPrompt,
  findPlatformResources,
  inferNavigationTarget,
  upstreamErrorMessage,
  validateMessages,
  type ChatMessage,
} from "@/lib/assistant";

export const dynamic = "force-dynamic";

/** Never let a prep step strand the caller: resolve with a fallback on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Reject if a stream goes silent, so the client always gets a final message. */
function readWithIdle<T>(read: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    read.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("IDLE_TIMEOUT")), ms);
    }),
  ]);
}

/** Free health probe: is the assistant wired up and can the provider be reached? */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("active").eq("id", user.id).single();
  if (!profile?.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = aiConfig();
  if (!cfg.configured)
    return NextResponse.json({ configured: false, provider: cfg.provider, model: cfg.model, upstream: "no-key" });
  try {
    // Real end-to-end check: /models answers even with zero balance, so probe
    // one completion token instead (cost is fractions of a cent).
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 1,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return NextResponse.json({ configured: true, provider: cfg.provider, model: cfg.model, upstream: res.ok ? "ok" : `http-${res.status}` });
  } catch {
    return NextResponse.json({ configured: true, provider: cfg.provider, model: cfg.model, upstream: "unreachable" });
  }
}

export async function POST(req: Request) {
  // Chat is heavier than data endpoints: 15 requests/minute per client.
  const { allowed, retryAfter } = rateLimit(requestKey(req, "assistant"), 15);
  if (!allowed) return rateLimitedResponse(retryAfter);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,full_name,active")
    .eq("id", user.id)
    .single();
  if (!profile?.active) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(req, 32 * 1024);
  } catch {
    return invalidBodyResponse(null);
  }
  const validated = validateMessages(body.messages);
  if (!Array.isArray(validated))
    return NextResponse.json({ error: validated }, { status: 400 });
  const messages = validated as ChatMessage[];

  const cfg = aiConfig();
  if (!cfg.configured)
    return NextResponse.json(
      { error: "The AI assistant is not configured yet. Add OLLAMA_API_KEY or DEEPSEEK_API_KEY as a server-only Vercel variable." },
      { status: 503 },
    );

  // Ground the model in live data. The digest is cached for 60s, so follow-up
  // questions skip re-aggregation and the first token arrives fast. If a
  // warehouse query stalls, degrade to an ungrounded answer rather than
  // hanging the request (the answer is still useful; latency is bounded).
  const lastQuestion = messages[messages.length - 1].content;
  const navigationTarget = inferNavigationTarget(lastQuestion, profile.role);
  const [digest, resources, shiftReports] = await withTimeout(
    Promise.all([
      buildBusinessDigest(supabase, profile.role),
      findPlatformResources(supabase, lastQuestion, profile.role),
      buildShiftReportsDigest(supabase, user.id, profile.role),
    ]),
    12_000,
    ["", "", ""] as [string, string, string],
  );

  const upstreamMessages = [
    {
      role: "system",
      content: buildSystemPrompt({
        fullName: profile.full_name || "staff member",
        role: profile.role,
        digest,
        resources,
        shiftReports,
      }),
    },
    ...(navigationTarget
      ? [{ role: "system" as const, content: `SAFE NAVIGATION HINT: The likely workspace for this question is ${navigationTarget}. Use [[NAV:${navigationTarget}]] only if it is the single clear destination.` }]
      : []),
    ...messages,
  ];

  let upstream: Response;
  try {
    // Hard overall cap; stalls surface much sooner via the per-read idle
    // watchdog in pull(), so this only fires for a truly stuck provider call.
    upstream = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: upstreamMessages,
        stream: true,
        temperature: 0.3,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return NextResponse.json({ error: "The AI provider did not respond in time. Try again shortly." }, { status: 504 });
  }

  if (!upstream.ok || !upstream.body) {
    // Drain a small error body for the status mapping only; never forward raw text.
    return NextResponse.json({ error: upstreamErrorMessage(upstream.status) }, { status: upstream.status === 402 ? 402 : 502 });
  }

  // Re-stream as a minimal SSE protocol: data: {"c":"token chunk"} ... data: [DONE]
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = ""; // keeps a partial line between network chunks so no token is ever dropped
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await readWithIdle(reader.read(), 35_000);
        if (done) {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            reader.cancel();
            return;
          }
          try {
            const json = JSON.parse(payload);
            const piece = json?.choices?.[0]?.delta?.content;
            if (typeof piece === "string" && piece)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ c: piece })}\n\n`));
          } catch {
            /* not a JSON payload (e.g. keep-alive comment) — skip */
          }
        }
      } catch (e) {
        const stalled =
          (e instanceof Error && (e.name === "TimeoutError" || e.message === "IDLE_TIMEOUT")) ||
          false;
        const msg = stalled
          ? "The AI response timed out. Try again — shorter questions answer faster."
          : "The AI stream was interrupted.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
        reader.cancel().catch(() => {});
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
