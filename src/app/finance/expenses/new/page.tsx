import { ExpenseForm } from "@/components/finance/expense-form";
import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";

export default function NewExpensePage() {
  return <main className="page"><PageHeader eyebrow="Simple cash control" title="Record an expense" description="One short form. Cash-paid expenses flow into the handover calculation." /><section className="panel panel-pad form-panel reveal reveal-2"><ExpenseForm defaultDate={businessDate()} /></section></main>;
}
