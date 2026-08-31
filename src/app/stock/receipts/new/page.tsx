import { FuelReceiptForm } from "@/components/stock/fuel-receipt-form";
import { PageHeader } from "@/components/ui/page-header";

export default function NewFuelReceiptPage() {
  return <main className="page"><PageHeader eyebrow="Inventory movement" title="Receive fuel" description="Capture the delivery before it changes available tank stock." /><section className="panel panel-pad form-panel reveal reveal-2"><FuelReceiptForm /></section></main>;
}
