import { requireProfile } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const { user, profile } = await requireProfile();
  const supabase = await createClient();
  const { data: products, error } = await supabase.from("products").select("id,sku,name,category,image_url,selling_price,minimum_stock,active").order("name");
  if (error) console.error("PGMS products query:", error.message);
  const { data: stock } = await supabase.from("inventory_summary").select("product_id,physical_stock,available_stock,minimum_stock");
  const stockById: Record<string, any> = {};
  for (const item of stock || []) stockById[item.product_id] = item;
  const rows = (products || []).map((p:any) => ({ ...p, stock: Number(stockById[p.id]?.physical_stock || 0), available_stock: Number(stockById[p.id]?.available_stock || 0) }));
  return <DashboardClient profile={{ id: profile.id, full_name: profile.full_name, role: profile.role, email: user.email || "" }} initialProducts={rows} />;
}
