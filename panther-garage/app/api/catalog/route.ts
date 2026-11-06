import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitedResponse, requestKey } from "@/lib/api-security";

export const dynamic = "force-dynamic";

type CatalogueRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  description: string | null;
  compatibility: string | null;
  unit: string | null;
  image_url: string | null;
  keywords: string | null;
  selling_price: number | string | null;
  price_status: string;
  availability: string | null;
  in_stock: boolean | null;
  updated_at: string | null;
};

export async function GET(request: Request) {
  const limited = rateLimit(requestKey(request, "catalog"), 60);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);
  const supabase = await createClient();
  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() || null;
  const category = url.searchParams.get("category")?.trim() || null;
  const compatibility = url.searchParams.get("compatibility")?.trim() || null;
  const availability = url.searchParams.get("availability")?.trim() || null;
  const sort = url.searchParams.get("sort")?.trim() || "name";
  if ([search, category, compatibility, availability].some((value) => value && value.length > 120) || !["name", "price_asc", "price_desc", "newest"].includes(sort)) return NextResponse.json({ error: "Invalid catalogue filters." }, { status: 400 });

  const { data, error } = await supabase.rpc("public_catalogue", {
    p_search: search,
    p_category: category,
    p_compatibility: compatibility,
    p_availability: availability,
    p_sort: sort,
  });

  if (!error && data) {
    const products = data as CatalogueRow[];
    return NextResponse.json(
      {
        products,
        meta: {
          total: products.length,
          categories: Array.from(
            new Set(products.map((p) => p.category).filter(Boolean) as string[]),
          ).sort(),
          compatibilities: Array.from(
            new Set(products.map((p) => p.compatibility).filter(Boolean) as string[]),
          ).sort(),
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  }

  // Backward-compatible read while migration 008 is being applied. Exact stock
  // is deliberately not guessed: availability stays null and the UI says
  // "Check availability" instead of advertising stock that may not exist.
  const missingSchema = /does not exist|schema cache|Could not find the function/i.test(
    error?.message || "",
  );
  if (!missingSchema) {
    return NextResponse.json({ error: "Catalogue is temporarily unavailable." }, { status: 503 });
  }

  const { data: legacy, error: legacyError } = await supabase
    .from("products")
    .select("id,sku,name,category,brand,description,compatibility,unit,image_url,selling_price,updated_at")
    .eq("active", true)
    .order("name");
  if (legacyError) {
    return NextResponse.json({ error: "Catalogue is temporarily unavailable." }, { status: 503 });
  }

  const products = (legacy || []).map((product: any) => ({
    ...product,
    keywords: null,
    price_status:
      Number(product.selling_price) > 0 ? "CONFIRMED" : "PRICE NEEDS REVIEW",
    availability: null,
    in_stock: null,
  }));

  return NextResponse.json(
    {
      products,
      meta: {
        total: products.length,
        categories: Array.from(
          new Set(products.map((p: any) => p.category).filter(Boolean) as string[]),
        ).sort(),
        compatibilities: Array.from(
          new Set(products.map((p: any) => p.compatibility).filter(Boolean) as string[]),
        ).sort(),
      },
      migrationRequired: true,
    },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
  );
}
