import { BookOpenCheck } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

export default function ImplementationPage() {
  return <main className="page"><PageHeader eyebrow="Owner runbook" title="How the system works" description="The shortest path from physical readings to a trusted daily position." /><section className="panel panel-pad reveal reveal-2"><div className="panel-header"><div><p className="panel-kicker">Daily sequence</p><h2 className="panel-title">Open → record → close → reconcile</h2></div><BookOpenCheck color="#0d6b5d" size={20} /></div><ol className="bar-list"><li>Open the shift with nozzle totalizers, tank stock and staff names if useful.</li><li>Record fuel deliveries, quality checks and expenses during the shift.</li><li>Enter closing readings, test fuel, tender totals and physical cash.</li><li>Review server-calculated fuel, tank, payment, cash and margin differences.</li><li>Close and lock the shift. Closed values are immutable in v1.</li></ol></section></main>;
}
