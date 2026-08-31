"use client";

import { Gauge, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { StaffRecord } from "@/server/domain/staff";

type OpeningDefaults = {
  businessDate: string;
  petrolOpening: string;
  dieselOpening: string;
  petrolStock: string;
  dieselStock: string;
};

export function ShiftOpenForm({ defaults, staff = [] }: { defaults: OpeningDefaults; staff?: StaffRecord[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const petrolStaffId = String(form.get("petrolStaffId") ?? "");
    const dieselStaffId = String(form.get("dieselStaffId") ?? "");
    const assignments = [
      { staffId: petrolStaffId, staffName: staff.find((person) => person.id === petrolStaffId)?.name ?? "", nozzleId: "petrol_1" },
      { staffId: dieselStaffId, staffName: staff.find((person) => person.id === dieselStaffId)?.name ?? "", nozzleId: "diesel_1" }
    ].filter((assignment) => assignment.staffId);
    const payload = {
      name: String(form.get("name")),
      businessDate: String(form.get("businessDate")),
      staffOnDuty: assignments.map((assignment) => assignment.staffName),
      staffAssignments: assignments,
      openingNozzleReadings: {
        petrol_1: String(form.get("petrolOpening")),
        diesel_1: String(form.get("dieselOpening"))
      },
      openingTankStocks: {
        petrol_tank: String(form.get("petrolStock")),
        diesel_tank: String(form.get("dieselStock"))
      }
    };
    try {
      const response = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current ??= crypto.randomUUID() },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not open the shift");
      router.push(`/shifts/${body.id}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the shift");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">1</span><div><h2>Shift details</h2><p>One record connects every reading and collection.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Shift name</span><select defaultValue="Evening shift" name="name"><option>Morning shift</option><option>Evening shift</option><option>Night shift</option></select></label>
          <label className="field"><span>Business date</span><input defaultValue={defaults.businessDate} name="businessDate" required type="date" /></label>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">2</span><div><h2>Machine allocation</h2><p>Choose the operator responsible for each totalizer and handover.</p></div></div>
        {staff.length ? <div className="machine-allocation-grid">
          <label className="machine-allocation petrol"><span className="machine-code">P1</span><span><strong>Petrol machine</strong><small>₹102.50 per litre</small></span><select aria-label="Petrol machine operator" name="petrolStaffId" required><option value="">Choose operator</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label className="machine-allocation diesel"><span className="machine-code">D1</span><span><strong>Diesel machine</strong><small>₹100.50 per litre</small></span><select aria-label="Diesel machine operator" name="dieselStaffId" required><option value="">Choose operator</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        </div> : <p className="empty-state">Add staff from Staff &amp; attendance before opening the shift.</p>}
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">3</span><div><h2>Opening totalizers</h2><p>Enter the cumulative reading shown on each active nozzle.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Petrol nozzle P1</span><span className="input-wrap"><input defaultValue={defaults.petrolOpening} min="0" name="petrolOpening" required step="0.001" type="number" /><span className="unit">L</span></span></label>
          <label className="field"><span>Diesel nozzle D1</span><span className="input-wrap"><input defaultValue={defaults.dieselOpening} min="0" name="dieselOpening" required step="0.001" type="number" /><span className="unit">L</span></span></label>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">4</span><div><h2>Opening tank stock</h2><p>Record the physical stock derived from the opening dip.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Petrol tank P1</span><span className="input-wrap"><input defaultValue={defaults.petrolStock} min="0" name="petrolStock" required step="0.001" type="number" /><span className="unit">L</span></span></label>
          <label className="field"><span>Diesel tank D1</span><span className="input-wrap"><input defaultValue={defaults.dieselStock} min="0" name="dieselStock" required step="0.001" type="number" /><span className="unit">L</span></span></label>
        </div>
      </section>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button primary" disabled={saving || !staff.length} type="submit">{saving ? <Gauge className="spin" size={16} /> : <Play size={15} />} {saving ? "Opening…" : "Open shift"}</button></div>
    </form>
  );
}
