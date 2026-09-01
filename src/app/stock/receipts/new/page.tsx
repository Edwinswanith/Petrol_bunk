import { FuelReceiptForm } from "@/components/stock/fuel-receipt-form";
import { PageHeader } from "@/components/ui/page-header";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export const dynamic = "force-dynamic";

export default async function NewFuelReceiptPage() {
  const configuration = await getForecourtConfigStore().getConfiguration();
  return <main className="page"><PageHeader eyebrow="Inventory movement" title="Receive fuel" description="Accepted fuel immediately increases the selected tank and creates an auditable ledger movement." /><section className="panel panel-pad form-panel reveal reveal-2"><FuelReceiptForm products={configuration.products} tanks={configuration.tanks} /></section></main>;
}
