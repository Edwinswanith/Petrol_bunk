import Decimal from "decimal.js";

import { businessDate } from "@/lib/business-time";
import { listExpenses, listFuelReceipts } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function row(values: unknown[]) {
  return values.map(csvCell).join(",");
}

export async function GET(request: Request) {
  const requestedDate = new URL(request.url).searchParams.get("date");
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : businessDate();
  const [shifts, expenses, receipts] = await Promise.all([
    getOperationsRepository().listShifts(),
    listExpenses(),
    listFuelReceipts()
  ]);
  const dayShifts = shifts.filter((shift) => shift.businessDate === date);
  const dayExpenses = expenses.filter((expense) => expense.date === date);
  const shiftIds = new Set(dayShifts.map((shift) => shift.id));
  const dayReceipts = receipts.filter(
    (receipt) => (receipt.shiftId && shiftIds.has(receipt.shiftId)) || businessDate(new Date(receipt.createdAt)) === date
  );
  const sales = Decimal.sum(0, ...dayShifts.map((shift) => shift.reconciliation?.sales.expectedSales ?? "0"));
  const tender = Decimal.sum(0, ...dayShifts.map((shift) => shift.reconciliation?.sales.accountedTender ?? "0"));
  const gross = Decimal.sum(0, ...dayShifts.map((shift) => shift.reconciliation?.grossMargin ?? "0"));
  const expenseTotal = Decimal.sum(0, ...dayExpenses.map((expense) => expense.amount));

  const rows = [
    row(["Forecourt daily operations export"]),
    row(["Business date", date]),
    row(["Generated at", new Date().toISOString()]),
    "",
    row(["SUMMARY"]),
    row(["Expected sales", sales.toFixed(2)]),
    row(["Accounted tender", tender.toFixed(2)]),
    row(["Tender variance", tender.minus(sales).toFixed(2)]),
    row(["Gross margin", gross.toFixed(2)]),
    row(["Recorded expenses", expenseTotal.toFixed(2)]),
    row(["Estimated operating profit", gross.minus(expenseTotal).toFixed(2)]),
    "",
    row(["SHIFTS"]),
    row(["Name", "State", "Started", "Closed", "Sales", "Tender variance", "Cash variance", "Petrol tank variance L", "Diesel tank variance L"]),
    ...dayShifts.map((shift) => row([
      shift.name,
      shift.state,
      shift.startedAt,
      shift.closedAt,
      shift.reconciliation?.sales.expectedSales,
      shift.reconciliation?.sales.tenderVariance,
      shift.reconciliation?.sales.cashVariance,
      shift.reconciliation?.tanks.petrol_tank?.variance,
      shift.reconciliation?.tanks.diesel_tank?.variance
    ])),
    "",
    row(["EXPENSES"]),
    row(["Category", "Amount", "Payment method", "Note", "Recorded at"]),
    ...dayExpenses.map((expense) => row([expense.category, expense.amount, expense.paymentMethod, expense.note, expense.createdAt])),
    "",
    row(["FUEL RECEIPTS"]),
    row(["Product", "Tank", "Invoice", "Tanker", "Accepted quantity L", "Observed density", "Landed cost per L", "Recorded at"]),
    ...dayReceipts.map((receipt) => row([receipt.product, receipt.tankId, receipt.invoiceNumber, receipt.tankerNumber, receipt.acceptedQuantity, receipt.observedDensity, receipt.landedCost, receipt.createdAt]))
  ];

  return new Response(`\uFEFF${rows.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="forecourt-${date}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
