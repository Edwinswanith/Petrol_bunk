import { ArrowRight, BellRing, BookOpenCheck, FileSpreadsheet, Gauge, Settings, Truck, UsersRound } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { listExpenses } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { buildDashboardViewModel } from "@/server/services/dashboard-service";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

const items = [
  { href: "/reports", title: "Reports & exports", description: "Daily, shift, stock, density and margin views.", icon: FileSpreadsheet },
  { href: "/staff", title: "Staff records", description: "Names and shift participation only; no logins.", icon: UsersRound },
  { href: "/stock/receipts/new", title: "Suppliers & receipts", description: "Fuel delivery evidence and quantity history.", icon: Truck },
  { href: "/shifts", title: "Closed shift history", description: "Readings, reconciliations and immutable close records.", icon: Gauge },
  { href: "/settings", title: "Products, tanks & stations", description: "Fuel grades, prices, tank stock and totalizer mappings.", icon: Settings },
  { href: "/implementation", title: "Owner runbook", description: "How opening, recording and closing work.", icon: BookOpenCheck }
];

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const [shifts, expenses, configuration] = await Promise.all([
    getOperationsRepository().listShifts(),
    listExpenses(),
    getForecourtConfigStore().getConfiguration()
  ]);
  const alerts = buildDashboardViewModel({ shifts, expenses, configuration }).alerts;
  return <main className="page"><PageHeader eyebrow="Owner controls" title="More" description="Reports, records and outlet settings that sit outside the daily shift." /><div className="three-column reveal reveal-2">{items.map((item) => { const Icon = item.icon; return <Link className="panel feature-card" href={item.href} key={item.href}><span className="feature-icon"><Icon size={20} /></span><span><h2>{item.title}</h2><p>{item.description}</p></span><span className="feature-link">Open <ArrowRight size={14} /></span></Link>; })}</div><section className="panel panel-pad reveal reveal-3" id="alerts" style={{ marginTop: 16 }}><div className="panel-header"><div><p className="panel-kicker">Personal exceptions</p><h2 className="panel-title">Alert centre</h2></div><BellRing color="#a96b18" size={19} /></div><div className="alert-list">{alerts.map((alert) => <Link className={`alert-card ${alert.severity}`} href={alert.href} key={alert.id}><span className="alert-icon"><BellRing size={15} /></span><span><strong>{alert.title}</strong><span>{alert.detail}</span></span><ArrowRight size={14} /></Link>)}</div></section></main>;
}
