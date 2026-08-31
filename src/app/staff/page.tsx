import { PageHeader } from "@/components/ui/page-header";
import { getOperationsRepository } from "@/server/repositories/repository-provider";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const shifts = await getOperationsRepository().listShifts();
  const people = new Map<string, { shifts: number; lastShift: string }>();
  for (const shift of shifts) {
    for (const name of shift.staffOnDuty) {
      const current = people.get(name);
      people.set(name, { shifts: (current?.shifts ?? 0) + 1, lastShift: current?.lastShift ?? shift.name });
    }
  }
  return <main className="page"><PageHeader eyebrow="Reference records only" title="Staff notes" description="Names are derived from shift entries. Staff do not have accounts in v1." /><section className="panel panel-pad reveal reveal-2">{people.size ? <table className="data-table"><thead><tr><th>Name</th><th>Latest shift note</th><th>Recorded shifts</th><th>Access</th></tr></thead><tbody>{[...people.entries()].map(([name, record]) => <tr key={name}><td><span className="table-title">{name}</span></td><td>{record.lastShift}</td><td>{record.shifts}</td><td><span className="status-pill closed">No login</span></td></tr>)}</tbody></table> : <p className="empty-state">No staff names have been added to a shift.</p>}</section></main>;
}
