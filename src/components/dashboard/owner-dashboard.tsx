import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  BellRing,
  ChevronRight,
  ClipboardPenLine,
  Droplets,
  Fuel,
  Gauge,
  ReceiptText,
  TrendingUp,
  Truck,
  Play
} from "lucide-react";
import Link from "next/link";

import type { DashboardViewModel } from "@/contracts/dashboard";

function MetricCard({ metric }: { metric: DashboardViewModel["metrics"][number] }) {
  return (
    <article className="panel metric-card">
      <p className="metric-label">{metric.label}</p>
      <strong className="metric-value mono">{metric.value}</strong>
      <span className={`metric-detail ${metric.tone === "positive" ? "positive" : ""}`}>
        {metric.tone === "positive" ? <TrendingUp aria-hidden="true" size={13} /> : null}
        {metric.detail}
      </span>
    </article>
  );
}

export function OwnerDashboard({ dashboard }: { dashboard: DashboardViewModel }) {
  const activeShift = dashboard.currentShift;

  return (
    <main className="page">
      <div className="dashboard-topline reveal reveal-1">
        <div className="dashboard-heading">
          <p className="eyebrow">{dashboard.businessDateLabel}</p>
          <h1>{dashboard.greeting}</h1>
          <p className="page-description">Enter and review today’s forecourt operations.</p>
        </div>
        <div className="live-stamp">
          <span className="status-pill live">{dashboard.dataStatus}</span>
          <span><strong>{dashboard.lastUpdatedLabel}</strong>All systems reporting</span>
        </div>
      </div>

      <section className="metric-grid reveal reveal-2" aria-label="Business overview">
        {dashboard.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="shift-card reveal reveal-3" aria-labelledby="current-shift-title">
            <div className="shift-card-top">
              <div>
                <p className="panel-kicker">Current shift</p>
                <span className={`status-pill ${activeShift ? "live" : "closed"}`}>{activeShift ? activeShift.status : "NONE OPEN"}</span>
              </div>
              <Gauge aria-hidden="true" color="#9ec0b5" size={25} strokeWidth={1.5} />
            </div>
            <h2 id="current-shift-title">{activeShift?.name ?? "Ready for the next shift"}</h2>
            <p>{activeShift ? `${activeShift.startedAtLabel}${activeShift.staffOnDuty.length ? ` · ${activeShift.staffOnDuty.join(" & ")}` : ""}` : "Open a shift when the next forecourt handover begins."}</p>
            <div className="shift-progress">
              <div className="progress-track"><span style={{ width: `${activeShift?.completion ?? 0}%` }} /></div>
              <div className="shift-meta">
                <span>{activeShift ? `${activeShift.completion}% recorded` : "No readings in progress"}</span>
                {activeShift ? <><span>•</span><span>Closing readings remain</span></> : null}
              </div>
            </div>
            <div className="shift-actions">
              <Link className="button primary-light" href={activeShift ? `/shifts/${activeShift.id}` : "/shifts/new"}>
                {activeShift ? "Open shift workspace" : "Open next shift"} <ArrowRight aria-hidden="true" size={15} />
              </Link>
              <Link className="button" href="/shifts">All shifts</Link>
            </div>
          </section>

          <section className="panel panel-pad reveal reveal-4" aria-labelledby="stock-title">
            <div className="panel-header">
              <div><p className="panel-kicker">Latest physical reading</p><h2 className="panel-title" id="stock-title">Fuel stock</h2></div>
              <Link className="button ghost" href="/stock">View stock <ArrowUpRight size={14} /></Link>
            </div>
            <div className="stock-grid">
              {dashboard.tanks.map((tank) => (
                <article className={`tank-card ${tank.product.toLowerCase()}`} key={tank.id}>
                  <div className="tank-top">
                    <div><p className="tank-label">{tank.product} · {tank.name}</p><strong className="tank-value mono">{tank.litres}</strong></div>
                    <span className={`status-pill ${tank.status === "healthy" ? "healthy" : "warning"}`}>{tank.status === "healthy" ? "Healthy" : "Watch"}</span>
                  </div>
                  <div className="tank-bar" aria-label={`${tank.percentage}% full`}><span style={{ width: `${tank.percentage}%` }} /></div>
                  <div className="tank-foot"><span>{tank.percentage}% of {tank.capacityLitres}</span><span>{tank.daysRemaining} left</span></div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel panel-pad reveal reveal-4">
            <div className="panel-header">
              <div><p className="panel-kicker">Fast entry</p><h2 className="panel-title">Quick actions</h2></div>
            </div>
            <nav className="quick-actions" aria-label="Quick actions">
              <Link className="quick-action" href={activeShift ? `/shifts/${activeShift.id}` : "/shifts/new"}>{activeShift ? <ClipboardPenLine aria-hidden="true" size={20} /> : <Play aria-hidden="true" size={20} />}<strong>{activeShift ? "Continue shift" : "Open shift"}</strong></Link>
              <Link className="quick-action" href="/finance/expenses/new"><ReceiptText aria-hidden="true" size={20} /><strong>Record expense</strong></Link>
              <Link className="quick-action" href="/stock/receipts/new"><Truck aria-hidden="true" size={20} /><strong>Receive fuel</strong></Link>
            </nav>
          </section>
        </div>

        <aside className="dashboard-side">
          <section className="panel panel-pad reveal reveal-3" aria-labelledby="fuel-sold-title">
            <div className="panel-header"><div><p className="panel-kicker">Throughput</p><h2 className="panel-title" id="fuel-sold-title">Fuel sold</h2></div><Fuel size={19} color="#0d6b5d" /></div>
            <div className="bar-list">
              {dashboard.fuelSold.map((item) => (
                <div key={item.product}>
                  <div className="bar-row-top"><span>{item.product}</span><span className="mono">{item.litres}</span></div>
                  <div className="mini-bar"><span style={{ width: `${item.percentage}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel panel-pad reveal reveal-4" aria-labelledby="payment-title">
            <div className="panel-header"><div><p className="panel-kicker">Collections</p><h2 className="panel-title" id="payment-title">Payment mix</h2></div><Banknote size={19} color="#0d6b5d" /></div>
            <div className="payment-list">
              {dashboard.paymentMix.map((item) => (
                <div className="payment-row" key={item.method}>
                  <span>{item.method}</span><div className="mini-bar"><span style={{ width: `${item.percentage}%` }} /></div><strong className="mono">{item.amount}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel panel-pad reveal reveal-4" aria-labelledby="alerts-title">
            <div className="panel-header"><div><p className="panel-kicker">Owner exceptions</p><h2 className="panel-title" id="alerts-title">Needs attention</h2></div><BellRing size={18} color="#a96b18" /></div>
            <div className="alert-list">
              {dashboard.alerts.map((alert) => (
                <Link className={`alert-card ${alert.severity}`} href={alert.href} key={alert.id}>
                  <span className="alert-icon">{alert.severity === "warning" ? <Fuel size={16} /> : <Droplets size={16} />}</span>
                  <span><strong>{alert.title}</strong><span>{alert.detail}</span></span>
                  <ChevronRight aria-hidden="true" size={15} color="#77817d" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
