import rawBundle from "@/data/spare-parts-import.json";

export type SourceConflict = {
  conflictType: string;
  severity: "INFO" | "WARNING" | "BLOCKING";
  detail: string;
  sourceFile: string | null;
  sourceRow: number | null;
  comparisonFile: string | null;
  comparisonRow: number | null;
};

export type SourceItem = {
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  sourceRole: "PRIMARY" | "COMPARISON";
  originalName: string;
  originalReference: string | null;
  originalModel: string | null;
  quantity: number | null;
  unitCost: number | null;
  suggestedSell: number | null;
  stockPurchaseValue: number | null;
  potentialSalesValue: number | null;
  recalculatedStockValue: number | null;
  compatibility: string;
  category: string;
  proposedSku: string | null;
  decision: "PENDING" | "CREATE" | "MATCH" | "ADD_BATCH" | "SKIP";
  reviewStatus: "NEEDS_REVIEW" | "APPROVED" | "SKIPPED";
  approvedSellingPrice: number | null;
  approvedCategory: string | null;
  approvedCompatibility: string | null;
  notes: string | null;
  conflicts: SourceConflict[];
  hasBlockingConflict: boolean;
};

export type SourceFileSummary = {
  fileName: string;
  sheet: string;
  role: "PRIMARY" | "COMPARISON";
  rowRange: string;
  records: number;
  names: number;
  units: number;
  purchaseValue: number;
  workbookStockValue: number;
  potentialSalesValue: number;
  note: string;
};

export type ImportBundle = {
  generatedAt: string;
  primaryFile: string;
  sourceFiles: SourceFileSummary[];
  classificationNotice: string;
  priceNotice: string;
  totals: {
    records: number;
    primaryRecords: number;
    comparisonRecords: number;
    primaryUnits: number;
    comparisonUnits: number;
    productsProposed: number;
    conflicts: number;
    blockingItems: number;
    missingPrices: number;
  };
  items: SourceItem[];
  conflicts: SourceConflict[];
};

export const importBundle = rawBundle as unknown as ImportBundle;

export type StagingPayload = ReturnType<typeof buildStagingPayload>;

export function buildStagingPayload() {
  const bundle = importBundle;
  const seen = new Set<string>();
  for (const item of bundle.items) {
    const key = `${item.sourceFile}#${item.sourceRow}`;
    if (seen.has(key)) throw new Error(`Duplicate source row in import bundle: ${key}`);
    seen.add(key);
    if (!item.originalName?.trim()) throw new Error(`Row ${item.sourceRow} has no product name`);
    if (item.sourceRole !== "PRIMARY" && item.sourceRole !== "COMPARISON") {
      throw new Error(`Row ${item.sourceRow} has an invalid source role`);
    }
  }
  if (!bundle.items.length) throw new Error("The import bundle is empty");

  const items = bundle.items.map((item) => ({
    source_file: item.sourceFile,
    source_sheet: item.sourceSheet,
    source_row: item.sourceRow,
    source_role: item.sourceRole,
    original_name: item.originalName,
    original_reference: item.originalReference,
    original_model: item.originalModel,
    quantity: item.quantity,
    unit_cost: item.unitCost,
    suggested_sell: item.suggestedSell,
    stock_purchase_value: item.stockPurchaseValue,
    potential_sales_value: item.potentialSalesValue,
    recalculated_stock_value: item.recalculatedStockValue,
    compatibility: item.compatibility,
    category: item.category,
    proposed_sku: item.proposedSku,
    decision: item.decision,
    review_status: item.reviewStatus,
    approved_selling_price: item.approvedSellingPrice,
    approved_category: item.approvedCategory,
    approved_compatibility: item.approvedCompatibility,
    notes: item.notes,
    // Full conflict detail is staged in inventory_import_conflicts and linked
    // to the item. Keeping this empty avoids sending the same payload twice.
    conflicts: [],
    has_blocking_conflict: item.hasBlockingConflict,
  }));

  return {
    primaryFile: bundle.primaryFile,
    sourceSummary: {
      generatedAt: bundle.generatedAt,
      sourceFiles: bundle.sourceFiles,
      classificationNotice: bundle.classificationNotice,
      priceNotice: bundle.priceNotice,
      totals: bundle.totals,
    },
    items,
    conflicts: bundle.conflicts,
  };
}
