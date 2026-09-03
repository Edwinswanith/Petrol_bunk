"use client";

import { CheckCircle2, Save } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

type EditableReceipt = {
  id: string; supplier: string; invoiceNumber: string; tankerNumber: string;
  invoiceQuantity: string; acceptedQuantity: string; invoiceDensity: string; observedDensity: string;
  landedCost: string; note?: string;
};

export function FuelReceiptEditForm({ receipt, productName, tankName }: { receipt: EditableReceipt; productName: string; tankName: string }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [acceptedQuantity, setAcceptedQuantity] = useState(receipt.acceptedQuantity);
  const [landedCost, setLandedCost] = useState(receipt.landedCost);
  const derivedCostPerLitre = Number(acceptedQuantity) > 0 && Number(landedCost) > 0 ? Number(landedCost) / Number(acceptedQuantity) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch(`/api/fuel-receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the correction");
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the correction");
    } finally {
      setSaving(false);
    }
  }

  if (saved) return <div className="success-message" role="status"><CheckCircle2 size={21} /><span><strong>Receipt corrected</strong><span>The tank balance has been adjusted by the difference.</span><Link className="inline-link" href="/stock">Return to fuel &amp; stock</Link></span></div>;

  return (
    <form onSubmit={submit}>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">1</span><div><h2>Invoice and tanker</h2><p>{productName} into {tankName} — the tank cannot be changed here; void and re-enter the receipt instead.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Supplier / OMC</span><input defaultValue={receipt.supplier} name="supplier" required /></label>
          <label className="field"><span>Invoice number</span><input defaultValue={receipt.invoiceNumber} name="invoiceNumber" required /></label>
          <label className="field"><span>Tanker number</span><input defaultValue={receipt.tankerNumber} name="tankerNumber" required /></label>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">2</span><div><h2>Quantity and quality</h2><p>Correcting the accepted quantity adjusts the tank balance by the difference.</p></div></div>
        <div className="form-grid three">
          <label className="field"><span>Invoice quantity</span><span className="input-wrap"><input defaultValue={receipt.invoiceQuantity} min="0.001" name="invoiceQuantity" required step="0.001" type="number" /><span className="unit">L</span></span></label>
          <label className="field"><span>Accepted quantity</span><span className="input-wrap"><input min="0.001" name="acceptedQuantity" onChange={(event) => setAcceptedQuantity(event.target.value)} required step="0.001" type="number" value={acceptedQuantity} /><span className="unit">L</span></span></label>
          <label className="field"><span>Invoice density @15°C</span><input defaultValue={receipt.invoiceDensity} min="0.001" name="invoiceDensity" required step="0.001" type="number" /></label>
          <label className="field"><span>Observed density @15°C</span><input defaultValue={receipt.observedDensity} min="0.001" name="observedDensity" required step="0.001" type="number" /></label>
          <label className="field"><span>Total landed cost</span><span className="input-wrap"><input min="0.01" name="landedCost" onChange={(event) => setLandedCost(event.target.value)} required step="0.01" type="number" value={landedCost} /><span className="unit">₹</span></span>{derivedCostPerLitre !== null ? <small className="field-help">≈ ₹{derivedCostPerLitre.toFixed(2)} / litre</small> : null}</label>
          <label className="field full"><span>Receipt note</span><textarea defaultValue={receipt.note} name="note" placeholder="Seal, compartment or shortage notes" /></label>
          <label className="field full"><span>Reason for this correction</span><input maxLength={300} name="reason" placeholder="Why is this receipt being corrected?" required /></label>
        </div>
      </section>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button primary" disabled={saving} type="submit"><Save size={16} />{saving ? "Saving…" : "Save correction"}</button></div>
    </form>
  );
}
