import ExcelJS from "exceljs";
import sharp from "sharp";
import { join } from "node:path";
import { readFileSync } from "node:fs";

type Row = Record<string, any>;
type TrendPoint = { month: string; revenue: number; collected: number };
type Slice = { label: string; value: number };

const NAVY = "123A63";
const NAVY_DARK = "092B4B";
const BLUE = "2F75B5";
const LIGHT_BLUE = "DCEAF5";
const PALE_BLUE = "EDF5FB";
const GREEN = "20A36A";
const LIGHT_GREEN = "D9F2D0";
const RED = "C83E3E";
const LIGHT_RED = "F8D7DA";
const AMBER = "F0A323";
const LIGHT_AMBER = "FFF0C2";
const TEAL = "2CBFAE";
const PURPLE = "8865D9";
const BORDER = "A9BED0";
const WHITE = "FFFFFFFF";
const INK = "152536";
const MUTED = "526577";
const PALETTE = [BLUE, AMBER, TEAL, PURPLE, GREEN, RED];
const COLUMNS = [2.5, 18, 14, 12, 18, 14, 7, 18, 14, 12, 18, 14];

function escapeXml(value: unknown) {
  return String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] || char);
}

function compactMoney(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(Math.round(value));
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

function monthLabel(value: string) {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
}

function renderSalesTrend(data: TrendPoint[]) {
  const width = 620;
  const height = 280;
  const left = 62;
  const right = 20;
  const top = 22;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const clean = data.slice(-6);
  const max = Math.max(1, ...clean.flatMap((item) => [Number(item.revenue) || 0, Number(item.collected) || 0]));
  const ticks = Array.from({ length: 5 }, (_, index) => (max * index) / 4);
  const step = clean.length ? plotWidth / clean.length : plotWidth;
  const barWidth = Math.min(42, step * 0.48);
  const grid = ticks.map((tick) => {
    const y = top + plotHeight - (tick / max) * plotHeight;
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#D9E4ED" stroke-width="1"/><text x="${left - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="#526577">${escapeXml(compactMoney(tick))}</text>`;
  }).join("");
  const bars = clean.map((item, index) => {
    const x = left + step * (index + 0.5);
    const revenue = Math.max(0, Number(item.revenue) || 0);
    const collected = Math.max(0, Number(item.collected) || 0);
    const barHeight = (revenue / max) * plotHeight;
    const y = top + plotHeight - barHeight;
    return `<rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="#${BLUE}"/><text x="${x}" y="${height - 20}" text-anchor="middle" font-size="12" fill="#263D52">${escapeXml(monthLabel(item.month))}</text><circle cx="${x}" cy="${top + plotHeight - (collected / max) * plotHeight}" r="4" fill="#${GREEN}"/>`;
  }).join("");
  const linePoints = clean.map((item, index) => {
    const x = left + step * (index + 0.5);
    const collected = Math.max(0, Number(item.collected) || 0);
    return `${x},${top + plotHeight - (collected / max) * plotHeight}`;
  }).join(" ");
  const legend = `<rect x="${left + 12}" y="${height - 7}" width="13" height="9" rx="2" fill="#${BLUE}"/><text x="${left + 31}" y="${height + 1}" font-size="12" fill="#334E68">Sales revenue</text><line x1="${left + 156}" y1="${height - 3}" x2="${left + 177}" y2="${height - 3}" stroke="#${GREEN}" stroke-width="3"/><text x="${left + 184}" y="${height + 1}" font-size="12" fill="#334E68">Collected</text>`;
  const empty = clean.length ? "" : `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="18" fill="#526577">No sales recorded in this six-month window</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/>${grid}${bars}${clean.length ? `<polyline points="${linePoints}" fill="none" stroke="#${GREEN}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ""}${empty}${legend}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function renderDonutChart(values: Slice[]) {
  const width = 300;
  const height = 280;
  const cx = 102;
  const cy = 126;
  const radius = 66;
  const stroke = 22;
  const total = values.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0);
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = total > 0 ? values.map((item, index) => {
    const ratio = Math.max(0, Number(item.value) || 0) / total;
    const length = circumference * ratio;
    const circle = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#${PALETTE[index % PALETTE.length]}" stroke-width="${stroke}" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += length;
    return circle;
  }).join("") : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#D9E4ED" stroke-width="${stroke}"/>`;
  const healthy = Number(values.find((item) => item.label === "Healthy")?.value || 0);
  const percentage = total ? Math.round((healthy / total) * 100) : 0;
  const legend = values.map((item, index) => `<rect x="194" y="${70 + index * 32}" width="12" height="12" rx="3" fill="#${PALETTE[index % PALETTE.length]}"/><text x="214" y="${81 + index * 32}" font-size="12" fill="#263D52">${escapeXml(item.label)}</text><text x="282" y="${81 + index * 32}" text-anchor="end" font-size="12" font-weight="700" fill="#263D52">${escapeXml(item.value)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/>${circles}<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="27" font-weight="700" fill="#${NAVY}">${percentage}%</text><text x="${cx}" y="${cy + 23}" text-anchor="middle" font-size="12" fill="#526577">healthy stock</text>${legend}<text x="${cx}" y="${height - 15}" text-anchor="middle" font-size="12" font-weight="700" fill="#263D52">${total ? `${total} active products` : "No active products"}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function piePath(cx: number, cy: number, radius: number, start: number, end: number) {
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`;
}

function renderServiceDemand(data: Slice[]) {
  const width = 580;
  const height = 300;
  const cx = 156;
  const cy = 146;
  const radius = 104;
  const clean = data.filter((item) => Number(item.value) > 0).slice(0, 5);
  const total = clean.reduce((sum, item) => sum + Number(item.value), 0);
  let angle = -Math.PI / 2;
  const slices = total > 0 && clean.length === 1
    ? `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#${PALETTE[0]}"/>`
    : total > 0 ? clean.map((item, index) => {
    const end = angle + (Number(item.value) / total) * 2 * Math.PI;
    const path = `<path d="${piePath(cx, cy, radius, angle, end)}" fill="#${PALETTE[index % PALETTE.length]}" stroke="#FFFFFF" stroke-width="2"/>`;
    angle = end;
    return path;
  }).join("") : "";
  const legend = clean.map((item, index) => {
    const y = 84 + index * 38;
    const share = total ? `${Math.round((item.value / total) * 100)}%` : "0%";
    return `<rect x="330" y="${y - 12}" width="14" height="14" rx="4" fill="#${PALETTE[index % PALETTE.length]}"/><text x="354" y="${y}" font-size="13" fill="#263D52">${escapeXml(item.label.length > 27 ? `${item.label.slice(0, 24)}…` : item.label)}</text><text x="550" y="${y}" text-anchor="end" font-size="13" font-weight="700" fill="#263D52">${escapeXml(share)} · ${escapeXml(item.value)}</text>`;
  }).join("");
  const empty = total ? "" : `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="18" fill="#526577">No repair jobs recorded for this period</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#FFFFFF"/>${slices}${legend}${empty}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function border() {
  const side = { style: "thin" as const, color: { argb: BORDER } };
  return { top: side, bottom: side, left: side, right: side };
}

function addCanvas(workbook: ExcelJS.Workbook, name: string, printArea: string, fitHeight = 1) {
  const sheet = workbook.addWorksheet(name);
  COLUMNS.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.properties.defaultRowHeight = 18;
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: fitHeight,
    margins: { left: 0.22, right: 0.22, top: 0.3, bottom: 0.35, header: 0.12, footer: 0.18 },
  };
  sheet.pageSetup.printArea = printArea;
  sheet.headerFooter.oddFooter = "&LPanther Legacy Garage · Kigali, Rwanda&CDrive Smarter. Grow Stronger.&RConfidential Report · Page &P of &N";
  return sheet;
}

function addHeader(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, report: Row, pageTitle: string, logoImageId: number | null) {
  [1, 2, 3, 4].forEach((row) => { sheet.getRow(row).height = row === 1 ? 28 : 20; });
  sheet.mergeCells("C1:I1");
  sheet.mergeCells("C2:I2");
  sheet.mergeCells("C3:I3");
  const brand = sheet.getCell("C1");
  brand.value = "PANTHER LEGACY GARAGE";
  brand.font = { name: "Arial", size: 18, bold: true, color: { argb: NAVY_DARK } };
  const title = sheet.getCell("C2");
  title.value = pageTitle;
  title.font = { name: "Arial", size: 14, bold: true, color: { argb: NAVY } };
  const tagline = sheet.getCell("C3");
  tagline.value = "Drive Smarter. Grow Stronger.";
  tagline.font = { name: "Arial", size: 10, bold: true, italic: true, color: { argb: INK } };
  const period = report.meta?.from && report.meta?.to ? `${formatDate(report.meta.from)} – ${formatDate(report.meta.to)}` : "Not available";
  const month = report.meta?.to ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${report.meta.to.slice(0, 10)}T00:00:00.000Z`)) : "Business Report";
  const generatedAt = report.meta?.generated_at ? new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Kigali" }).format(new Date(report.meta.generated_at)) : "Not available";
  const periodValues = [[`Reporting Period: ${month}`], [`From: ${formatDate(report.meta?.from || "")}`], [`To: ${formatDate(report.meta?.to || "")}`], [`Generated: ${generatedAt}`]];
  periodValues.forEach(([value], index) => {
    const row = index + 1;
    sheet.mergeCells(row, 11, row, 12);
    const cell = sheet.getCell(row, 11);
    cell.value = value;
    cell.font = { name: "Arial", size: index === 0 ? 9 : 8, bold: index === 0, color: { argb: index === 0 ? NAVY_DARK : INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALE_BLUE } };
    cell.border = border();
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  if (logoImageId !== null) sheet.addImage(logoImageId, { tl: { col: 1.05, row: 0.1 }, ext: { width: 78, height: 78 } });
  return period;
}

function addSectionBar(sheet: ExcelJS.Worksheet, row: number, title: string, startCol: number, endCol: number) {
  sheet.mergeCells(row, startCol, row, endCol);
  for (let col = startCol; col <= endCol; col += 1) {
    const cell = sheet.getCell(row, col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.border = border();
  }
  const cell = sheet.getCell(row, startCol);
  cell.value = title.toUpperCase();
  cell.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(row).height = 22;
}

function addTable(sheet: ExcelJS.Worksheet, headerRow: number, startCol: number, headers: string[], rows: unknown[][], options: { moneyCols?: number[]; moneyCell?: (row: unknown[], columnIndex: number) => boolean; percentCols?: number[]; highlight?: (row: unknown[]) => string | null } = {}) {
  headers.forEach((label, index) => {
    const cell = sheet.getCell(headerRow, startCol + index);
    cell.value = label;
    cell.font = { name: "Arial", size: 8, bold: true, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
    cell.border = border();
    cell.alignment = { vertical: "middle", horizontal: index === 0 ? "left" : "center", wrapText: true };
  });
  sheet.getRow(headerRow).height = 30;
  rows.forEach((values, rowIndex) => {
    const rowNum = headerRow + rowIndex + 1;
    const fill = options.highlight?.(values) || (rowIndex % 2 ? "F6F9FC" : "FFFFFFFF");
    values.forEach((raw, colIndex) => {
      const cell = sheet.getCell(rowNum, startCol + colIndex);
      cell.value = raw === null || raw === undefined ? "Not available" : raw as ExcelJS.CellValue;
      cell.font = { name: "Arial", size: 8, color: { argb: INK } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = border();
      cell.alignment = { vertical: "middle", horizontal: typeof raw === "number" ? "right" : "left", wrapText: true };
      if (typeof raw === "number" && (options.moneyCols?.includes(colIndex) || options.moneyCell?.(values, colIndex))) cell.numFmt = '"RWF "#,##0;[Red]("RWF "#,##0)';
      if (typeof raw === "number" && options.percentCols?.includes(colIndex)) cell.numFmt = "0.0%";
    });
    sheet.getRow(rowNum).height = 20;
  });
  return headerRow + rows.length;
}

function addKpi(sheet: ExcelJS.Worksheet, startCol: number, label: string, value: unknown, footnote: string, fill: string, negative = false) {
  const endCol = startCol + 1;
  sheet.mergeCells(7, startCol, 7, endCol);
  sheet.mergeCells(8, startCol, 8, endCol);
  sheet.mergeCells(9, startCol, 9, endCol);
  [7, 8, 9].forEach((row) => {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = border();
    }
  });
  const labelCell = sheet.getCell(7, startCol);
  labelCell.value = label;
  labelCell.font = { name: "Arial", size: 9, bold: true, color: { argb: INK } };
  labelCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  const valueCell = sheet.getCell(8, startCol);
  valueCell.value = value === null || value === undefined ? "Not available" : typeof value === "number" ? value : String(value);
  valueCell.font = { name: "Arial", size: 13, bold: true, color: { argb: negative ? RED : NAVY_DARK } };
  valueCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  if (typeof value === "number") valueCell.numFmt = '"RWF "#,##0;[Red]("RWF "#,##0)';
  const footCell = sheet.getCell(9, startCol);
  footCell.value = footnote;
  footCell.font = { name: "Arial", size: 8, bold: true, color: { argb: negative ? RED : GREEN } };
  footCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function addImage(sheet: ExcelJS.Worksheet, imageId: number, startCol: number, startRow: number, width: number, height: number) {
  sheet.addImage(imageId, { tl: { col: startCol - 1, row: startRow - 1 }, ext: { width, height }, editAs: "oneCell" });
}

function valueOrUnavailable(value: unknown) {
  return value === null || value === undefined ? "Not available" : value;
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: Row, images: { trend: number; inventory: number }, logoImageId: number | null) {
  const sheet = addCanvas(workbook, "Executive Summary", "A1:L42", 1);
  addHeader(workbook, sheet, report, "Monthly Business Performance Report", logoImageId);
  addSectionBar(sheet, 5, "Executive Summary", 2, 12);
  const k = report.executive_summary || {};
  const fin = report.financial || {};
  const revenueChange = k.revenue_change_pct === null || k.revenue_change_pct === undefined ? "No comparable previous period" : `${k.revenue_change_pct >= 0 ? "▲" : "▼"} ${Math.abs(k.revenue_change_pct)}% vs previous period`;
  addKpi(sheet, 2, "Total Sales Revenue", k.total_sales_revenue, revenueChange, LIGHT_GREEN);
  addKpi(sheet, 5, "Payments Collected", k.total_successful_payments_collected, "Recorded sale collections only", LIGHT_BLUE);
  addKpi(sheet, 8, "Gross Profit", k.gross_profit, fin.gross_profit_margin_pct === null || fin.gross_profit_margin_pct === undefined ? "Not available – cost data incomplete" : `${fin.gross_profit_margin_pct}% gross margin`, fin.gross_profit === null ? LIGHT_AMBER : LIGHT_GREEN);
  const result = k.net_operating_result;
  addKpi(sheet, 11, "Net Result", result, k.result_status || "Not available", result !== null && result < 0 ? LIGHT_RED : LIGHT_GREEN, result !== null && result < 0);
  [7, 8, 9].forEach((row) => { sheet.getRow(row).height = row === 8 ? 30 : 23; });

  addSectionBar(sheet, 11, "Sales Trend (Last 6 Months)", 2, 6);
  addSectionBar(sheet, 11, "Inventory Health", 8, 9);
  addSectionBar(sheet, 11, "Key Alerts", 11, 12);
  addImage(sheet, images.trend, 2, 12, 418, 178);
  addImage(sheet, images.inventory, 8, 12, 200, 178);
  const alerts = (report.insights || []).slice(0, 3);
  if (!alerts.length) {
    sheet.mergeCells("K12:L14");
    sheet.getCell("K12").value = "No management alerts were generated for this period.";
    sheet.getCell("K12").font = { name: "Arial", size: 9, color: { argb: MUTED } };
    sheet.getCell("K12").alignment = { vertical: "middle", wrapText: true };
  } else {
    alerts.forEach((alert: Row, index: number) => {
      const row = 12 + index * 3;
      sheet.mergeCells(row, 11, row, 12);
      sheet.mergeCells(row + 1, 11, row + 1, 12);
      const color = alert.severity === "RED" ? RED : alert.severity === "AMBER" ? AMBER : BLUE;
      const title = sheet.getCell(row, 11);
      title.value = `${alert.severity || "INFO"}: ${alert.issue || "Management note"}`;
      title.font = { name: "Arial", size: 8, bold: true, color: { argb: color } };
      title.alignment = { vertical: "middle", wrapText: true };
      const detail = sheet.getCell(row + 1, 11);
      detail.value = `${alert.metric || ""}${alert.recommended_action ? ` · ${alert.recommended_action}` : ""}`;
      detail.font = { name: "Arial", size: 7, color: { argb: MUTED } };
      detail.alignment = { vertical: "middle", wrapText: true };
      sheet.getRow(row).height = 26;
      sheet.getRow(row + 1).height = 30;
    });
  }

  addSectionBar(sheet, 23, "Financial Performance", 2, 6);
  addSectionBar(sheet, 23, "Payment Collection", 8, 12);
  const grossSales = Number(fin.gross_sales || 0);
  const financialRows = [
    ["Gross Sales", valueOrUnavailable(fin.gross_sales), grossSales ? 1 : null, "", ""],
    ["Discounts", valueOrUnavailable(fin.discounts), grossSales ? Number(fin.discounts || 0) / grossSales : null, "", ""],
    ["Net Sales Revenue", valueOrUnavailable(fin.net_sales_revenue), grossSales ? Number(fin.net_sales_revenue || 0) / grossSales : null, revenueChange, ""],
    ["Cost of Goods Sold", valueOrUnavailable(fin.cost_of_goods_sold), grossSales && fin.cost_of_goods_sold !== null ? Number(fin.cost_of_goods_sold) / grossSales : null, "", ""],
    ["Gross Profit", valueOrUnavailable(fin.gross_profit), grossSales && fin.gross_profit !== null ? Number(fin.gross_profit) / grossSales : null, "", fin.result_status || ""],
    ["Operating Expenses", valueOrUnavailable(fin.operating_expenses), grossSales ? Number(fin.operating_expenses || 0) / grossSales : null, k.expense_change_pct === null || k.expense_change_pct === undefined ? "" : `${k.expense_change_pct}% vs previous period`, ""],
    ["Net Result (Profit/Loss)", valueOrUnavailable(fin.net_operating_result), grossSales && fin.net_operating_result !== null ? Number(fin.net_operating_result) / grossSales : null, "", fin.result_status || ""],
  ];
  addTable(sheet, 24, 2, ["Category", "Amount (RWF)", "% of Sales", "vs Previous", "Status"], financialRows, {
    moneyCols: [1],
    percentCols: [2],
    highlight: (row) => String(row[0]).includes("Gross Profit") ? LIGHT_GREEN : String(row[0]).includes("Net Result") && fin.result_status === "LOSS" ? LIGHT_RED : null,
  });
  const payRows = (report.payments?.by_method || []).slice(0, 5).map((item: Row) => [item.method, item.count, item.amount, report.payments.successful_value ? Number(item.amount) / Number(report.payments.successful_value) : 0]);
  payRows.push(["Total Collected", report.payments?.successful_count ?? 0, report.payments?.successful_value ?? 0, report.payments?.successful_value ? 1 : 0]);
  addTable(sheet, 24, 8, ["Method", "Transactions", "Amount (RWF)", "Share"], payRows, { moneyCols: [2], percentCols: [3], highlight: (row) => String(row[0]) === "Total Collected" ? LIGHT_BLUE : null });

  addSectionBar(sheet, 34, "Inventory Overview", 2, 6);
  addSectionBar(sheet, 34, "Top 5 Best-Selling Spare Parts", 8, 12);
  const inventory = report.inventory?.summary || {};
  const inventoryRows = [
    ["Total Products", inventory.distinct_products ?? 0],
    ["Total Units in Stock", inventory.units_in_stock ?? 0],
    ["Stock Purchase Value", inventory.stock_purchase_value ?? 0],
    ["Potential Sales Value", inventory.estimated_potential_sales_value ?? 0],
    ["Low Stock Items", inventory.low_stock_products ?? 0],
    ["Out of Stock Items", inventory.out_of_stock_products ?? 0],
  ];
  addTable(sheet, 35, 2, ["Metric", "Value"], inventoryRows, { moneyCell: (row, col) => col === 1 && String(row[0]).includes("Value"), highlight: (row) => String(row[0]).includes("Out of Stock") && Number(row[1]) > 0 ? LIGHT_RED : String(row[0]).includes("Low Stock") && Number(row[1]) > 0 ? LIGHT_AMBER : null });
  const topProducts = [...(report.sales?.product_sales || [])].sort((a: Row, b: Row) => Number(b.revenue || 0) - Number(a.revenue || 0)).slice(0, 5)
    .map((item: Row) => [item.product_name || "Unknown product", item.units, item.revenue]);
  addTable(sheet, 35, 8, ["Product", "Qty Sold", "Revenue (RWF)"], topProducts, { moneyCols: [2] });
  return sheet;
}

function addPerformanceSheet(workbook: ExcelJS.Workbook, report: Row, demandImageId: number, logoImageId: number | null) {
  const sheet = addCanvas(workbook, "Performance Detail", "A1:L45", 1);
  addHeader(workbook, sheet, report, "Monthly Business Performance Report · Detail", logoImageId);
  addSectionBar(sheet, 6, "Repair & Service Performance", 2, 6);
  addSectionBar(sheet, 6, "Services Demand", 8, 12);
  const repairSummary = report.repairs?.summary || {};
  const repairRows = [
    ["Total Repair Jobs", repairSummary.total_jobs ?? 0],
    ["Completed Repairs", repairSummary.completed_jobs ?? 0],
    ["Pending Repairs", repairSummary.pending_jobs ?? 0],
    ["Repair Revenue", repairSummary.repair_service_revenue ?? 0],
    ["Average Completion Time", repairSummary.average_completion_days === null || repairSummary.average_completion_days === undefined ? "Not available" : `${repairSummary.average_completion_days} days`],
  ];
  addTable(sheet, 7, 2, ["Metric", "Value"], repairRows, { moneyCell: (row, col) => col === 1 && String(row[0]).includes("Revenue") });
  addImage(sheet, demandImageId, 8, 7, 386, 196);

  addSectionBar(sheet, 18, "Expenses & Procurement", 2, 6);
  addSectionBar(sheet, 18, "Customer Performance", 8, 12);
  const expenses = report.expenses || {};
  const expenseRows = (expenses.by_category || []).slice(0, 5).map((item: Row) => [item.category || "Unclassified", item.amount, item.count]);
  expenseRows.push(["Supplier Purchases (inventory; not OPEX)", expenses.summary?.supplier_purchases ?? 0, expenses.summary?.purchase_orders ?? 0]);
  expenseRows.push(["Total Approved Operating Expenses", expenses.summary?.total_expenses ?? 0, ""]);
  addTable(sheet, 19, 2, ["Category / Procurement", "Amount (RWF)", "Records"], expenseRows, {
    moneyCols: [1],
    highlight: (row) => String(row[0]).startsWith("Total Approved") ? LIGHT_RED : String(row[0]).startsWith("Supplier") ? LIGHT_BLUE : null,
  });
  const customer = report.customers || {};
  const customerRows = [
    ["Total Customers", customer.registered ?? 0],
    ["New Customers", customer.new_customers ?? 0],
    ["Returning Customers", customer.returning_customers ?? 0],
    ["Average Order Value", customer.average_order_value ?? 0],
    ["Outstanding Balances", customer.outstanding_balances ?? 0],
  ];
  addTable(sheet, 19, 8, ["Metric", "Value"], customerRows, { moneyCell: (row, col) => col === 1 && /Order Value|Balances/.test(String(row[0])) });

  addSectionBar(sheet, 28, "Top Performing Products & Services", 2, 12);
  addSectionBar(sheet, 29, "Top Products by Revenue", 2, 6);
  addSectionBar(sheet, 29, "Top Services by Revenue", 8, 12);
  const products = [...(report.sales?.product_sales || [])].sort((a: Row, b: Row) => Number(b.revenue || 0) - Number(a.revenue || 0)).slice(0, 5)
    .map((item: Row) => [item.product_name || "Unknown product", item.revenue, item.units]);
  addTable(sheet, 30, 2, ["Product", "Revenue (RWF)", "Qty Sold"], products, { moneyCols: [1] });
  const services = (report.repairs?.service_revenue || []).slice(0, 5).map((item: Row) => [item.service, item.revenue, item.jobs]);
  addTable(sheet, 30, 8, ["Recorded service / issue", "Revenue (RWF)", "Jobs"], services, { moneyCols: [1] });

  addSectionBar(sheet, 37, "Management Insights & Recommendations", 2, 12);
  const insights = (report.insights || []).slice(0, 6).map((item: Row) => [item.severity || "INFO", item.issue || "Management note", item.metric || "", item.recommended_action || ""]);
  if (!insights.length) insights.push(["INFO", "No alerts were generated for this period.", "", "Continue monitoring sales, stock and outstanding balances."]);
  const insightEndRow = addTable(sheet, 38, 2, ["Status", "Insight", "Evidence", "Recommended Action"], insights, {
    highlight: (row) => row[0] === "RED" ? LIGHT_RED : row[0] === "AMBER" ? LIGHT_AMBER : row[0] === "INFO" ? PALE_BLUE : null,
  });
  sheet.mergeCells(38, 5, 38, 12);
  for (let rowNum = 39; rowNum <= insightEndRow; rowNum += 1) {
    sheet.mergeCells(rowNum, 5, rowNum, 12);
    sheet.getCell(rowNum, 5).alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(rowNum).height = 30;
  }
  return sheet;
}

function addActivitySheet(workbook: ExcelJS.Workbook, report: Row, logoImageId: number | null) {
  const sheet = addCanvas(workbook, "Transaction Detail", "A1:L50000", 0);
  addHeader(workbook, sheet, report, "Monthly Business Performance Report · Records", logoImageId);
  sheet.mergeCells("B5:L5");
  sheet.getCell("B5").value = "Supporting records for the summary pages. Figures are drawn from recorded PGMS transactions; purchase orders are shown separately from operating expenses.";
  sheet.getCell("B5").font = { name: "Arial", size: 8, italic: true, color: { argb: MUTED } };
  sheet.getCell("B5").alignment = { wrapText: true };
  sheet.getRow(5).height = 28;
  let row = 7;
  const addDetailTable = (title: string, headers: string[], rows: unknown[][], moneyCols: number[] = []) => {
    addSectionBar(sheet, row, title, 2, Math.min(12, 1 + headers.length));
    row += 1;
    const final = addTable(sheet, row, 2, headers, rows, { moneyCols });
    row = Math.max(row + rows.length + 2, final + 2);
  };
  const sales = (report.sales?.invoices || []).map((item: Row) => [item.invoice, item.date, item.total, item.discount, item.amount_paid, item.balance_due, item.payment_method]);
  addDetailTable("Sales Invoices & Collections", ["Invoice", "Date", "Total (RWF)", "Discount (RWF)", "Collected (RWF)", "Balance (RWF)", "Method"], sales, [2, 3, 4, 5]);
  const repairs = (report.repairs?.jobs || []).map((item: Row) => [item.repair_reference, item.service_type, item.status, item.received_date, item.completion_date, item.labour_charge, item.parts_charge, item.total_charge]);
  addDetailTable("Repair Jobs", ["Reference", "Recorded issue / service", "Status", "Received", "Completed", "Labour (RWF)", "Parts (RWF)", "Total (RWF)"], repairs, [5, 6, 7]);
  const expenses = (report.expenses?.transactions || []).map((item: Row) => [item.date, item.reference, item.category, item.description, item.amount, item.status, item.payment_method]);
  addDetailTable("Operating Expense Transactions", ["Date", "Reference", "Category", "Description", "Amount (RWF)", "Status", "Method"], expenses, [4]);
  const purchases = (report.purchases || []).map((item: Row) => [item.purchase_order, item.date, item.status, item.subtotal, item.accounting_treatment]);
  addDetailTable("Supplier Purchase Orders", ["Purchase Order", "Date", "Status", "Subtotal (RWF)", "Accounting Treatment"], purchases, [3]);
  const movements = (report.inventory?.movements || []).map((item: Row) => [item.created_at, item.movement_type, item.product_id, item.quantity_delta, item.reason, item.reference_type, item.reference_id]);
  addDetailTable("Inventory Movements", ["Date", "Movement", "Product ID", "Quantity Change", "Reason", "Reference Type", "Reference"], movements);
  sheet.pageSetup.printArea = `A1:L${Math.max(row, 12)}`;
  return sheet;
}

export async function createReferenceBusinessWorkbook(report: Row) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Panther Legacy Garage";
  workbook.subject = "Monthly Business Performance Report";
  workbook.title = "Panther Legacy Garage — Monthly Business Performance Report";
  workbook.created = report.meta?.generated_at ? new Date(report.meta.generated_at) : new Date();
  workbook.modified = new Date();
  let logoImageId: number | null = null;
  try {
    const logo = await sharp(readFileSync(join(process.cwd(), "public", "favicon.png")))
      .resize(180, 180, { fit: "inside" })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    logoImageId = workbook.addImage({ buffer: logo as any, extension: "png" });
  } catch {
    // Logo is optional; the workbook remains usable if the public asset is absent.
  }

  const inventory = report.inventory || {};
  const products = inventory.products || [];
  const health = [
    { label: "Healthy", value: products.filter((item: Row) => item.stock_status === "HEALTHY").length },
    { label: "Low stock", value: products.filter((item: Row) => item.stock_status === "LOW_STOCK").length },
    { label: "Out of stock", value: products.filter((item: Row) => item.stock_status === "OUT_OF_STOCK").length },
  ];
  const trendData = (report.sales?.trend || []) as TrendPoint[];
  const serviceDemand = (report.repairs?.service_demand || []) as Slice[];
  const [trendPng, healthPng, demandPng] = await Promise.all([
    renderSalesTrend(trendData),
    renderDonutChart(health),
    renderServiceDemand(serviceDemand),
  ]);
  const trendId = workbook.addImage({ buffer: trendPng as any, extension: "png" });
  const healthId = workbook.addImage({ buffer: healthPng as any, extension: "png" });
  const demandId = workbook.addImage({ buffer: demandPng as any, extension: "png" });

  addSummarySheet(workbook, report, { trend: trendId, inventory: healthId }, logoImageId);
  addPerformanceSheet(workbook, report, demandId, logoImageId);
  addActivitySheet(workbook, report, logoImageId);
  return workbook.xlsx.writeBuffer();
}
