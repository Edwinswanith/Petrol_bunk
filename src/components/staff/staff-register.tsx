"use client";

import { Banknote, Clock3, Save, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AttendanceRecord, StaffRecord } from "@/server/domain/staff";

export function StaffRegister({ staff, attendance, date }: { staff: StaffRecord[]; attendance: AttendanceRecord[]; date: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function post(url: string, payload: object, method = "POST") {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save");
      setMessage("Saved. The register is up to date.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); }
    finally { setSaving(false); }
  }

  function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post("/api/staff", { name: String(form.get("name")), phone: String(form.get("phone") ?? ""), note: String(form.get("note") ?? ""), monthlySalary: String(form.get("monthlySalary") || "0") });
    event.currentTarget.reset();
  }

  function updateSalary(event: FormEvent<HTMLFormElement>, staffId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void post(`/api/staff/${staffId}`, { monthlySalary: String(form.get("monthlySalary") || "0") }, "PATCH");
  }

  function markAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void post("/api/attendance", {
      staffId: String(form.get("staffId")), businessDate: date, status: String(form.get("status")),
      checkIn: String(form.get("checkIn") || "") || undefined,
      checkOut: String(form.get("checkOut") || "") || undefined,
      note: String(form.get("note") ?? "")
    });
  }

  return <div className="staff-register-grid">
    <section className="panel panel-pad">
      <div className="panel-header"><div><p className="panel-kicker">Staff directory</p><h2 className="panel-title">Add an operator</h2></div><UserPlus size={19} color="#087665" /></div>
      <form className="compact-form" onSubmit={addStaff}>
        <label className="field"><span>Name</span><input name="name" placeholder="e.g. Arun" required /></label>
        <label className="field"><span>Phone, optional</span><input inputMode="tel" name="phone" placeholder="98765 43210" /></label>
        <label className="field"><span>Monthly salary</span><input min="0" name="monthlySalary" placeholder="18000" required step="0.01" type="number" /></label>
        <label className="field full"><span>Note, optional</span><input name="note" placeholder="Experienced with petrol machine P1" /></label>
        <button className="button primary" disabled={saving} type="submit"><UserPlus size={14} />Add staff</button>
      </form>
    </section>
    <section className="panel panel-pad">
      <div className="panel-header"><div><p className="panel-kicker">{date}</p><h2 className="panel-title">Record attendance</h2></div><Clock3 size={19} color="#087665" /></div>
      {staff.length ? <form className="compact-form" onSubmit={markAttendance}>
        <label className="field full"><span>Staff member</span><select name="staffId" required>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="field"><span>Status</span><select name="status"><option value="PRESENT">Present</option><option value="LATE">Late</option><option value="ABSENT">Absent</option><option value="LEAVE">Leave</option></select></label>
        <label className="field"><span>Check in</span><input name="checkIn" type="time" /></label>
        <label className="field"><span>Check out</span><input name="checkOut" type="time" /></label>
        <label className="field"><span>Note</span><input name="note" placeholder="Optional" /></label>
        <button className="button primary" disabled={saving} type="submit"><Clock3 size={14} />Save attendance</button>
      </form> : <p className="empty-state">Add the first staff member before recording attendance.</p>}
      {message ? <p className="save-note" role="status">{message}</p> : null}
      {attendance.length ? <div className="attendance-chips">{attendance.map((record) => <span className={`attendance-chip ${record.status.toLowerCase()}`} key={record.id}><strong>{record.staffName}</strong>{record.status}{record.checkIn ? ` · ${record.checkIn}` : ""}</span>)}</div> : null}
    </section>
    <section className="panel panel-pad salary-panel">
      <div className="panel-header"><div><p className="panel-kicker">Monthly payroll setup</p><h2 className="panel-title">Staff salary</h2></div><Banknote size={19} color="#087665" /></div>
      <p className="page-description small">This monthly commitment is included in the Finance profit estimate. Salary payments recorded as expenses remain visible separately.</p>
      {staff.length ? <div className="salary-list">{staff.map((person) => <form key={person.id} onSubmit={(event) => updateSalary(event, person.id)}><span className="salary-person"><strong>{person.name}</strong><small>{person.phone || "Active operator"}</small></span><label><span>Monthly salary</span><span className="salary-input"><b>₹</b><input aria-label={`${person.name} monthly salary`} defaultValue={person.monthlySalary ?? "0"} min="0" name="monthlySalary" required step="0.01" type="number" /></span></label><button aria-label={`Save ${person.name} salary`} className="icon-button" disabled={saving} type="submit"><Save size={15} /></button></form>)}</div> : <p className="empty-state">Add a staff member to configure salary.</p>}
    </section>
  </div>;
}
