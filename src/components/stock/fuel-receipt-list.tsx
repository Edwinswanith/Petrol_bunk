"use client";

import { Ban, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FuelProduct } from "@/server/domain/forecourt";

export type ReceiptRow = {
  id: string; invoiceNumber: string; tankerNumber: string; product: string;
  acceptedQuantity: string; observedDensity: string; supplier: string;
  voided?: boolean; voidReason?: string;
};

function VoidReceiptButton({ receipt }: { receipt: ReceiptRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function confirmVoid() {
    if (reason.trim().length < 2) { setError("Enter a reason (2+ characters)"); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/fuel-receipts/${receipt.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not void the receipt");
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (reasonCaught) {
      setError(reasonCaught instanceof Error ? reasonCaught.message : "Could not void the receipt");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return <button className="button soft danger" onClick={() => setOpen(true)} type="button"><Ban size={13} /> Void</button>;
  }
  return (
    <span className="void-receipt-prompt">
      <input aria-label={`Reason to void receipt ${receipt.invoiceNumber}`} onChange={(event) => setReason(event.target.value)} placeholder="Reason for voiding" value={reason} />
      <button className="button soft danger" disabled={saving} onClick={confirmVoid} type="button">{saving ? "Voiding…" : "Confirm void"}</button>
      <button className="button ghost" disabled={saving} onClick={() => { setOpen(false); setError(""); setReason(""); }} type="button">Cancel</button>
      {error ? <small className="form-error-inline">{error}</small> : null}
    </span>
  );
}

export function FuelReceiptList({ receipts, products }: { receipts: ReceiptRow[]; products: FuelProduct[] }) {
  if (!receipts.length) return <p className="empty-state">No fuel receipt has been recorded yet.</p>;
  return (
    <table className="data-table">
      <thead><tr><th>Invoice</th><th>Product</th><th>Accepted</th><th>Density @15°C</th><th>Supplier</th><th>Status</th><th /></tr></thead>
      <tbody>
        {receipts.slice(0, 12).map((receipt) => (
          <tr className={receipt.voided ? "voided-row" : undefined} key={receipt.id}>
            <td><span className="table-title">{receipt.invoiceNumber}</span><span className="table-subtitle">{receipt.tankerNumber}</span></td>
            <td>{products.find((product) => product.id === receipt.product)?.name ?? receipt.product}</td>
            <td className="mono">{Number(receipt.acceptedQuantity).toLocaleString("en-IN")} L</td>
            <td className="mono">{receipt.observedDensity}</td>
            <td>{receipt.supplier}</td>
            <td>{receipt.voided ? <span className="status-pill warning" title={receipt.voidReason}>Voided</span> : <span className="status-pill healthy">Active</span>}</td>
            <td className="table-actions">
              {receipt.voided ? null : (
                <span className="receipt-row-actions">
                  <Link className="button soft" href={`/stock/receipts/${receipt.id}/edit`}><Pencil size={13} /> Edit</Link>
                  <VoidReceiptButton receipt={receipt} />
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
