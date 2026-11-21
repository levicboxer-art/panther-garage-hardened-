import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitedResponse } from "@/lib/api-security";
import { buildBusinessReport, normaliseReportWindow, REPORT_CATEGORIES, type ReportCategory } from "@/lib/business-report";
import { isCalendarMonthWindow } from "@/lib/report-window";
import { createReferenceBusinessWorkbook } from "@/lib/business-report-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };

function jsonError(message: string, status: number) { return NextResponse.json({ error: message }, { status, headers: NO_STORE }); }
function money(value: unknown) { return `RWF ${Number(value || 0).toLocaleString("en-RW", { maximumFractionDigits: 2 })}`; }
function label(category: string) { return ({ complete: "Complete Business Report", financial: "Financial Report", sales: "Sales Report", inventory: "Inventory Report", payments: "Payment Report", repairs: "Repair Report", expenses: "Expense Report", customers: "Customer Report" } as Record<string, string>)[category] || category; }

function reportRows(report: any, category: ReportCategory) {
  const sheets: Record<string, Record<string, unknown>[]> = {
    "business_summary": [report.executive_summary],
    "sales_report": report.sales.invoices,
    "payments_report": report.payments.transactions,
    "inventory_report": report.inventory.products,
    "stock_movements": report.inventory.movements,
    "repairs_report": report.repairs.jobs,
    "expenses_report": report.expenses.transactions,
    "purchases_report": report.purchases,
    "customers_report": [{ registered: report.customers.registered, new_customers: report.customers.new_customers, returning_customers: report.customers.returning_customers, total_customer_orders: report.customers.total_customer_orders, average_order_value: report.customers.average_order_value }],
    "management_insights": report.insights,
  };
  if (category === "financial") return { financial_report: [report.financial] };
  if (category === "sales") return { sales_report: sheets.sales_report };
  if (category === "payments") return { payments_report: sheets.payments_report };
  if (category === "inventory") return { inventory_report: sheets.inventory_report, stock_movements: sheets.stock_movements };
  if (category === "repairs") return { repairs_report: sheets.repairs_report };
  if (category === "expenses") return { expenses_report: sheets.expenses_report, purchases_report: sheets.purchases_report };
  if (category === "customers") return { customers_report: sheets.customers_report };
  return sheets;
}

const BLUE = "123A63";
const LIGHT_BLUE = "DCEAF5";
const GREEN = "D9F2D0";
const RED = "F8D7DA";
const AMBER = "FFF0C2";
const WHITE = "FFFFFFFF";
const BORDER = { style: "thin" as const, color: { argb: "9FB6C9" } };
const moneyValue = (value: unknown) => value === null || value === undefined ? "Not available" : Number(value || 0);
function sectionBar(sheet: ExcelJS.Worksheet, row: number, title: string, from = 1, to = 10) {
  sheet.mergeCells(row, from, row, to);
  const cell = sheet.getCell(row, from);
  cell.value = title.toUpperCase(); cell.font = { bold: true, color: { argb: WHITE }, size: 12 }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } }; cell.alignment = { vertical: "middle" }; sheet.getRow(row).height = 23;
}
function tableHeader(sheet: ExcelJS.Worksheet, row: number, values: string[], from = 1) {
  values.forEach((value, index) => { const cell = sheet.getCell(row, from + index); cell.value = value; cell.font = { bold: true, color: { argb: "102A43" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } }; cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }; cell.alignment = { wrapText: true, vertical: "middle" }; });
  sheet.getRow(row).height = 25;
}
function tableValue(sheet: ExcelJS.Worksheet, row: number, col: number, value: unknown, numeric = false) {
  const cell = sheet.getCell(row, col); cell.value = value as ExcelJS.CellValue; cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }; cell.alignment = { vertical: "middle", wrapText: true }; if (numeric) cell.numFmt = '"RWF "#,##0';
}
function addExecutiveSummarySheet(workbook: ExcelJS.Workbook, report: any, title: string) {
  const sheet = workbook.addWorksheet("00_Executive_Summary");
  sheet.properties.tabColor = { argb: BLUE }; sheet.views = [{ state: "frozen", ySplit: 6 }]; sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 2, paperSize: 9 }; sheet.headerFooter.oddFooter = "&LConfidential – Panther Legacy Garage&CPage &P of &N";
  sheet.columns = [{ width: 3 }, { width: 23 }, { width: 18 }, { width: 3 }, { width: 23 }, { width: 18 }, { width: 3 }, { width: 23 }, { width: 18 }, { width: 3 }];
  sheet.mergeCells("B1:I2"); const titleCell = sheet.getCell("B1"); titleCell.value = "PANTHER LEGACY GARAGE\nMonthly Business Performance Report"; titleCell.font = { bold: true, size: 20, color: { argb: BLUE } }; titleCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  try { const image = workbook.addImage({ buffer: readFileSync(join(process.cwd(), "public", "favicon.png")) as any, extension: "png" }); sheet.addImage(image, { tl: { col: 0.2, row: 0.15 }, ext: { width: 125, height: 92 } }); } catch { /* Branding image is optional in minimal deployments. */ }
  sheet.mergeCells("B3:I3"); sheet.getCell("B3").value = "Drive Smarter. Grow Stronger."; sheet.getCell("B3").font = { italic: true, bold: true, size: 12, color: { argb: "334E68" } };
  sheet.getCell("H1").value = "Reporting Period:"; sheet.getCell("H1").font = { bold: true, color: { argb: "102A43" } }; sheet.getCell("H2").value = `${report.meta.from} to ${report.meta.to}`; sheet.getCell("H2").font = { bold: true, color: { argb: BLUE } }; sheet.getCell("H3").value = `Generated: ${new Date(report.meta.generated_at).toLocaleString()}`; sheet.getCell("H3").font = { size: 9, color: { argb: "52606D" } };
  sectionBar(sheet, 5, "Executive Summary", 2, 9);
  const k = report.executive_summary; const cards = [["Total Sales Revenue", k.total_sales_revenue, k.revenue_change_pct, GREEN], ["Payments Collected", k.total_successful_payments_collected, null, LIGHT_BLUE], ["Gross Profit", k.gross_profit, null, GREEN], ["Net Result", k.net_operating_result, null, k.result_status === "LOSS" ? RED : GREEN]];
  cards.forEach(([labelText, value, changePct, fill], index) => { const start = 2 + index * 2; sheet.mergeCells(7, start, 7, start + 1); sheet.mergeCells(8, start, 9, start + 1); sheet.getCell(7, start).value = labelText; sheet.getCell(7, start).font = { bold: true, color: { argb: "102A43" } }; sheet.getCell(7, start).fill = { type: "pattern", pattern: "solid", fgColor: { argb: String(fill) } }; sheet.getCell(7, start).alignment = { horizontal: "center" }; sheet.getCell(8, start).value = moneyValue(value); sheet.getCell(8, start).numFmt = '"RWF "#,##0'; sheet.getCell(8, start).font = { bold: true, size: 16, color: { argb: value !== null && Number(value) < 0 ? "B42318" : BLUE } }; sheet.getCell(8, start).alignment = { horizontal: "center", vertical: "middle" }; sheet.getCell(8, start).fill = { type: "pattern", pattern: "solid", fgColor: { argb: String(fill) } }; if (changePct !== null) { sheet.getCell(10, start).value = `${Number(changePct) >= 0 ? "▲" : "▼"} ${changePct}% vs previous period`; sheet.getCell(10, start).font = { color: { argb: Number(changePct) >= 0 ? "137333" : "B42318" }, bold: true, size: 9 }; } });
  sectionBar(sheet, 12, "Financial Performance", 2, 5); sectionBar(sheet, 12, "Payment Collection", 7, 9);
  tableHeader(sheet, 13, ["Category", "Amount (RWF)", "% of Sales", "vs Previous"], 2); const finRows = [["Gross Sales", report.financial.gross_sales], ["Discounts", report.financial.discounts], ["Net Sales Revenue", report.financial.net_sales_revenue], ["Cost of Goods Sold", report.financial.cost_of_goods_sold], ["Gross Profit", report.financial.gross_profit], ["Operating Expenses", report.financial.operating_expenses], ["Net Result", report.financial.net_operating_result]]; finRows.forEach((item, index) => { const r = 14 + index; tableValue(sheet, r, 2, item[0]); tableValue(sheet, r, 3, item[1], true); tableValue(sheet, r, 4, report.financial.net_sales_revenue ? `${Math.round(Number(item[1] || 0) / Number(report.financial.net_sales_revenue) * 1000) / 10}%` : "Not available"); tableValue(sheet, r, 5, index === 6 ? k.result_status : ""); if (index === 4 && item[1] !== null) sheet.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } }; if (index === 6) sheet.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: k.result_status === "LOSS" ? RED : GREEN } }; });
  tableHeader(sheet, 13, ["Method", "Amount (RWF)", "Share"], 7); (report.payments.by_method || []).slice(0, 5).forEach((item: any, index: number) => { const r = 14 + index; tableValue(sheet, r, 7, item.method); tableValue(sheet, r, 8, item.amount, true); tableValue(sheet, r, 9, report.payments.successful_value ? `${Math.round(item.amount / report.payments.successful_value * 1000) / 10}%` : "Not available"); }); tableValue(sheet, 19, 7, "Total Collected"); tableValue(sheet, 19, 8, report.payments.successful_value, true); tableValue(sheet, 19, 9, "100%");
  sectionBar(sheet, 21, "Inventory Overview", 2, 5); sectionBar(sheet, 21, "Top 5 Best-Selling Spare Parts", 7, 9); tableHeader(sheet, 22, ["Metric", "Value"], 2); [["Total Products", report.inventory.summary.distinct_products], ["Total Units in Stock", report.inventory.summary.units_in_stock], ["Stock Value", report.inventory.summary.stock_purchase_value], ["Potential Sales Value", report.inventory.summary.estimated_potential_sales_value], ["Low Stock Items", report.inventory.summary.low_stock_products], ["Out of Stock Items", report.inventory.summary.out_of_stock_products]].forEach((item, index) => { tableValue(sheet, 23 + index, 2, item[0]); tableValue(sheet, 23 + index, 3, item[1], /Value|Stock/.test(String(item[0]))); }); tableHeader(sheet, 22, ["Product", "Qty Sold", "Revenue (RWF)"], 7); (report.sales.product_sales || []).slice(0, 5).forEach((item: any, index: number) => { tableValue(sheet, 23 + index, 7, item.product_name); tableValue(sheet, 23 + index, 8, item.units); tableValue(sheet, 23 + index, 9, item.revenue, true); });
  sectionBar(sheet, 31, "Repair & Service Performance", 2, 5); sectionBar(sheet, 31, "Customer Performance", 7, 9); tableHeader(sheet, 32, ["Metric", "Value"], 2); [["Total Repair Jobs", report.repairs.summary.total_jobs], ["Completed Repairs", report.repairs.summary.completed_jobs], ["Pending Repairs", report.repairs.summary.pending_jobs], ["Repair Revenue", report.repairs.summary.repair_service_revenue], ["Avg. Completion Time", report.repairs.summary.average_completion_days === null ? "Not available" : `${report.repairs.summary.average_completion_days} days`]].forEach((item, index) => { tableValue(sheet, 33 + index, 2, item[0]); tableValue(sheet, 33 + index, 3, item[1], /Revenue/.test(String(item[0]))); }); tableHeader(sheet, 32, ["Metric", "Value"], 7); [["Total Customers", report.customers.registered], ["New Customers", report.customers.new_customers], ["Returning Customers", report.customers.returning_customers], ["Avg. Order Value", report.customers.average_order_value], ["Outstanding Balances", report.customers.outstanding_balances]].forEach((item, index) => { tableValue(sheet, 33 + index, 7, item[0]); tableValue(sheet, 33 + index, 8, item[1], /Value|Balances/.test(String(item[0]))); });
  sectionBar(sheet, 39, "Management Insights & Recommendations", 2, 9); tableHeader(sheet, 40, ["Severity", "Issue", "Evidence", "Recommended Action"], 2); (report.insights || []).slice(0, 8).forEach((item: any, index: number) => { const r = 41 + index; tableValue(sheet, r, 2, item.severity); tableValue(sheet, r, 3, item.issue); tableValue(sheet, r, 4, item.metric); sheet.mergeCells(r, 5, r, 9); tableValue(sheet, r, 5, item.recommended_action); sheet.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: item.severity === "RED" ? RED : item.severity === "AMBER" ? AMBER : GREEN } }; });
  sheet.mergeCells("B51:I51"); sheet.getCell("B51").value = "Confidential – Panther Legacy Garage · Kigali, Rwanda · Actual PGMS records only"; sheet.getCell("B51").font = { italic: true, color: { argb: "52606D" }, size: 9 }; sheet.getCell("B51").alignment = { horizontal: "center" };
  return sheet;
}

async function makeWorkbook(report: any, category: ReportCategory) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Panther Legacy Garage";
  workbook.created = new Date(report.meta.generated_at);
  const entries = Object.entries(reportRows(report, category)).filter(([name]) => name !== "business_summary");
  const title = label(category);
  if (category === "complete") addExecutiveSummarySheet(workbook, report, title);
  for (const [name, rows] of entries) {
    const sheetName = name === "business_summary" ? "00_Executive_Summary" : ({ sales_report: "01_Sales", payments_report: "02_Payments", inventory_report: "03_Inventory", stock_movements: "04_Stock_Movements", repairs_report: "05_Repairs", expenses_report: "06_Expenses", purchases_report: "07_Purchases", customers_report: "08_Customers", management_insights: "09_Insights", financial_report: "01_Financial" } as Record<string, string>)[name] || name.slice(0, 31);
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(["Panther Legacy Garage", title]);
    sheet.addRow(["Reporting period", `${report.meta.from} to ${report.meta.to}`]);
    sheet.addRow(["Generated", report.meta.generated_at]);
    sheet.addRow(["Currency", "RWF"]);
    sheet.addRow([]);
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    sheet.addRow(keys);
    for (const row of rows) sheet.addRow(keys.map((key) => row[key]));
    sheet.views = [{ state: "frozen", ySplit: 6 }];
    sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: Math.max(1, keys.length) } };
    sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "17212B" } };
    sheet.getRow(6).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "526A3C" } };
    sheet.getRow(6).alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(6).height = 30;
    sheet.properties.tabColor = { argb: "526A3C" };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    sheet.headerFooter.oddFooter = "&LConfidential – Panther Legacy Garage&CPage &P of &N";
    sheet.columns.forEach((column) => { column.width = Math.min(42, Math.max(14, (column.header?.toString().length || 12) + 4)); });
    for (let rowNumber = 7; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      row.eachCell((cell, columnNumber) => {
        const key = String(keys[columnNumber - 1] || "");
        if (typeof cell.value === "number" && /(amount|revenue|cost|price|profit|balance|total|expense|value|paid)/i.test(key)) cell.numFmt = '"RWF "#,##0.00';
        const text = String(cell.value || "").toUpperCase();
        if (text.includes("RED") || text.includes("LOSS") || text.includes("OUT_OF_STOCK")) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FCE4E4" } };
        else if (text.includes("AMBER") || text.includes("WARNING") || text.includes("LOW_STOCK") || text.includes("INCOMPLETE")) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2CC" } };
        else if (text.includes("PROFIT") || text.includes("HEALTHY") || text.includes("AVAILABLE")) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "E2F0D9" } };
      });
    }
  }
  return workbook.xlsx.writeBuffer();
}

async function makePdf(report: any, category: ReportCategory) {
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const heading = (text: string) => { doc.fillColor("#17212B").fontSize(16).font("Helvetica-Bold").text(text); doc.moveDown(0.4); };
  const line = (name: string, value: unknown) => { doc.fillColor("#24323D").fontSize(10).font("Helvetica").text(`${name}: ${value === null || value === undefined ? "Not available – incomplete cost data" : typeof value === "number" ? money(value) : value}`); };
  doc.fillColor("#17212B").fontSize(28).font("Helvetica-Bold").text("PANTHER LEGACY GARAGE");
  doc.fillColor("#526A3C").fontSize(18).text(label(category));
  doc.moveDown();
  doc.fillColor("#34444F").fontSize(11).font("Helvetica").text(`Reporting period: ${report.meta.from} to ${report.meta.to}`);
  doc.text(`Generated: ${report.meta.generated_at} · Currency: RWF`);
  doc.moveDown(1.5);
  heading("Executive summary");
  for (const [key, value] of Object.entries(report.executive_summary)) line(key.replaceAll("_", " "), value);
  doc.moveDown(); heading("Financial performance");
  for (const [key, value] of Object.entries(report.financial)) if (typeof value !== "object") line(key.replaceAll("_", " "), value);
  doc.addPage(); heading("Inventory performance");
  line("Distinct products", report.inventory.summary.distinct_products); line("Units in stock", report.inventory.summary.units_in_stock); line("Stock purchase value", report.inventory.summary.stock_purchase_value); line("Potential sales value", report.inventory.summary.estimated_potential_sales_value);
  doc.moveDown(); heading("Repair and service performance");
  for (const [key, value] of Object.entries(report.repairs.summary)) line(key.replaceAll("_", " "), value);
  doc.moveDown(); heading("Management insights and recommended actions");
  for (const insight of report.insights) { doc.font("Helvetica-Bold").fillColor(insight.severity === "RED" ? "#A12828" : insight.severity === "AMBER" ? "#986B12" : "#256B8A").text(`${insight.severity}: ${insight.issue}`); doc.font("Helvetica").fillColor("#24323D").text(`Metric: ${insight.metric}. Action: ${insight.recommended_action}`); doc.moveDown(0.4); }
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); doc.fontSize(8).fillColor("#65727A").text("Confidential – Panther Legacy Garage Management Report", 42, 800, { align: "left" }); doc.text(`Page ${i + 1} of ${range.count}`, 42, 800, { align: "right" }); }
  doc.end();
  return done;
}

export async function GET(request: Request) {
  const limited = rateLimit(`business-report-export:${request.headers.get("x-forwarded-for") || "unknown"}`, 10);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).single();
  if (!profile?.active || profile.role !== "BOSS") return jsonError("Only an active Boss can download owner-level reports.", 403);
  const params = new URL(request.url).searchParams;
  const window = normaliseReportWindow(params.get("from"), params.get("to"));
  const requestedCategory = (params.get("category") || "complete") as ReportCategory;
  const format = params.get("format") || "xlsx";
  if (!window || !REPORT_CATEGORIES.includes(requestedCategory)) return jsonError("Choose a valid reporting period and category.", 400);
  if (!["pdf", "xlsx"].includes(format)) return jsonError("Choose PDF or Excel export.", 400);
  // Calendar-month Excel downloads always use the supplied complete-report template.
  const category = format === "xlsx" && isCalendarMonthWindow(window.from, window.to) ? "complete" : requestedCategory;
  try {
    const report = await buildBusinessReport(supabase, window, category);
    const stamp = window.from === window.to ? window.from : `${window.from}-to-${window.to}`;
    if (format === "pdf") { const pdf = await makePdf(report, category); return new Response(new Uint8Array(pdf).buffer as ArrayBuffer, { headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="panther-legacy-garage-${category}-${stamp}.pdf"` } }); }
    if (format === "xlsx") {
      const workbook = category === "complete" ? await createReferenceBusinessWorkbook(report) : await makeWorkbook(report, category);
      return new Response(workbook, { headers: { ...NO_STORE, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="panther-legacy-garage-${category}-${stamp}.xlsx"` } });
    }
    return jsonError("Unsupported export format.", 400);
  } catch (err) {
    console.error("Business report export failed:", err instanceof Error ? err.message : err);
    return jsonError("The report export could not be prepared from the recorded PGMS data.", 503);
  }
}
