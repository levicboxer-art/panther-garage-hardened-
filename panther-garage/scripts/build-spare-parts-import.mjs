/**
 * Builds the deterministic spare-parts import bundle from the parsed workbook rows.
 *
 * Source rows were extracted from the two current inventory workbooks:
 *   data/source/fuel_powered_moto_spare_parts.xlsx
 *   data/source/Spiro_Garage_Spare_Parts_Inventory.xlsx
 *
 * Both workbooks are now independent inventories, so both create opening stock.
 * A part's catalogue category/compatibility is derived from the workbook it came
 * from (fuel-powered motorcycle or Spiro electric motorcycle). The workbook sell
 * price is carried into the bundle as the BOSS-approved selling price so the
 * storefront can publish it immediately.
 *
 * The extracted JSON keeps the original worksheet row number and the original
 * string values. This script never rewrites product names or quantities.
 *
 * Run: node scripts/build-spare-parts-import.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const sourceDir = path.join(root, "data", "source");

/**
 * Workbook definitions. `classification` is both the catalogue category and the
 * motorcycle compatibility, chosen from the workbook it belongs to:
 *   fuel...xlsx  -> FUEL-POWERED
 *   Spiro...xlsx -> SPIRO ELECTRIC
 * An Ampersand workbook can be added later with classification AMPERSAND ELECTRIC.
 */
const files = [
  {
    fileName: "fuel_powered_moto_spare_parts.xlsx",
    json: "fuel_powered_moto_spare_parts_xlsx.parsed.json",
    role: "PRIMARY",
    sheet: "Spare Parts Inventory",
    classification: "FUEL-POWERED",
    dataStart: 3,
    skuPrefix: "PG-FP",
    columns: {
      name: "A",
      quantity: "B",
      unitCost: "C",
      selling: "D",
      stockValue: "E",
      potential: "F",
    },
    note: "Fuel-powered motorcycle inventory. Creates opening stock.",
  },
  {
    fileName: "Spiro_Garage_Spare_Parts_Inventory.xlsx",
    json: "Spiro_Garage_Spare_Parts_Inventory_xlsx.parsed.json",
    role: "PRIMARY",
    sheet: "Spare Parts Inventory",
    classification: "SPIRO ELECTRIC",
    dataStart: 5,
    skuPrefix: "PG-SP",
    columns: {
      reference: "A",
      name: "B",
      model: "C",
      quantity: "D",
      unitCost: "E",
      selling: "F",
      stockValue: "G",
      potential: "H",
    },
    note: "Spiro electric motorcycle inventory. Creates opening stock.",
  },
];

function readRows(file) {
  const raw = fs
    .readFileSync(path.join(sourceDir, file.json), "utf8")
    .replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function text(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  const raw = text(value).replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeName(value) {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cell(row, column) {
  return column ? row[column] : "";
}

function parseWorkbook(file) {
  const rows = readRows(file);
  const items = [];
  for (const row of rows) {
    const rowNumber = Number(row.row);
    if (!Number.isFinite(rowNumber) || rowNumber < file.dataStart) continue;
    const name = text(cell(row, file.columns.name));
    // Blank rows and the workbook totals row carry no part name.
    if (!name) continue;

    const quantity = numberOrNull(cell(row, file.columns.quantity));
    const unitCost = numberOrNull(cell(row, file.columns.unitCost));
    const suggestedSell = numberOrNull(cell(row, file.columns.selling));
    const stockPurchaseValue = numberOrNull(cell(row, file.columns.stockValue));
    const potentialSalesValue = numberOrNull(cell(row, file.columns.potential));

    items.push({
      sourceFile: file.fileName,
      sourceSheet: file.sheet,
      sourceRow: rowNumber,
      sourceRole: file.role,
      originalName: name,
      originalReference: file.columns.reference ? text(cell(row, file.columns.reference)) || null : null,
      originalModel: file.columns.model ? text(cell(row, file.columns.model)) || null : null,
      quantity,
      unitCost,
      suggestedSell,
      stockPurchaseValue,
      potentialSalesValue,
      recalculatedStockValue:
        quantity !== null && unitCost !== null ? quantity * unitCost : null,
      compatibility: file.classification,
      category: file.classification,
      proposedSku: null,
      decision: "PENDING",
      reviewStatus: "NEEDS_REVIEW",
      approvedSellingPrice: null,
      approvedCategory: null,
      approvedCompatibility: null,
      notes: null,
      conflicts: [],
      hasBlockingConflict: false,
    });
  }
  return items;
}

const parsed = files.map((file) => ({ file, items: parseWorkbook(file) }));
const allItems = parsed.flatMap((entry) => entry.items);

// Stable, human-readable internal SKUs per workbook.
for (const { file, items } of parsed) {
  const skuByName = new Map();
  let sequence = 0;
  for (const item of items) {
    const key = normalizeName(item.originalName);
    if (!skuByName.has(key)) {
      sequence += 1;
      skuByName.set(key, `${file.skuPrefix}-${String(sequence).padStart(3, "0")}`);
    }
    item.proposedSku = skuByName.get(key);
  }
}

const conflicts = [];
function addConflict(item, conflict) {
  const entry = {
    conflictType: conflict.type,
    severity: conflict.severity || "WARNING",
    detail: conflict.detail,
    sourceFile: item.sourceFile,
    sourceRow: item.sourceRow,
    comparisonFile: null,
    comparisonRow: null,
  };
  item.conflicts.push(entry);
  conflicts.push(entry);
  if (entry.severity === "BLOCKING") item.hasBlockingConflict = true;
}

// Item-level validation and preserved-but-not-published values.
for (const item of allItems) {
  if (!item.originalReference) {
    addConflict(item, {
      type: "MISSING_REFERENCE",
      severity: "INFO",
      detail: "The workbook does not supply a part reference; an internal SKU is used instead.",
    });
  }
  if (item.quantity === null || item.quantity <= 0) {
    addConflict(item, {
      type: "MISSING_QUANTITY",
      severity: "WARNING",
      detail:
        "Quantity is blank or zero. The row is preserved for review but is not imported and creates no opening stock.",
    });
    item.decision = "SKIP";
    item.reviewStatus = "SKIPPED";
  }
  if (item.unitCost === null || item.unitCost < 0) {
    addConflict(item, {
      type: "MISSING_COST",
      severity: "WARNING",
      detail:
        "Purchase cost per unit is blank or invalid. The row is preserved for review but is not imported.",
    });
    item.decision = "SKIP";
    item.reviewStatus = "SKIPPED";
  }
  if (item.suggestedSell === null || item.suggestedSell <= 0) {
    addConflict(item, {
      type: "MISSING_SELLING_PRICE",
      severity: "WARNING",
      detail:
        "The workbook sell price is blank. The part is imported but stays PRICE NEEDS REVIEW until a BOSS confirms a price.",
    });
  } else {
    item.approvedSellingPrice = item.suggestedSell;
  }
  if (
    item.suggestedSell !== null &&
    item.unitCost !== null &&
    item.suggestedSell > 0 &&
    item.suggestedSell < item.unitCost
  ) {
    addConflict(item, {
      type: "SELLING_BELOW_COST",
      severity: "WARNING",
      detail: `Workbook sell price ${item.suggestedSell} is below the purchase cost ${item.unitCost}. The source value is preserved; please verify it.`,
    });
  }
  if (
    item.recalculatedStockValue !== null &&
    item.stockPurchaseValue !== null &&
    Math.abs(item.recalculatedStockValue - item.stockPurchaseValue) > 1
  ) {
    addConflict(item, {
      type: "STOCK_VALUE_MISMATCH",
      severity: "WARNING",
      detail: `Workbook stock value ${item.stockPurchaseValue} differs from quantity x cost ${item.recalculatedStockValue}. Opening batches use quantity x cost.`,
    });
  }
  if (item.potentialSalesValue !== null && item.quantity !== null && item.suggestedSell !== null) {
    const calculated = item.quantity * item.suggestedSell;
    if (Math.abs(calculated - item.potentialSalesValue) > 1) {
      addConflict(item, {
        type: "POTENTIAL_VALUE_MISMATCH",
        severity: "INFO",
        detail: `Workbook potential sales value ${item.potentialSalesValue} differs from quantity x sell price ${calculated}. It is preserved for audit only.`,
      });
    }
  }

  if (item.reviewStatus !== "SKIPPED") {
    item.decision = "CREATE";
    item.reviewStatus = "APPROVED";
    item.approvedCategory = item.category;
    item.approvedCompatibility = item.compatibility;
  }
}

// Duplicate names inside a workbook become a second FIFO batch under the same
// product (same proposed SKU). The first occurrence creates the product.
const seenByName = new Map();
for (const item of allItems) {
  if (item.reviewStatus === "SKIPPED") continue;
  const key = `${item.category}#${normalizeName(item.originalName)}`;
  if (seenByName.has(key)) {
    const first = seenByName.get(key);
    addConflict(item, {
      type: "DUPLICATE_NAME",
      severity: "INFO",
      detail: `Same part as row ${first.sourceRow}. It is imported as an additional FIFO batch under SKU ${first.proposedSku}.`,
    });
    item.decision = "ADD_BATCH";
  } else {
    seenByName.set(key, item);
  }
}

// Workbook-level summary checks.
function totals(items) {
  return {
    records: items.length,
    names: new Set(items.map((i) => normalizeName(i.originalName))).size,
    units: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
    purchaseValue: items.reduce(
      (sum, i) => sum + (i.quantity || 0) * (i.unitCost || 0),
      0,
    ),
    workbookStockValue: items.reduce(
      (sum, i) => sum + (i.stockPurchaseValue || 0),
      0,
    ),
    potentialSalesValue: items.reduce(
      (sum, i) => sum + (i.potentialSalesValue || 0),
      0,
    ),
  };
}

const perFile = parsed.map(({ file, items }) => ({
  file,
  items,
  totals: totals(items),
}));
const grandTotals = totals(allItems);

const sourceFiles = perFile.map(({ file, totals: t }) => ({
  fileName: file.fileName,
  sheet: file.sheet,
  role: "PRIMARY",
  rowRange: "",
  ...t,
  note: file.note,
}));
// Row ranges are derived from each workbook's highest parsed row.
perFile.forEach((entry, index) => {
  const maxRow = Math.max(...entry.items.map((i) => i.sourceRow));
  sourceFiles[index].rowRange = `${entry.file.dataStart}-${maxRow}`;
});

for (const { file, totals: t } of perFile) {
  conflicts.push({
    conflictType: "SOURCE_CLASSIFICATION",
    severity: "INFO",
    detail: `All ${t.records} rows from ${file.fileName} are classified as ${file.classification} from the workbook they belong to.`,
    sourceFile: file.fileName,
    sourceRow: null,
    comparisonFile: null,
    comparisonRow: null,
  });
}

for (const item of allItems) {
  item.hasBlockingConflict = item.conflicts.some((c) => c.severity === "BLOCKING");
}

const bundle = {
  generatedAt: new Date().toISOString(),
  primaryFile: files.map((f) => f.fileName).join(", "),
  sourceFiles,
  classificationNotice:
    "Categories and compatibility are derived from the source workbooks: fuel_powered_moto_spare_parts.xlsx is FUEL-POWERED and Spiro_Garage_Spare_Parts_Inventory.xlsx is SPIRO ELECTRIC. An Ampersand workbook follows the same rule as AMPERSAND ELECTRIC when supplied.",
  priceNotice:
    "The workbook sell price is the confirmed customer price and is published on the storefront. Rows without a sell price stay PRICE NEEDS REVIEW. Rows whose sell price is below purchase cost are flagged for BOSS review without changing the source value.",
  totals: {
    records: allItems.length,
    primaryRecords: allItems.length,
    comparisonRecords: 0,
    primaryUnits: grandTotals.units,
    comparisonUnits: 0,
    productsProposed: new Set(
      allItems
        .filter((i) => i.reviewStatus !== "SKIPPED")
        .map((i) => i.proposedSku),
    ).size,
    conflicts: conflicts.length,
    blockingItems: allItems.filter((i) => i.hasBlockingConflict).length,
    missingPrices: allItems.filter((i) => i.suggestedSell === null).length,
  },
  items: allItems,
  conflicts,
};

const outDir = path.join(root, "data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "spare-parts-import.json"),
  JSON.stringify(bundle, null, 2),
  "utf8",
);

console.log("Wrote data/spare-parts-import.json");
console.log(JSON.stringify(bundle.totals, null, 2));
console.log("\nSkipped rows:");
for (const item of allItems.filter((i) => i.reviewStatus === "SKIPPED")) {
  console.log(`${item.sourceFile} row ${item.sourceRow}: ${item.originalName}`);
}
console.log("\nDuplicate (additional batch) rows:");
for (const item of allItems.filter((i) => i.decision === "ADD_BATCH")) {
  console.log(`${item.sourceFile} row ${item.sourceRow}: ${item.originalName} -> ${item.proposedSku}`);
}
