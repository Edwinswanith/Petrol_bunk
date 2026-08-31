import { Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { listExpenses, listFuelReceipts } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const date = businessDate();
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
  const href = `/api/reports/daily?date=${date}`;
  return <main className="page"><PageHeader eyebrow="Decision reports" title="Reports & exports" description="Every exported headline remains connected to its source reading or entry." /><section className="summary-strip reveal reveal-2"><div className="summary-cell"><span>Shifts</span><strong>{dayShifts.length}</strong></div><div className="summary-cell"><span>Closed</span><strong>{dayShifts.filter((shift) => shift.state === "CLOSED").length}</strong></div><div className="summary-cell"><span>Expenses</span><strong>{dayExpenses.length}</strong></div><div className="summary-cell"><span>Fuel receipts</span><strong>{dayReceipts.length}</strong></div></section><section className="panel panel-pad reveal reveal-3"><div className="panel-header"><div><p className="panel-kicker">{date}</p><h2 className="panel-title">Daily operations workbook</h2></div><Link className="button primary" href={href}><Download size={15} /> Download CSV</Link></div><Link className="alert-card" href={href}><span className="alert-icon"><FileSpreadsheet size={15} /></span><span><strong>Complete daily operations export</strong><span>Summary, shifts, tender and cash variance, tank variance, expenses, and fuel receipts in one spreadsheet-ready file.</span></span><Download size={14} color="#77817d" /></Link></section></main>;
}
