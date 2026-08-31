import { DensityCheckForm } from "@/components/stock/density-check-form";
import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { listDensityChecks } from "@/server/repositories/quality-store";

export const dynamic = "force-dynamic";

export default async function DensityPage() {
  const date = businessDate();
  const checks = (await listDensityChecks()).filter((check) => check.date === date);
  const latestPetrol = checks.find((check) => check.tankId === "petrol_tank");
  const latestDiesel = checks.find((check) => check.tankId === "diesel_tank");
  const complete = Boolean(latestPetrol && latestDiesel);
  const waterDip = checks.length ? Math.max(...checks.map((check) => Number(check.waterDip))) : null;
  return <main className="page"><PageHeader eyebrow="Daily quality record" title="Density & water dip" description="Record each tank check and retain the detailed value behind the owner status." /><section className="summary-strip reveal reveal-2"><div className="summary-cell"><span>Petrol density</span><strong>{latestPetrol?.observedDensity ?? "—"}</strong></div><div className="summary-cell"><span>Diesel density</span><strong>{latestDiesel?.observedDensity ?? "—"}</strong></div><div className="summary-cell"><span>Highest water dip</span><strong>{waterDip === null ? "—" : `${waterDip} mm`}</strong></div><div className="summary-cell"><span>Daily status</span><strong>{complete ? "Complete" : "Pending"}</strong></div></section><div className="two-column reveal reveal-3"><section className="panel panel-pad"><div className="panel-header"><div><p className="panel-kicker">{date}</p><h2 className="panel-title">Quality register</h2></div><span className={`status-pill ${complete ? "healthy" : "warning"}`}>{complete ? "Complete" : "Pending"}</span></div>{checks.length ? <table className="data-table"><thead><tr><th>Tank</th><th>Temperature</th><th>Density @15°C</th><th>Water dip</th></tr></thead><tbody>{checks.map((check) => <tr key={check.id}><td><span className="table-title">{check.tankId === "petrol_tank" ? "Tank P1 · Petrol" : "Tank D1 · Diesel"}</span></td><td>{check.temperature}°C</td><td className="mono">{check.observedDensity} kg/m³</td><td>{check.waterDip} mm</td></tr>)}</tbody></table> : <p className="empty-state">No quality checks recorded today.</p>}</section><aside className="panel panel-pad"><div className="panel-header"><div><p className="panel-kicker">New reading</p><h2 className="panel-title">Record a check</h2></div></div><DensityCheckForm defaultDate={date} /></aside></div></main>;
}
