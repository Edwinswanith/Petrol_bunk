"use client";

import { Clock3, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AttendanceRecord, StaffRecord } from "@/server/domain/staff";

export function StaffRegister({ staff, attendance, date }: { staff: StaffRecord[]; attendance: AttendanceRecord[]; date: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function post(url: string, payload: object) {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
    void post("/api/staff", { name: String(form.get("name")), phone: String(form.get("phone") ?? ""), note: String(form.get("note") ?? "") });
    event.currentTarget.reset();
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
  </div>;
}
