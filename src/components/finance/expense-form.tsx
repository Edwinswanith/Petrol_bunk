"use client";

import { CheckCircle2, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

export function ExpenseForm({ defaultDate }: { defaultDate: string }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current ??= crypto.randomUUID() },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the expense");
      setSaved(true);
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the expense");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="success-message" role="status">
        <CheckCircle2 aria-hidden="true" size={21} />
        <span><strong>Expense recorded</strong><span>It is included in today&apos;s management profit.</span><Link className="inline-link" href="/finance">Return to money &amp; margin</Link></span>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Category</span><select defaultValue="" name="category" required><option disabled value="">Choose a category</option><option value="maintenance">Maintenance</option><option value="electricity">Electricity</option><option value="salary">Salary</option><option value="cleaning">Cleaning</option><option value="bank_charges">Bank charges</option><option value="other">Other</option></select></label>
        <label className="field"><span>Amount</span><span className="input-wrap"><input min="0.01" name="amount" placeholder="0.00" required step="0.01" type="number" /><span className="unit">₹</span></span></label>
        <label className="field"><span>Paid through</span><select defaultValue="upi" name="paymentMethod"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></label>
        <label className="field"><span>Date</span><input defaultValue={defaultDate} name="date" required type="date" /></label>
        <label className="field full"><span>Note</span><textarea name="note" placeholder="What was this expense for?" required /></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button primary" disabled={saving} type="submit"><ReceiptText aria-hidden="true" size={16} />{saving ? "Saving…" : "Save expense"}</button></div>
    </form>
  );
}
