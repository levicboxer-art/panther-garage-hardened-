import { requireProfile } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";
import { createClient } from "@/lib/supabase/server";
import { staffInventorySummary } from "@/lib/inventory-summary";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id,sku,name,category,image_url,selling_price,minimum_stock,active")
    .order("name");
  if (error) console.error("PGMS products query:", error.message);

  let stock: Awaited<ReturnType<typeof staffInventorySummary>> = [];
  try {
    stock = await staffInventorySummary(supabase);
  } catch (stockError) {
    console.error(
      "PGMS staff inventory summary:",
      stockError instanceof Error ? stockError.message : "unknown error",
    );
  }
  const stockById: Record<string, (typeof stock)[number]> = {};
  for (const item of stock) stockById[item.product_id] = item;
  const rows = (products || []).map((product) => ({
    ...product,
    stock: Number(stockById[product.id]?.physical_stock || 0),
    available_stock: Number(stockById[product.id]?.available_stock || 0),
  }));

  return (
    <DashboardClient
      profile={{
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        email: user.email || "",
      }}
      initialProducts={rows}
    />
  );
}
