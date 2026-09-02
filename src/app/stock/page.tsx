import { ArrowRight, Boxes, Droplets, Plus, Truck } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { TankStockEditor } from "@/components/stock/tank-stock-editor";
import { businessDate } from "@/lib/business-time";
import { listExpenses, listFuelReceipts } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { buildDashboardViewModel } from "@/server/services/dashboard-service";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

const lubricants = [
  { name: "Servo 4T 20W-40", pack: "1 L", stock: 18, reorder: 8, price: "₹420" },
  { name: "MAK 5W-30", pack: "1 L", stock: 6, reorder: 6, price: "₹690" },
  { name: "Coolant concentrate", pack: "500 ml", stock: 14, reorder: 5, price: "₹180" }
];

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const [shifts, expenses, receipts, configuration] = await Promise.all([
    getOperationsRepository().listShifts(),
    listExpenses(),
    listFuelReceipts(),
    getForecourtConfigStore().getConfiguration()
  ]);
  const dashboard = buildDashboardViewModel({ shifts, expenses, configuration });
  return (
    <main className="page">
      <PageHeader eyebrow="Physical inventory" title="Fuel & stock" description="Current tank position, quality checks and packaged inventory in one place." action={{ label: "Receive fuel", href: "/stock/receipts/new", icon: <Truck size={16} /> }} />
      <section className="stock-grid reveal reveal-2">
        {dashboard.tanks.map((tank) => (
          <article className={`panel panel-pad tank-card ${tank.product.toLowerCase()}`} key={tank.id}>
            <div className="tank-top"><div><p className="panel-kicker">{tank.name} · {tank.product}</p><strong className="tank-value mono">{tank.litres}</strong></div><span className={`status-pill ${tank.status === "healthy" ? "healthy" : "warning"}`}>{tank.status}</span></div>
            <div className="tank-bar"><span style={{ width: `${tank.percentage}%` }} /></div>
            <div className="tank-foot"><span>{tank.percentage}% of {tank.capacityLitres}</span><span>{tank.daysRemaining} forecast</span></div>
            <div className="form-actions"><Link className="button soft" href={`/stock/${tank.id}`}>Tank history <ArrowRight size={13} /></Link></div>
          </article>
        ))}
      </section>

      <section className="panel panel-pad reveal reveal-3 stock-adjustment-panel" style={{ marginTop: 16 }}>
        <div className="panel-header"><div><p className="panel-kicker">Owner stock control</p><h2 className="panel-title">Enter or edit current tank stock</h2></div><span className="status-pill closed">Manual adjustment</span></div>
        <p className="page-description small">Use the physical dip reading when starting the app for the first time, or correct a recorded balance later. Every change is saved in tank history.</p>
        <TankStockEditor businessDate={businessDate()} tanks={configuration.tanks.filter((tank) => tank.active).map((tank) => ({ ...tank, productName: configuration.products.find((product) => product.id === tank.productId)?.name ?? "Fuel" }))} />
      </section>

      <div className="three-column reveal reveal-4" style={{ marginTop: 16 }}>
        <Link className="panel feature-card" href="/stock/density"><span className="feature-icon"><Droplets size={20} /></span><span><h2>Density & quality</h2><p>Morning and post-receipt readings with water-dip checks.</p></span><span className="feature-link">Open register <ArrowRight size={14} /></span></Link>
        <Link className="panel feature-card" href="/stock/receipts/new"><span className="feature-icon"><Truck size={20} /></span><span><h2>Fuel receipts</h2><p>Capture invoice, tanker, accepted quantity and density.</p></span><span className="feature-link">Record delivery <ArrowRight size={14} /></span></Link>
        <Link className="panel feature-card" href="#lubricants"><span className="feature-icon"><Boxes size={20} /></span><span><h2>Packaged goods</h2><p>Engine oil, coolant and add-on inventory.</p></span><span className="feature-link">View products <ArrowRight size={14} /></span></Link>
      </div>

      <section className="panel panel-pad reveal reveal-4" id="lubricants" style={{ marginTop: 16 }}>
        <div className="panel-header"><div><p className="panel-kicker">Packaged inventory reference</p><h2 className="panel-title">Lubricants & add-ons</h2></div><span className="status-pill closed">Owner list</span></div>
        <table className="data-table"><thead><tr><th>Product</th><th>Available</th><th>Reorder at</th><th>Selling price</th><th>Status</th></tr></thead><tbody>{lubricants.map((item) => <tr key={item.name}><td><span className="table-title">{item.name}</span><span className="table-subtitle">Pack size {item.pack}</span></td><td className="mono">{item.stock}</td><td>{item.reorder}</td><td>{item.price}</td><td><span className={`status-pill ${item.stock <= item.reorder ? "warning" : "healthy"}`}>{item.stock <= item.reorder ? "Reorder" : "Healthy"}</span></td></tr>)}</tbody></table>
      </section>
      <section className="panel panel-pad reveal reveal-4" style={{ marginTop: 16 }}>
        <div className="panel-header"><div><p className="panel-kicker">Delivery ledger</p><h2 className="panel-title">Recent fuel receipts</h2></div><Link className="button soft" href="/stock/receipts/new"><Plus size={14} /> Receive fuel</Link></div>
        {receipts.length ? <table className="data-table"><thead><tr><th>Invoice</th><th>Product</th><th>Accepted</th><th>Density @15°C</th><th>Supplier</th></tr></thead><tbody>{receipts.slice(0, 12).map((receipt) => <tr key={receipt.id}><td><span className="table-title">{receipt.invoiceNumber}</span><span className="table-subtitle">{receipt.tankerNumber}</span></td><td>{configuration.products.find((product) => product.id === receipt.product)?.name ?? receipt.product}</td><td className="mono">{Number(receipt.acceptedQuantity).toLocaleString("en-IN")} L</td><td className="mono">{receipt.observedDensity}</td><td>{receipt.supplier}</td></tr>)}</tbody></table> : <p className="empty-state">No fuel receipt has been recorded yet.</p>}
      </section>
    </main>
  );
}
