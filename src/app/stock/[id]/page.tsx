import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { listExpenses, listFuelReceipts } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { buildDashboardViewModel } from "@/server/services/dashboard-service";

export const dynamic = "force-dynamic";

export default async function TankDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [shifts, expenses, receipts] = await Promise.all([
    getOperationsRepository().listShifts(),
    listExpenses(),
    listFuelReceipts()
  ]);
  const tank = buildDashboardViewModel({ shifts, expenses }).tanks.find((item) => item.id === id);
  if (!tank) notFound();
  const tankReceipts = receipts.filter((receipt) => receipt.tankId === id);
  const salesEvents = shifts
    .filter((shift) => shift.reconciliation)
    .map((shift) => ({
      id: shift.id,
      time: shift.closedAt ?? shift.startedAt,
      name: `${shift.name} nozzle sales`,
      reference: shift.businessDate,
      quantity: id === "petrol_tank"
        ? shift.reconciliation?.nozzles.petrol_1?.expectedTankOutflow
        : shift.reconciliation?.nozzles.diesel_1?.expectedTankOutflow
    }))
    .filter((event) => event.quantity);
  const events = [
    ...tankReceipts.map((receipt) => ({ id: receipt.id, time: receipt.createdAt, name: "Fuel receipt", reference: receipt.invoiceNumber, quantity: `+${Number(receipt.acceptedQuantity).toLocaleString("en-IN")} L` })),
    ...salesEvents.map((event) => ({ ...event, quantity: `-${Number(event.quantity).toLocaleString("en-IN")} L` }))
  ].sort((a, b) => b.time.localeCompare(a.time));

  return <main className="page"><PageHeader eyebrow={`${tank.name} · ${tank.product}`} title={`${tank.litres} recorded`} description={`${tank.percentage}% of ${tank.capacityLitres}. ${tank.daysRemaining === "No sales rate" ? "A remaining-days forecast appears after a shift closes." : `Approximately ${tank.daysRemaining} remaining at the current closed-shift rate.`}`} /><section className="panel panel-pad reveal reveal-2"><div className="panel-header"><div><p className="panel-kicker">Movement history</p><h2 className="panel-title">Recent stock events</h2></div><span className={`status-pill ${tank.status === "healthy" ? "healthy" : "warning"}`}>{tank.status}</span></div>{events.length ? <table className="data-table"><thead><tr><th>Recorded</th><th>Event</th><th>Reference</th><th>Quantity</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</td><td><span className="table-title">{event.name}</span></td><td>{event.reference}</td><td className="mono">{event.quantity}</td></tr>)}</tbody></table> : <p className="empty-state">No movement has been recorded for this tank yet.</p>}</section></main>;
}
