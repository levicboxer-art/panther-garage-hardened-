/**
 * Maintenance helper: converts the source workbooks in data/source into the
 * deterministic row snapshots consumed by build-spare-parts-import.mjs.
 *
 * Kept out of the import runtime on purpose: the bundle build stays dependency
 * free and reproducible from the committed snapshots. Run this only when a
 * workbook is replaced, then run build-spare-parts-import.mjs.
 *
 * Requires the xlsx package, which is not a runtime dependency:
 *   npm i --no-save xlsx
 *   node scripts/extract-source-workbooks.mjs
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const root = path.resolve(process.cwd());
const sourceDir = path.join(root, "data", "source");
const targets = [
  {
    file: "fuel_powered_moto_spare_parts.xlsx",
    json: "fuel_powered_moto_spare_parts_xlsx.parsed.json",
  },
  {
    file: "Spiro_Garage_Spare_Parts_Inventory.xlsx",
    json: "Spiro_Garage_Spare_Parts_Inventory_xlsx.parsed.json",
  },
];

for (const target of targets) {
  const wb = XLSX.readFile(path.join(sourceDir, target.file));
  const sheetName = "Spare Parts Inventory";
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`${target.file} has no "${sheetName}" sheet`);

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });

  const rows = matrix.map((cells, index) => {
    const row = { row: index + 1 };
    for (let c = 0; c < 8; c += 1) {
      const letter = String.fromCharCode(65 + c);
      row[letter] = cells[c] === undefined || cells[c] === null ? "" : String(cells[c]);
    }
    return row;
  });

  fs.writeFileSync(
    path.join(sourceDir, target.json),
    JSON.stringify(rows, null, 2),
    "utf8",
  );
  console.log(`Wrote ${target.json} (${rows.length} rows)`);
}
