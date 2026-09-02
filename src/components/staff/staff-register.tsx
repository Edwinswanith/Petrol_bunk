"use client";

import { Banknote, Clock3, Save, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AttendanceRecord, PayrollRecord, StaffRecord } from "@/server/domain/staff";

export function StaffRegister({ staff, attendance, payroll, date, month }: { staff: StaffRecord[]; attendance: AttendanceRecord[]; payroll: PayrollRecord[]; date: string; month: string }) {
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
    void post("/api/staff", { name: String(form.get("name")), phone: String(form.get("phone") ?? ""), note: String(form.get("note") ?? ""), monthlySalary: String(form.get("monthlySalary") || "0"), dailyBeta: String(form.get("dailyBeta") || "0"), assignedShift: String(form.get("assignedShift") || "SHIFT_1") });
    event.currentTarget.reset();
  }

  function updateSalary(event: FormEvent<HTMLFormElement>, staffId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void post(`/api/staff/${staffId}`, { monthlySalary: String(form.get("monthlySalary") || "0"), dailyBeta: String(form.get("dailyBeta") || "0"), assignedShift: String(form.get("assignedShift") || "SHIFT_1") }, "PATCH");
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

  function savePayroll(event: FormEvent<HTMLFormElement>, staffId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void post("/api/payroll", { staffId, month: String(form.get("month")), halfDays: Number(form.get("halfDays") || 0), overtime: String(form.get("overtime") || "0"), attendanceDeduction: String(form.get("attendanceDeduction") || "0"), advances: String(form.get("advances") || "0"), otherDeductions: String(form.get("otherDeductions") || "0"), amountPaid: String(form.get("amountPaid") || "0"), note: String(form.get("note") || "") });
  }

  return <div className="staff-register-grid">
    <section className="panel panel-pad">
      <div className="panel-header"><div><p className="panel-kicker">Staff directory</p><h2 className="panel-title">Add an operator</h2></div><UserPlus size={19} color="#087665" /></div>
      <form className="compact-form" onSubmit={addStaff}>
        <label className="field"><span>Name</span><input name="name" placeholder="e.g. Omapathy" required /></label>
        <label className="field"><span>Phone, optional</span><input inputMode="tel" name="phone" placeholder="98765 43210" /></label>
        <label className="field"><span>Assigned shift</span><select defaultValue="SHIFT_1" name="assignedShift"><option value="SHIFT_1">Shift 1</option><option value="SHIFT_2">Shift 2</option></select></label>
        <label className="field"><span>Monthly salary</span><input min="0" name="monthlySalary" placeholder="18000" required step="0.01" type="number" /></label>
        <label className="field"><span>Daily beta</span><input min="0" name="dailyBeta" placeholder="150" step="0.01" type="number" /></label>
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
      <p className="page-description small">Shift 1: Omapathy and Sampath receive ₹18,000 fixed salary plus ₹150 beta for each worked day. Leave and absence earn no beta. Shift 2: Nagaraj and Kavita receive a fixed ₹18,000 salary.</p>
      {staff.length ? <div className="salary-list">{staff.map((person) => <form key={person.id} onSubmit={(event) => updateSalary(event, person.id)}><span className="salary-person"><strong>{person.name}</strong><small>{person.assignedShift === "SHIFT_2" ? "Shift 2" : "Shift 1"}{Number(person.dailyBeta ?? 0) ? ` · ₹${person.dailyBeta} daily beta` : " · fixed salary"}</small></span><label><span>Shift</span><select aria-label={`${person.name} assigned shift`} defaultValue={person.assignedShift ?? "SHIFT_1"} name="assignedShift"><option value="SHIFT_1">Shift 1</option><option value="SHIFT_2">Shift 2</option></select></label><label><span>Monthly salary</span><span className="salary-input"><b>₹</b><input aria-label={`${person.name} monthly salary`} defaultValue={person.monthlySalary ?? "0"} min="0" name="monthlySalary" required step="0.01" type="number" /></span></label><label><span>Daily beta</span><span className="salary-input"><b>₹</b><input aria-label={`${person.name} daily beta`} defaultValue={person.dailyBeta ?? "0"} min="0" name="dailyBeta" required step="0.01" type="number" /></span></label><button aria-label={`Save ${person.name} salary`} className="icon-button" disabled={saving} type="submit"><Save size={15} /></button></form>)}</div> : <p className="empty-state">Add a staff member to configure salary.</p>}
    </section>
    <section className="panel panel-pad payroll-panel">
      <div className="panel-header"><div><p className="panel-kicker">Attendance-aware settlement</p><h2 className="panel-title">Salary due, paid &amp; balance</h2></div><Banknote size={19} color="#087665" /></div>
      <p className="page-description small">Attendance counts are copied from the register. Daily beta is added automatically for present and late days; leave and absence add no beta, and a half day earns half beta. Other deductions remain owner-entered.</p>
      <div className="payroll-editor-list">{staff.map((person) => { const saved = payroll.find((record) => record.staffId === person.id && record.month === month); return <form key={person.id} onSubmit={(event) => savePayroll(event, person.id)}><header><span><strong>{person.name}</strong><small>Base ₹{Number(person.monthlySalary ?? 0).toLocaleString("en-IN")} · {person.assignedShift === "SHIFT_2" ? "Shift 2" : "Shift 1"}</small></span>{saved ? <span className="payroll-balance"><small>Balance due</small><strong>₹{Number(saved.balanceDue).toLocaleString("en-IN")}</strong></span> : null}</header><div className="payroll-fields"><label><span>Month</span><input defaultValue={month} name="month" type="month" required /></label><label><span>Half days</span><input defaultValue={saved?.halfDays ?? 0} min="0" name="halfDays" type="number" /></label><label><span>Overtime ₹</span><input defaultValue={saved?.overtime ?? "0"} min="0" name="overtime" step="0.01" type="number" /></label><label><span>Attendance deduction ₹</span><input defaultValue={saved?.attendanceDeduction ?? "0"} min="0" name="attendanceDeduction" step="0.01" type="number" /></label><label><span>Advances ₹</span><input defaultValue={saved?.advances ?? "0"} min="0" name="advances" step="0.01" type="number" /></label><label><span>Other deductions ₹</span><input defaultValue={saved?.otherDeductions ?? "0"} min="0" name="otherDeductions" step="0.01" type="number" /></label><label><span>Amount paid ₹</span><input defaultValue={saved?.amountPaid ?? "0"} min="0" name="amountPaid" step="0.01" type="number" /></label><label><span>Note</span><input defaultValue={saved?.note ?? ""} name="note" /></label></div>{saved ? <div className="payroll-result"><span>{saved.presentDays} present · {saved.lateDays} late · {saved.absentDays} absent · {saved.leaveDays} leave</span><span>Beta ₹{saved.betaEarned} ({saved.betaDays} days × ₹{saved.dailyBetaRate}) · gross ₹{saved.grossPay} · deductions ₹{saved.totalDeductions} · net ₹{saved.netPay} · paid ₹{saved.amountPaid}</span></div> : null}<button className="button primary" disabled={saving}><Save size={14} />Save settlement</button></form>; })}</div>
      {payroll.length ? <details className="payroll-history"><summary>View payroll history</summary><table className="data-table"><thead><tr><th>Month</th><th>Staff</th><th>Net</th><th>Paid</th><th>Balance</th></tr></thead><tbody>{payroll.map((record) => <tr key={record.id}><td>{record.month}</td><td>{record.staffName}</td><td>₹{record.netPay}</td><td>₹{record.amountPaid}</td><td>₹{record.balanceDue}</td></tr>)}</tbody></table></details> : null}
    </section>
  </div>;
}
