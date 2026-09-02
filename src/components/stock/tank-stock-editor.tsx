"use client";

import { CheckCircle2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type EditableTank = {
  id: string;
  name: string;
  productName: string;
  currentStock: string;
  capacityLitres: string;
};

function formatLitres(value: string) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function TankEditor({ businessDate, tank }: { businessDate: string; tank: EditableTank }) {
  const router = useRouter();
  const [recordedStock, setRecordedStock] = useState(tank.currentStock);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    setSuccess("");
    const form = new FormData(formElement);
    const currentStock = String(form.get("currentStock") ?? "");
    const reason = String(form.get("reason") ?? "");
    try {
      const response = await fetch(`/api/tanks/${tank.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStock, previousStock: recordedStock, businessDate, reason })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update tank stock");
      setRecordedStock(body.balanceAfter);
      setSuccess(`${tank.productName} stock updated to ${formatLitres(body.balanceAfter)} L`);
      formElement.reset();
      router.refresh();
    } catch (reasonCaught) {
      setError(reasonCaught instanceof Error ? reasonCaught.message : "Could not update tank stock");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={`stock-adjustment-card ${tank.productName.toLowerCase()}`} onSubmit={submit}>
      <header>
        <span><small>{tank.productName}</small><strong>{tank.name}</strong></span>
        <span className="stock-capacity"><small>Recorded / capacity</small><strong>{formatLitres(recordedStock)} / {formatLitres(tank.capacityLitres)} L</strong></span>
      </header>
      <div className="form-grid">
        <label className="field">
          <span>Current stock in litres</span>
          <span className="input-wrap"><input aria-label={`${tank.productName} current stock`} defaultValue={recordedStock} key={recordedStock} min="0" name="currentStock" required step="0.001" type="number" /><span className="unit">L</span></span>
        </label>
        <label className="field">
          <span>Reason for adjustment</span>
          <input aria-label={`${tank.productName} adjustment reason`} maxLength={300} name="reason" placeholder="First stock entry or physical dip correction" required />
        </label>
      </div>
      <p className="stock-adjustment-note">This updates the live tank balance and adds an adjustment to tank history for {businessDate}.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {success ? <p className="stock-save-success" role="status"><CheckCircle2 size={15} />{success}</p> : null}
      <div className="form-actions"><button className="button primary" disabled={saving} type="submit"><Save size={15} />{saving ? "Saving…" : `Save ${tank.productName} stock`}</button></div>
    </form>
  );
}

export function TankStockEditor({ businessDate, tanks }: { businessDate: string; tanks: EditableTank[] }) {
  return <div className="stock-adjustment-grid">{tanks.map((tank) => <TankEditor businessDate={businessDate} key={tank.id} tank={tank} />)}</div>;
}
