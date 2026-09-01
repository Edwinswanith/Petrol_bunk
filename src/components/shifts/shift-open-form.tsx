"use client";

import { Gauge, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { StaffRecord } from "@/server/domain/staff";

export type ShiftFormStation = { id: string; code: string; name: string; productName: string; tankId: string; pricePerLitre: string };
export type ShiftFormTank = { id: string; code: string; name: string; productName: string; currentStock: string };
type OpeningDefaults = {
  businessDate: string;
  stationReadings?: Record<string, string>;
  tankStocks?: Record<string, string>;
  petrolOpening?: string; dieselOpening?: string; petrolStock?: string; dieselStock?: string;
};

const legacyStations: ShiftFormStation[] = [
  { id: "petrol_1", code: "P1", name: "Petrol machine", productName: "Petrol", tankId: "petrol_tank", pricePerLitre: "102.50" },
  { id: "diesel_1", code: "D1", name: "Diesel machine", productName: "Diesel", tankId: "diesel_tank", pricePerLitre: "100.50" }
];
const legacyTanks: ShiftFormTank[] = [
  { id: "petrol_tank", code: "PT1", name: "Petrol tank P1", productName: "Petrol", currentStock: "" },
  { id: "diesel_tank", code: "DT1", name: "Diesel tank D1", productName: "Diesel", currentStock: "" }
];

export function ShiftOpenForm({ defaults, staff = [], stations = legacyStations, tanks = legacyTanks }: { defaults: OpeningDefaults; staff?: StaffRecord[]; stations?: ShiftFormStation[]; tanks?: ShiftFormTank[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const stationDefault = (id: string) => defaults.stationReadings?.[id] ?? (id === "petrol_1" ? defaults.petrolOpening : id === "diesel_1" ? defaults.dieselOpening : "") ?? "";
  const tankDefault = (id: string, current: string) => defaults.tankStocks?.[id] ?? (id === "petrol_tank" ? defaults.petrolStock : id === "diesel_tank" ? defaults.dieselStock : current) ?? current;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const assignments = stations.map((station) => {
      const staffId = String(form.get(`staff-${station.id}`) ?? "");
      return { staffId, staffName: staff.find((person) => person.id === staffId)?.name ?? "", nozzleId: station.id };
    }).filter((assignment) => assignment.staffId);
    const payload = {
      name: String(form.get("name")), businessDate: String(form.get("businessDate")),
      staffOnDuty: [...new Set(assignments.map((assignment) => assignment.staffName))], staffAssignments: assignments,
      openingNozzleReadings: Object.fromEntries(stations.map((station) => [station.id, String(form.get(`station-${station.id}`) ?? "0")])),
      openingTankStocks: Object.fromEntries(tanks.map((tank) => [tank.id, String(form.get(`tank-${tank.id}`) ?? "0")]))
    };
    try {
      const response = await fetch("/api/shifts", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current ??= crypto.randomUUID() }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not open the shift");
      router.push(`/shifts/${body.id}`); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open the shift"); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit}>
    <section className="form-section"><div className="form-section-heading"><span className="step-number">1</span><div><h2>Shift details</h2><p>One record connects every station, reading and collection.</p></div></div><div className="form-grid"><label className="field"><span>Shift name</span><select defaultValue="Evening shift" name="name"><option>Morning shift</option><option>Evening shift</option><option>Night shift</option></select></label><label className="field"><span>Business date</span><input defaultValue={defaults.businessDate} name="businessDate" required type="date" /></label></div></section>
    <section className="form-section"><div className="form-section-heading"><span className="step-number">2</span><div><h2>Station allocation</h2><p>Assign every active station. One operator may run multiple stations.</p></div></div>{staff.length ? <div className="machine-allocation-grid">{stations.map((station) => <label className="machine-allocation" key={station.id}><span className="machine-code">{station.code}</span><span><strong>{station.name}</strong><small>{station.productName} · ₹{station.pricePerLitre} per litre</small></span><select aria-label={`${station.name} operator`} name={`staff-${station.id}`} required><option value="">Choose operator</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>)}</div> : <p className="empty-state">Add staff from Staff &amp; attendance before opening the shift.</p>}</section>
    <section className="form-section"><div className="form-section-heading"><span className="step-number">3</span><div><h2>Opening totalizers</h2><p>Previous closing readings are suggested. Confirm each totalizer.</p></div></div><div className="form-grid">{stations.map((station) => <label className="field" key={station.id}><span>{station.code} · {station.productName}</span><span className="input-wrap"><input defaultValue={stationDefault(station.id)} min="0" name={`station-${station.id}`} required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</div></section>
    <section className="form-section"><div className="form-section-heading"><span className="step-number">4</span><div><h2>Opening tank stock</h2><p>Confirm the physical position for every connected tank.</p></div></div><div className="form-grid">{tanks.map((tank) => <label className="field" key={tank.id}><span>{tank.name} · {tank.productName}</span><span className="input-wrap"><input defaultValue={tankDefault(tank.id, tank.currentStock)} min="0" name={`tank-${tank.id}`} required step="0.001" type="number" /><span className="unit">L</span></span></label>)}</div></section>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="form-actions"><button className="button primary" disabled={saving || !staff.length || !stations.length} type="submit">{saving ? <Gauge className="spin" size={16} /> : <Play size={15} />} {saving ? "Opening…" : `Open shift · ${stations.length} station${stations.length === 1 ? "" : "s"}`}</button></div>
  </form>;
}
