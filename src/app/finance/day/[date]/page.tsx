import { CalendarDays, ChevronLeft, ChevronRight, Fuel } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PumpShiftHistoryTable } from "@/components/finance/pump-shift-history-table";
import { PageHeader } from "@/components/ui/page-header";
import { listExpenses } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";
import { buildFinanceAnalytics } from "@/server/services/finance-analytics-service";

export const dynamic = "force-dynamic";
const money = (value: string) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function adjacentDate(date: string, deltaDays: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

export default async function FinanceDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const month = date.slice(0, 7);
  const [expenses, shifts, staff, payroll] = await Promise.all([
    listExpenses(), getOperationsRepository().listShifts(), getStaffStore().listStaff(), getStaffStore().listPayroll(month)
  ]);
  const analytics = buildFinanceAnalytics({ month, from: date, to: date, expenses, shifts, staff, payroll });
  const day = analytics.days.find((item) => item.businessDate === date);
  const stationLabels = Object.fromEntries(shifts.flatMap((entry) => (entry.stationSnapshots ?? []).map((station) => [station.stationId, `${station.code} · ${station.productName}`])));

  return <main className="page finance-page">
    <PageHeader eyebrow="Day drill-down" title={date} description="Every completed pump-shift and the closed-day summary for this business date." action={{ label: "Back to finance", href: `/finance?month=${month}`, icon: <Fuel size={16} /> }} />
    <div className="month-command"><span><CalendarDays size={18} /><strong>Browse days</strong></span><Link className="button soft" href={`/finance/day/${adjacentDate(date, -1)}`}><ChevronLeft size={14} />Previous day</Link><Link className="button soft" href={`/finance/day/${adjacentDate(date, 1)}`}>Next day<ChevronRight size={14} /></Link><Link className="button soft" href={`/finance?month=${month}`}>Back to {month}</Link></div>

    <section className="finance-scoreboard"><article><span>Closed shifts</span><strong>{day?.shifts ?? 0}</strong></article><article><span>Revenue</span><strong>{money(day?.revenue ?? "0")}</strong></article><article><span>Fuel gross profit</span><strong>{money(day?.grossMargin ?? "0")}</strong></article><article><span>Operating expenses</span><strong>{money(day?.expenses ?? "0")}</strong></article></section>

    <section className="panel panel-pad finance-table-panel"><div className="panel-header"><div><p className="panel-kicker">Live, as they&apos;re saved</p><h2 className="panel-title">Completed pump-shifts</h2></div><span className="status-pill healthy">{analytics.pumpShifts.length} completed</span></div>{analytics.pumpShifts.length ? <PumpShiftHistoryTable pumpShifts={analytics.pumpShifts} showDate={false} staff={staff} stationLabels={stationLabels} /> : <p className="empty-state">No pump-shifts were completed on {date}.</p>}</section>

    <section className="panel panel-pad finance-table-panel"><div className="panel-header"><div><p className="panel-kicker">Fuel economics</p><h2 className="panel-title">Profit by product</h2></div></div>{analytics.products.length ? <table className="data-table"><thead><tr><th>Product</th><th>Litres</th><th>Revenue</th><th>Reseller cost</th><th>Gross profit</th></tr></thead><tbody>{analytics.products.map((product) => <tr key={product.productId}><td><span className="table-title">{product.productName}</span></td><td className="mono">{product.litres} L</td><td className="mono">{money(product.revenue)}</td><td className="mono">{money(product.cost)}</td><td className="mono profit-value">{money(product.grossProfit)}</td></tr>)}</tbody></table> : <p className="empty-state">No closed business day on {date} yet.</p>}</section>
  </main>;
}
