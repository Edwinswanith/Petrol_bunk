import { ShiftOpenForm } from "@/components/shifts/shift-open-form";
import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewShiftPage() {
  const shifts = await getOperationsRepository().listShifts();
  const active = shifts.find((shift) => shift.state === "OPEN");
  if (active) redirect(`/shifts/${active.id}`);
  const previous = shifts.find((shift) => shift.closingNozzleReadings && shift.closingTankStocks);
  const defaults = {
    businessDate: businessDate(),
    petrolOpening: previous?.closingNozzleReadings?.petrol_1 ?? "",
    dieselOpening: previous?.closingNozzleReadings?.diesel_1 ?? "",
    petrolStock: previous?.closingTankStocks?.petrol_tank ?? "",
    dieselStock: previous?.closingTankStocks?.diesel_tank ?? ""
  };
  return <main className="page"><PageHeader eyebrow="Guided opening" title="Open a shift" description="Follow the same order as the physical forecourt walk." /><section className="panel panel-pad form-panel reveal reveal-2"><ShiftOpenForm defaults={defaults} /></section></main>;
}
