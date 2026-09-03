import { notFound } from "next/navigation";

import { FuelReceiptEditForm } from "@/components/stock/fuel-receipt-edit-form";
import { PageHeader } from "@/components/ui/page-header";
import { listFuelReceipts } from "@/server/repositories/journal-store";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export const dynamic = "force-dynamic";

export default async function EditFuelReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [receipts, configuration] = await Promise.all([
    listFuelReceipts({ includeVoided: true }),
    getForecourtConfigStore().getConfiguration()
  ]);
  const receipt = receipts.find((item) => item.id === id);
  if (!receipt || receipt.voided) notFound();
  const productName = configuration.products.find((product) => product.id === receipt.product)?.name ?? receipt.product;
  const tankName = configuration.tanks.find((tank) => tank.id === receipt.tankId)?.name ?? receipt.tankId;
  return (
    <main className="page">
      <PageHeader eyebrow="Inventory movement" title="Correct a fuel receipt" description="Correcting the accepted quantity adjusts the tank balance by the difference and keeps the original entry in history." />
      <section className="panel panel-pad form-panel reveal reveal-2">
        <FuelReceiptEditForm productName={productName} receipt={receipt} tankName={tankName} />
      </section>
    </main>
  );
}
