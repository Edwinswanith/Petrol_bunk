import { CalendarDays, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { listExpenses } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";
import { buildFinanceAnalytics } from "@/server/services/finance-analytics-service";

export const dynamic = "force-dynamic";
const money = (value: string) => `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function StaffDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params; const requested = (await searchParams).month; const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : businessDate().slice(0, 7);
  const store = getStaffStore(); const [staff, shifts, expenses, attendance, payroll] = await Promise.all([store.listStaff(), getOperationsRepository().listShifts(), listExpenses(), store.listAttendance(), store.listPayroll(undefined, id)]);
  const person = staff.find((item) => item.id === id); if (!person) notFound();
  const analytics = buildFinanceAnalytics({ month, shifts, expenses, staff }); const total = analytics.staff.find((item) => item.staffId === id); const days = analytics.staffDays.filter((item) => item.staffId === id); const attendanceRows = attendance.filter((item) => item.staffId === id && item.businessDate.startsWith(month));
  return <main className="page finance-page"><PageHeader eyebrow="Employee drill-down" title={person.name} description="Daily litres, fuel split, revenue, gross profit, attendance and payroll settlements attributed from nozzle totalizers." action={{ label: "Back to staff", href: "/staff", icon: <UserRound size={16} /> }} />
    <form className="month-command"><span><CalendarDays size={18} /><strong>Performance month</strong></span><input defaultValue={month} name="month" type="month" /><button className="button primary">View month</button></form>
    <section className="finance-scoreboard staff-scoreboard"><article><span>Total litres</span><strong>{total?.litres ?? "0.000"} L</strong></article><article><span>Revenue</span><strong>{money(total?.revenue ?? "0")}</strong></article><article><span>Gross profit</span><strong>{money(total?.grossProfit ?? "0")}</strong></article><article><span>Attendance marked</span><strong>{attendanceRows.length} days</strong></article></section>
    <section className="panel panel-pad finance-table-panel"><div className="panel-header"><div><p className="panel-kicker">Totalizer attributed</p><h2 className="panel-title">Daily performance</h2></div></div>{days.length ? <table className="data-table"><thead><tr><th>Date</th>{analytics.products.map((product) => <th key={product.productId}>{product.productName}</th>)}<th>Litres</th><th>Revenue</th><th>Gross profit</th></tr></thead><tbody>{days.map((day) => <tr key={day.businessDate}><td>{day.businessDate}</td>{analytics.products.map((product) => <td key={product.productId}>{day.productLitres[product.productId] ?? "0.000"} L</td>)}<td>{day.litres} L</td><td>{money(day.revenue)}</td><td className="profit-value">{money(day.grossProfit)}</td></tr>)}</tbody></table> : <p className="empty-state">No closed nozzle work for this employee in {month}.</p>}</section>
    <section className="finance-grid"><article className="panel panel-pad"><h2 className="panel-title">Attendance</h2>{attendanceRows.length ? <table className="data-table"><tbody>{attendanceRows.map((row) => <tr key={row.id}><td>{row.businessDate}</td><td>{row.status}</td><td>{row.checkIn ?? "—"} to {row.checkOut ?? "—"}</td></tr>)}</tbody></table> : <p className="empty-state">No attendance marked.</p>}</article><article className="panel panel-pad"><h2 className="panel-title">Payroll history</h2>{payroll.length ? payroll.map((record) => <div className="payroll-history-card" key={record.id}><strong>{record.month} · {money(record.netPay)} net</strong><span>{money(record.amountPaid)} paid · {money(record.balanceDue)} due</span></div>) : <p className="empty-state">No payroll settlement yet.</p>}</article></section>
    <Link className="button soft" href={`/finance?month=${month}`}>Return to finance</Link>
  </main>;
}
