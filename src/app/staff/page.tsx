import { PageHeader } from "@/components/ui/page-header";
import { StaffRegister } from "@/components/staff/staff-register";
import { businessDate } from "@/lib/business-time";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const today = businessDate();
  const [shifts, staff, attendance, allAttendance] = await Promise.all([
    getOperationsRepository().listShifts(), getStaffStore().listStaff(), getStaffStore().listAttendance(today), getStaffStore().listAttendance()
  ]);
  const metrics = new Map(staff.map((person) => [person.id, { shifts: 0, litres: 0, sales: 0, variance: 0, present: 0 }]));
  for (const record of allAttendance) if (record.status === "PRESENT" || record.status === "LATE") {
    const metric = metrics.get(record.staffId); if (metric) metric.present += 1;
  }
  for (const shift of shifts) for (const result of shift.reconciliation?.staff ?? []) {
    const metric = metrics.get(result.staffId); if (metric) { metric.shifts += 1; metric.litres += Number(result.litresSold); metric.sales += Number(result.expectedSalesValue); metric.variance += Number(result.handoverVariance); }
  }
  return <main className="page">
    <PageHeader eyebrow="Owner-managed operations" title="Staff & attendance" description="Keep a daily attendance register, assign each operator to a machine, and review litres sold and handover accuracy." />
    <div className="reveal reveal-2"><StaffRegister staff={staff} attendance={attendance} date={today} /></div>
    <section className="panel panel-pad reveal reveal-3" style={{ marginTop: 16 }}><div className="panel-header"><div><p className="panel-kicker">Closed shift results</p><h2 className="panel-title">Operator performance</h2></div><span className="status-pill healthy">Totalizer based</span></div>
      {staff.length ? <table className="data-table"><thead><tr><th>Staff</th><th>Attendance</th><th>Shifts closed</th><th>Litres sold</th><th>Expected sales</th><th>Handover variance</th></tr></thead><tbody>{staff.map((person) => { const value = metrics.get(person.id)!; return <tr key={person.id}><td><span className="table-title">{person.name}</span><span className="table-subtitle">{person.phone || person.note || "Active operator"}</span></td><td>{value.present} days</td><td>{value.shifts}</td><td className="mono">{value.litres.toLocaleString("en-IN", { maximumFractionDigits: 3 })} L</td><td className="mono">₹{value.sales.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td><td className="mono">₹{value.variance.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td></tr>; })}</tbody></table> : <p className="empty-state">Add staff to begin attendance and performance tracking.</p>}
    </section>
  </main>;
}
