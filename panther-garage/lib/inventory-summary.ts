import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffInventorySummary = {
  product_id: string;
  physical_stock: number;
  available_stock: number;
  minimum_stock: number;
};

/**
 * Returns quantity-only stock totals for active authenticated staff.
 * The database function is SECURITY DEFINER but exposes no batch, supplier,
 * or purchase-cost fields, so employee stock visibility does not weaken cost RLS.
 */
export async function staffInventorySummary(
  supabase: SupabaseClient,
): Promise<StaffInventorySummary[]> {
  const { data, error } = await supabase.rpc("staff_inventory_summary");
  if (error) throw new Error(error.message);
  return (data || []) as StaffInventorySummary[];
}
