"use client";

import { CirclePlus, Droplets, Fuel, Gauge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { ForecourtConfiguration } from "@/server/domain/forecourt";

async function createResource(path: string, form: HTMLFormElement, transform?: (data: Record<string, string>) => Record<string, unknown>) {
  const values = Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value)]));
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(transform ? transform(values) : values) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Could not save the configuration");
}

function SetupForm({ title, description, icon, children, onSubmit, button, disabled }: { title: string; description: string; icon: ReactNode; children: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void; button: string; disabled: boolean }) {
  return <form className="panel panel-pad" onSubmit={onSubmit}><div className="panel-header"><div><p className="panel-kicker">Configuration</p><h2 className="panel-title">{title}</h2></div>{icon}</div><p className="page-description small">{description}</p><div className="form-grid" style={{ marginTop: 16 }}>{children}</div><div className="form-actions"><button className="button primary" disabled={disabled} type="submit"><CirclePlus size={15} />{disabled ? "Saving…" : button}</button></div></form>;
}

export function ForecourtSetup({ configuration }: { configuration: ForecourtConfiguration }) {
  const router = useRouter(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = (path: string, transform?: (data: Record<string, string>) => Record<string, unknown>) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); const form = event.currentTarget;
    try { await createResource(path, form, transform); form.reset(); router.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the configuration"); }
    finally { setSaving(false); }
  };
  const updatePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget); const productId = String(form.get("productId"));
    try {
      const sellingPrice = String(form.get("sellingPricePerLitre"));
      const response = await fetch(`/api/products/${productId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellingPricePerLitre: sellingPrice, costPricePerLitre: String(form.get("costPricePerLitre")), marketReferencePrice: sellingPrice }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not update the price"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the price"); }
    finally { setSaving(false); }
  };
  const productName = (id: string) => configuration.products.find((product) => product.id === id)?.name ?? "Unknown";
  const tankName = (id: string) => configuration.tanks.find((tank) => tank.id === id)?.name ?? "Unknown";

  return <>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="three-column reveal reveal-2" aria-busy={saving}>
      <SetupForm title="Add fuel product" description="Petrol, diesel, XP95, X100 or any custom grade." icon={<Fuel color="#0d6b5d" size={20} />} button="Add product" disabled={saving} onSubmit={submit("/api/products")}>
        <label className="field"><span>Code</span><input name="code" placeholder="XP95" required /></label><label className="field"><span>Name</span><input name="name" placeholder="XP95" required /></label><label className="field"><span>Customer selling price / L</span><input min="0" name="sellingPricePerLitre" required step="0.01" type="number" /></label><label className="field"><span>Reseller purchase price / L</span><input min="0" name="costPricePerLitre" required step="0.01" type="number" /></label>
      </SetupForm>
      <SetupForm title="Update fuel price" description="The new price applies to future shifts; open and closed shifts retain their snapshots." icon={<Fuel color="#0d6b5d" size={20} />} button="Update price" disabled={saving} onSubmit={updatePrice}>
        <label className="field full"><span>Fuel product</span><select name="productId" required>{configuration.products.map((product) => <option key={product.id} value={product.id}>{product.name} · ₹{product.sellingPricePerLitre}</option>)}</select></label><label className="field"><span>Customer selling price / L</span><input min="0" name="sellingPricePerLitre" required step="0.01" type="number" /></label><label className="field"><span>Reseller purchase price / L</span><input min="0" name="costPricePerLitre" required step="0.01" type="number" /></label>
      </SetupForm>
      <SetupForm title="Add fuel tank" description="A tank belongs to exactly one fuel product." icon={<Droplets color="#0d6b5d" size={20} />} button="Add tank" disabled={saving} onSubmit={submit("/api/tanks")}>
        <label className="field"><span>Code</span><input name="code" placeholder="XT1" required /></label><label className="field"><span>Name</span><input name="name" placeholder="XP95 Tank" required /></label><label className="field full"><span>Fuel product</span><select name="productId" required>{configuration.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="field"><span>Capacity</span><input min="0.001" name="capacityLitres" required step="0.001" type="number" /></label><label className="field"><span>Opening stock</span><input min="0" name="currentStock" required step="0.001" type="number" /></label>
      </SetupForm>
      <SetupForm title="Add station" description="Each totalizer station is mapped to its product and source tank." icon={<Gauge color="#0d6b5d" size={20} />} button="Add station" disabled={saving} onSubmit={submit("/api/stations", (data) => ({ ...data, totalizerPrecision: Number(data.totalizerPrecision) }))}>
        <label className="field"><span>Code</span><input name="code" placeholder="X1" required /></label><label className="field"><span>Name</span><input name="name" placeholder="XP95 Station 1" required /></label><label className="field"><span>Fuel product</span><select name="productId" required>{configuration.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="field"><span>Source tank</span><select name="tankId" required>{configuration.tanks.map((tank) => <option key={tank.id} value={tank.id}>{tank.name} · {productName(tank.productId)}</option>)}</select></label><label className="field full"><span>Totalizer decimal places</span><select defaultValue="3" name="totalizerPrecision"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
      </SetupForm>
    </div>
    <section className="panel panel-pad reveal reveal-3" style={{ marginTop: 16 }}><div className="panel-header"><div><p className="panel-kicker">Active layout</p><h2 className="panel-title">Nozzles and tank links</h2></div><span className="status-pill healthy">{configuration.stations.filter((station) => station.active).length} nozzles</span></div><table className="data-table"><thead><tr><th>Nozzle</th><th>Pump side</th><th>Product</th><th>Source tank</th><th>Price / L</th><th>Book stock</th></tr></thead><tbody>{configuration.stations.filter((station) => station.active).map((station) => { const product = configuration.products.find((item) => item.id === station.productId); const tank = configuration.tanks.find((item) => item.id === station.tankId); return <tr key={station.id}><td><span className="table-title">{station.code}</span><span className="table-subtitle">{station.name}</span></td><td>{station.dispenserCode ? `Pump ${station.dispenserCode} · ${station.sideLabel}` : "Independent"}</td><td>{product?.name}</td><td>{tankName(station.tankId)}</td><td className="mono">₹{product?.sellingPricePerLitre}</td><td className="mono">{tank?.currentStock} L</td></tr>; })}</tbody></table></section>
  </>;
}
