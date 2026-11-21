import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, rateLimitedResponse } from "@/lib/api-security";
import { buildBusinessReport, normaliseReportWindow, REPORT_CATEGORIES, type ReportCategory } from "@/lib/business-report";

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

async function makeWorkbook(report: any, category: ReportCategory) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Panther Legacy Garage";
  workbook.created = new Date(report.meta.generated_at);
  const entries = reportRows(report, category);
  const title = label(category);
  for (const [name, rows] of Object.entries(entries)) {
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
  const category = (params.get("category") || "complete") as ReportCategory;
  const format = params.get("format") || "xlsx";
  if (!window || !REPORT_CATEGORIES.includes(category)) return jsonError("Choose a valid reporting period and category.", 400);
  if (!["pdf", "xlsx"].includes(format)) return jsonError("Choose PDF or Excel export.", 400);
  try {
    const report = await buildBusinessReport(supabase, window, category);
    const stamp = window.from === window.to ? window.from : `${window.from}-to-${window.to}`;
    if (format === "pdf") { const pdf = await makePdf(report, category); return new Response(new Uint8Array(pdf).buffer as ArrayBuffer, { headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="panther-legacy-garage-${category}-${stamp}.pdf"` } }); }
    if (format === "xlsx") return new Response(await makeWorkbook(report, category), { headers: { ...NO_STORE, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="panther-legacy-garage-${category}-${stamp}.xlsx"` } });
    return jsonError("Unsupported export format.", 400);
  } catch (err) {
    console.error("Business report export failed:", err instanceof Error ? err.message : err);
    return jsonError("The report export could not be prepared from the recorded PGMS data.", 503);
  }
}
