"use client";

import { CheckCircle2, Truck } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { FuelProduct, FuelTank } from "@/server/domain/forecourt";

const fallbackProducts: FuelProduct[] = [
  { id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80", active: true, createdAt: "", updatedAt: "" },
  { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40", active: true, createdAt: "", updatedAt: "" }
];
const fallbackTanks: FuelTank[] = [
  { id: "petrol_tank", code: "PT1", name: "Petrol Tank 1", productId: "petrol", capacityLitres: "20000", currentStock: "0", active: true, createdAt: "", updatedAt: "" },
  { id: "diesel_tank", code: "DT1", name: "Diesel Tank 1", productId: "diesel", capacityLitres: "20000", currentStock: "0", active: true, createdAt: "", updatedAt: "" }
];

export function FuelReceiptForm({ products = fallbackProducts, tanks = fallbackTanks }: { products?: FuelProduct[]; tanks?: FuelTank[] }) {
  const activeProducts = products.filter((item) => item.active);
  const [product, setProduct] = useState(activeProducts[0]?.id ?? "");
  const productTanks = tanks.filter((tank) => tank.active && tank.productId === product);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/fuel-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current ??= crypto.randomUUID() },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not record the receipt");
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record the receipt");
    } finally {
      setSaving(false);
    }
  }

  if (saved) return <div className="success-message" role="status"><CheckCircle2 size={21} /><span><strong>Fuel receipt recorded</strong><span>The accepted quantity will be included when the active shift is reconciled.</span><Link className="inline-link" href="/stock">Return to fuel &amp; stock</Link></span></div>;

  return (
    <form onSubmit={submit}>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">1</span><div><h2>Invoice and tanker</h2><p>Use the invoice as the delivery reference.</p></div></div>
        <div className="form-grid">
          <label className="field"><span>Supplier / OMC</span><input defaultValue="IndianOil" name="supplier" required /></label>
          <label className="field"><span>Invoice number</span><input name="invoiceNumber" placeholder="INV-2026-" required /></label>
          <label className="field"><span>Tanker number</span><input name="tankerNumber" placeholder="TN 00 AB 0000" required /></label>
          <label className="field"><span>Product</span><select name="product" onChange={(event) => setProduct(event.target.value)} value={product}>{activeProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-heading"><span className="step-number">2</span><div><h2>Quantity and quality</h2><p>Record the accepted movement and its delivery quality evidence.</p></div></div>
        <div className="form-grid three">
          <label className="field"><span>Target tank</span><select name="tankId" required>{productTanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.name} · {tank.currentStock} L available</option>)}</select></label>
          <label className="field"><span>Invoice quantity</span><span className="input-wrap"><input min="0.001" name="invoiceQuantity" required step="0.001" type="number" /><span className="unit">L</span></span></label>
          <label className="field"><span>Accepted quantity</span><span className="input-wrap"><input min="0.001" name="acceptedQuantity" required step="0.001" type="number" /><span className="unit">L</span></span></label>
          <label className="field"><span>Invoice density @15°C</span><input min="0.001" name="invoiceDensity" required step="0.001" type="number" /></label>
          <label className="field"><span>Observed density @15°C</span><input min="0.001" name="observedDensity" required step="0.001" type="number" /></label>
          <label className="field"><span>Landed cost / litre</span><span className="input-wrap"><input min="0.01" name="landedCost" required step="0.01" type="number" /><span className="unit">₹</span></span></label>
          <label className="field full"><span>Receipt note</span><textarea name="note" placeholder="Seal, compartment or shortage notes" /></label>
        </div>
      </section>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button primary" disabled={saving} type="submit"><Truck size={16} />{saving ? "Recording…" : "Accept fuel receipt"}</button></div>
    </form>
  );
}
