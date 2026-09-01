import { Download, FileSpreadsheet } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { listExpenses, listFuelReceipts } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export const dynamic = "force-dynamic";

function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default async function ReportsPage() {
  const date = businessDate();
  const weekStart = offsetDate(date, -6);
  const monthStart = offsetDate(date, -29);
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
  const exports = [
    { label: "Daily", detail: date, href: `/api/reports/daily?date=${date}` },
    { label: "Last 7 days", detail: `${weekStart} to ${date}`, href: `/api/reports/daily?from=${weekStart}&to=${date}` },
    { label: "Last 30 days", detail: `${monthStart} to ${date}`, href: `/api/reports/daily?from=${monthStart}&to=${date}` }
  ];
  return <main className="page"><PageHeader eyebrow="Decision reports" title="Reports & exports" description="Every exported headline remains connected to its source reading or entry." /><section className="summary-strip reveal reveal-2"><div className="summary-cell"><span>Shifts</span><strong>{dayShifts.length}</strong></div><div className="summary-cell"><span>Closed</span><strong>{dayShifts.filter((shift) => shift.state === "CLOSED").length}</strong></div><div className="summary-cell"><span>Expenses</span><strong>{dayExpenses.length}</strong></div><div className="summary-cell"><span>Fuel receipts</span><strong>{dayReceipts.length}</strong></div></section><section className="panel panel-pad reveal reveal-3"><div className="panel-header"><div><p className="panel-kicker">Nozzle-to-tank audit trail</p><h2 className="panel-title">Operations workbooks</h2></div><FileSpreadsheet size={20} color="#087665" /></div><div className="alert-list">{exports.map((item) => <Link className="alert-card" href={item.href} key={item.label}><span className="alert-icon"><FileSpreadsheet size={15} /></span><span><strong>{item.label} export</strong><span>{item.detail} · nozzle readings, pump sides, staff, prices, payments, tanks, expenses and receipts.</span></span><Download size={14} color="#77817d" /></Link>)}</div></section></main>;
}
