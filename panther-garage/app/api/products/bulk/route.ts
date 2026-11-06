import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COMPATIBILITY_VALUES = ["SPIRO ELECTRIC", "AMPERSAND ELECTRIC", "FUEL-POWERED", "UNIVERSAL", "UNCONFIRMED"];
const MAX_UPDATES = 200;

type BulkUpdate = {
  id: string;
  record: Record<string, unknown>;
};

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,active")
    .eq("id", user.id)
    .single();
  if (!profile?.active || profile.role !== "BOSS") {
    return NextResponse.json(
      { error: "Only BOSS can edit product prices or classification." },
      { status: 403 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requested = Array.isArray(body.updates) ? body.updates : [];
  if (!requested.length) {
    return NextResponse.json({ error: "No catalogue changes were supplied." }, { status: 400 });
  }
  if (requested.length > MAX_UPDATES) {
    return NextResponse.json(
      { error: `Save at most ${MAX_UPDATES} catalogue rows at a time.` },
      { status: 400 },
    );
  }

  // Validate every row before writing anything, so a typo cannot leave half a
  // bulk edit applied. Duplicate ids are collapsed; the last supplied value wins.
  const merged = new Map<string, Record<string, unknown>>();
  for (const raw of requested) {
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid catalogue row." }, { status: 400 });
    }
    const id = String((raw as any).id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "A product id is required for every row." }, { status: 400 });
    }

    const record = merged.get(id) || {};

    if ((raw as any).category !== undefined) {
      const category = String((raw as any).category || "").trim();
      if (!category) {
        return NextResponse.json({ error: "Category cannot be blank." }, { status: 400 });
      }
      record.category = category;
    }

    if ((raw as any).compatibility !== undefined) {
      const compatibility = String((raw as any).compatibility || "")
        .trim()
        .toUpperCase();
      if (!COMPATIBILITY_VALUES.includes(compatibility)) {
        return NextResponse.json({ error: "Invalid compatibility value." }, { status: 400 });
      }
      record.compatibility = compatibility;
    }

    if ((raw as any).selling_price !== undefined) {
      const price = Number((raw as any).selling_price);
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: "Enter a valid selling price." }, { status: 400 });
      }
      record.selling_price = price;
      record.price_status = price > 0 ? "CONFIRMED" : "PRICE NEEDS REVIEW";
    }

    if (!Object.keys(record).length) {
      return NextResponse.json({ error: "No changes were supplied for a catalogue row." }, { status: 400 });
    }
    merged.set(id, record);
  }

  const updates: BulkUpdate[] = [...merged.entries()].map(([id, record]) => ({ id, record }));
  const results: Array<{
    id: string;
    ok: boolean;
    error?: string;
    product?: unknown;
  }> = [];

  // Keep each database call small so a large review save does not overwhelm
  // PostgREST while still finishing quickly for the ~90 imported parts.
  const chunkSize = 10;
  for (let index = 0; index < updates.length; index += chunkSize) {
    const chunk = updates.slice(index, index + chunkSize);
    const settled = await Promise.all(
      chunk.map(async ({ id, record }) => {
        const { data, error } = await supabase
          .from("products")
          .update(record)
          .eq("id", id)
          .select("id,sku,name,category,compatibility,selling_price,price_status,updated_at")
          .single();
        if (error) return { id, ok: false, error: error.message };
        return { id, ok: true, product: data };
      }),
    );
    results.push(...settled);
  }

  const failed = results.filter((row) => !row.ok);
  const updated = results.length - failed.length;

  return NextResponse.json(
    {
      updated,
      failed: failed.length,
      results,
      error: failed.length
        ? failed[0]?.error || "Some catalogue rows could not be saved."
        : undefined,
    },
    { status: failed.length ? (updated ? 207 : 400) : 200 },
  );
}
