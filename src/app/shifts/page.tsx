import { ArrowRight, CalendarClock, CircleCheck, Clock3, Plus } from "lucide-react";
import Link from "next/link";
import Decimal from "decimal.js";

import { PageHeader } from "@/components/ui/page-header";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { businessDate, businessTimeLabel } from "@/lib/business-time";
import { findMissingBusinessDays } from "@/server/services/missing-business-days-service";

export const dynamic = "force-dynamic";

export default async function ShiftsPage() {
  const shifts = await getOperationsRepository().listShifts();
  const date = businessDate();
  const todayShifts = shifts.filter((shift) => shift.businessDate === date);
  const tenderVariance = Decimal.sum(0, ...todayShifts.map((shift) => shift.reconciliation?.sales.tenderVariance ?? "0"));
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const missingBusinessDays = findMissingBusinessDays(shifts, date);
  return (
    <main className="page">
      <PageHeader eyebrow="Operations ledger" title="Shifts" description="One clean record for every opening, handover and close." action={{ label: "Open today’s sheet", href: "/day", icon: <Plus size={16} /> }} />
      {missingBusinessDays.length ? <section className="catch-up-banner"><CalendarClock size={18} /><div><strong>{missingBusinessDays.length} business {missingBusinessDays.length === 1 ? "day has" : "days have"} no record: {missingBusinessDays.join(", ")}</strong><small>Open today&apos;s sheet — it will start you on the oldest missing day, {missingBusinessDays[0]}, until you&apos;re caught up.</small></div><Link className="button primary" href="/day">Catch up<ArrowRight size={14} /></Link></section> : null}
      <section className="summary-strip reveal reveal-2" aria-label="Shift summary">
        <div className="summary-cell"><span>Active now</span><strong>{shifts.filter((s) => s.state === "OPEN").length}</strong></div>
        <div className="summary-cell"><span>Closed today</span><strong>{todayShifts.filter((s) => s.state === "CLOSED").length}</strong></div>
        <div className="summary-cell"><span>Awaiting review</span><strong>0</strong></div>
        <div className="summary-cell"><span>Tender variance</span><strong>{money.format(tenderVariance.toNumber())}</strong></div>
      </section>
      <section className="panel panel-pad reveal reveal-3">
        <div className="panel-header"><div><p className="panel-kicker">Current ledger</p><h2 className="panel-title">Business day timeline</h2></div></div>
        <table className="data-table">
          <thead><tr><th>Shift</th><th>Status</th><th>Staff note</th><th>Started</th><th>Action</th></tr></thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <td><span className="table-title">{shift.name}</span><span className="table-subtitle">{shift.businessDate}</span></td>
                <td><span className={`status-pill ${shift.state === "OPEN" ? "live" : "closed"}`}>{shift.state}</span></td>
                <td>{shift.staffOnDuty.length ? shift.staffOnDuty.join(", ") : "Not recorded"}</td>
                <td className="mono">{businessTimeLabel(shift.startedAt)}</td>
                <td><Link className="button ghost" href={`/shifts/${shift.id}`}>{shift.state === "OPEN" ? <Clock3 size={14} /> : <CircleCheck size={14} />}{shift.state === "OPEN" ? "Continue" : "Review"}<ArrowRight size={13} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
