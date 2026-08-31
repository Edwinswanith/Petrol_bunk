"use client";

import { CheckCircle2, Droplets } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

export function DensityCheckForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/density-checks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current ??= crypto.randomUUID()
        },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the quality check");
      setSaved(true);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the quality check");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return <div className="success-message" role="status"><CheckCircle2 size={20} /><span><strong>Quality check recorded</strong><span>The daily density and water register has been updated.</span></span></div>;
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Date</span><input defaultValue={defaultDate} name="date" required type="date" /></label>
        <label className="field"><span>Tank</span><select name="tankId"><option value="petrol_tank">Tank P1 · Petrol</option><option value="diesel_tank">Tank D1 · Diesel</option></select></label>
        <label className="field"><span>Temperature °C</span><input min="0" name="temperature" required step="0.1" type="number" /></label>
        <label className="field"><span>Density @15°C</span><input min="0.001" name="observedDensity" required step="0.001" type="number" /></label>
        <label className="field"><span>Water dip (mm)</span><input min="0" name="waterDip" required step="0.1" type="number" /></label>
        <label className="field full"><span>Note, optional</span><textarea name="note" /></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button primary" disabled={saving} type="submit"><Droplets size={16} />{saving ? "Saving…" : "Save quality check"}</button></div>
    </form>
  );
}
