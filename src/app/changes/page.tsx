import { FileClock } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

export default function ChangesPage() {
  return <main className="page"><PageHeader eyebrow="Protected history" title="Immutable v1 history" description="Closed shifts cannot be rewritten in this first version." /><section className="panel panel-pad reveal reveal-2"><div className="panel-header"><div><p className="panel-kicker">Simple protection</p><h2 className="panel-title">No correction workflow enabled</h2></div><FileClock color="#0d6b5d" size={19} /></div><div className="success-message"><FileClock size={20} /><span><strong>Original close records stay locked</strong><span>If a mistake is discovered, retain the closed shift and document the operational adjustment outside v1.</span></span></div></section></main>;
}
