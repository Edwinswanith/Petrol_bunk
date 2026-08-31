import { Clock3, Fuel, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { ShiftCloseForm } from "@/components/shifts/shift-close-form";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { businessTimeLabel } from "@/lib/business-time";

export const dynamic = "force-dynamic";

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shift = await getOperationsRepository().findShift(id);
  if (!shift) notFound();
  const isClosed = shift.state === "CLOSED";

  return (
    <main className="page">
      <header className="page-header reveal reveal-1">
        <div><p className="eyebrow">{shift.businessDate} · Shift workspace</p><h1>{shift.name}</h1><p className="page-description">Opening readings are protected after the shift closes.</p></div>
        <span className={`status-pill ${isClosed ? "closed" : "live"}`}>{shift.state}</span>
      </header>
      <section className="summary-strip reveal reveal-2">
        <div className="summary-cell"><span>Started</span><strong className="mono">{businessTimeLabel(shift.startedAt)}</strong></div>
        <div className="summary-cell"><span>Petrol opening</span><strong className="mono">{shift.openingNozzleReadings.petrol_1} L</strong></div>
        <div className="summary-cell"><span>Diesel opening</span><strong className="mono">{shift.openingNozzleReadings.diesel_1} L</strong></div>
        <div className="summary-cell"><span>Staff note</span><strong>{shift.staffOnDuty.join(" & ") || "None"}</strong></div>
      </section>
      <div className="two-column reveal reveal-3">
        <section className="panel panel-pad form-panel">
          <div className="panel-header"><div><p className="panel-kicker">Guided close</p><h2 className="panel-title">Close and reconcile</h2></div><Fuel color="#0d6b5d" size={20} /></div>
          {isClosed ? (
            <div className="success-message"><Clock3 size={20} /><span><strong>This shift is locked</strong><span>Closed shifts are immutable in this first version, so the original reading remains protected.</span></span></div>
          ) : (
            <ShiftCloseForm shiftId={shift.id} assignments={shift.staffAssignments} defaults={{ petrolClosing: shift.openingNozzleReadings.petrol_1, dieselClosing: shift.openingNozzleReadings.diesel_1, petrolStock: shift.openingTankStocks.petrol_tank, dieselStock: shift.openingTankStocks.diesel_tank, cashSales: "0", upi: "0" }} />
          )}
          {isClosed && shift.reconciliation ? (
            <div className="closed-summary" aria-label="Closed shift reconciliation">
              <div><span>Expected sales</span><strong>₹{Number(shift.reconciliation.sales.expectedSales).toLocaleString("en-IN")}</strong></div>
              <div><span>Tender variance</span><strong>₹{Number(shift.reconciliation.sales.tenderVariance).toLocaleString("en-IN")}</strong></div>
              <div><span>Petrol stock variance</span><strong>{shift.reconciliation.tanks.petrol_tank?.variance ?? "0.000"} L</strong></div>
              <div><span>Diesel stock variance</span><strong>{shift.reconciliation.tanks.diesel_tank?.variance ?? "0.000"} L</strong></div>
              <div><span>Est. operating profit</span><strong>₹{Number(shift.reconciliation.estimatedOperatingProfit).toLocaleString("en-IN")}</strong></div>
            </div>
          ) : null}
          {isClosed && shift.reconciliation?.staff?.length ? <div className="shift-staff-results">{shift.reconciliation.staff.map((result) => <article key={result.staffId}><span className="machine-code">{result.nozzleId === "petrol_1" ? "P1" : "D1"}</span><div><strong>{result.staffName}</strong><small>{result.litresSold} L · ₹{Number(result.expectedSalesValue).toLocaleString("en-IN")}</small></div><div><small>Handover variance</small><strong>₹{Number(result.handoverVariance).toLocaleString("en-IN")}</strong></div></article>)}</div> : null}
        </section>
        <aside className="dashboard-main">
          <section className="panel panel-pad"><div className="panel-header"><div><p className="panel-kicker">Opening snapshot</p><h2 className="panel-title">Recorded checks</h2></div></div><div className="alert-list"><div className="alert-card"><span className="alert-icon"><Fuel size={15} /></span><span><strong>Nozzle readings</strong><span>2 of 2 opening totalizers recorded</span></span><CircleCheckIcon /></div><div className="alert-card"><span className="alert-icon"><UsersRound size={15} /></span><span><strong>Staff on duty</strong><span>{shift.staffOnDuty.join(", ") || "No names recorded"}</span></span><CircleCheckIcon /></div></div></section>
          <section className="panel panel-pad"><p className="panel-kicker">Protection</p><h2 className="panel-title">What happens at close?</h2><p className="page-description small">The server calculates sales, tank stock, collections, cash and estimated margin. The shift then becomes immutable in v1.</p></section>
        </aside>
      </div>
    </main>
  );
}

function CircleCheckIcon() {
  return <span className="status-pill healthy">Done</span>;
}
