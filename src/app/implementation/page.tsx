import { BookOpenCheck } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

export default function ImplementationPage() {
  return <main className="page"><PageHeader eyebrow="Owner runbook" title="How the system works" description="The shortest path from physical readings to a trusted daily position." /><section className="panel panel-pad reveal reveal-2"><div className="panel-header"><div><p className="panel-kicker">Daily sequence</p><h2 className="panel-title">Configure → open → record → close</h2></div><BookOpenCheck color="#0d6b5d" size={20} /></div><ol className="bar-list"><li>Configure fuel products, prices, tanks and totalizer stations under Settings.</li><li>Open the shift, assign operators, and confirm station totalizers and tank stock.</li><li>Record deliveries, quality checks and expenses during the shift.</li><li>Enter closing readings, test fuel, physical tank stock and tender totals.</li><li>Review sales, staff, payment and tank variances. Explain material differences.</li><li>Close once: station outflow is deducted from tank inventory and the shift is locked atomically.</li></ol></section></main>;
}
