import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { listExpenses } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { buildDashboardViewModel } from "@/server/services/dashboard-service";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export const dynamic = "force-dynamic";

export default async function TankDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getOperationsRepository();
  const [shifts, expenses, configuration, movements] = await Promise.all([
    repository.listShifts(),
    listExpenses(),
    getForecourtConfigStore().getConfiguration(),
    repository.listInventoryMovements(id)
  ]);
  const tank = buildDashboardViewModel({ shifts, expenses, configuration }).tanks.find((item) => item.id === id);
  if (!tank) notFound();
  const events = movements.map((movement) => ({ id: movement.id, time: movement.createdAt, name: movement.referenceLabel, reference: movement.businessDate, quantity: `${Number(movement.quantity) > 0 ? "+" : ""}${Number(movement.quantity).toLocaleString("en-IN")} L`, balance: `${Number(movement.balanceAfter).toLocaleString("en-IN")} L` }));

  return <main className="page"><PageHeader eyebrow={`${tank.name} · ${tank.product}`} title={`${tank.litres} book stock`} description={`${tank.percentage}% of ${tank.capacityLitres}. Every receipt and closed-shift deduction appears in this ledger.`} /><section className="panel panel-pad reveal reveal-2"><div className="panel-header"><div><p className="panel-kicker">Movement history</p><h2 className="panel-title">Auditable tank ledger</h2></div><span className={`status-pill ${tank.status === "healthy" ? "healthy" : "warning"}`}>{tank.status}</span></div>{events.length ? <table className="data-table"><thead><tr><th>Recorded</th><th>Event</th><th>Reference</th><th>Movement</th><th>Balance after</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</td><td><span className="table-title">{event.name}</span></td><td>{event.reference}</td><td className="mono">{event.quantity}</td><td className="mono">{event.balance}</td></tr>)}</tbody></table> : <p className="empty-state">No inventory movement has been posted yet.</p>}</section></main>;
}
