import { ShiftOpenForm } from "@/components/shifts/shift-open-form";
import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewShiftPage() {
  const [shifts, staff] = await Promise.all([getOperationsRepository().listShifts(), getStaffStore().listStaff()]);
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
  return <main className="page"><PageHeader eyebrow="Guided opening" title="Open a shift" description="Record attendance, allocate each machine, then capture the physical opening readings." /><section className="panel panel-pad form-panel reveal reveal-2"><ShiftOpenForm defaults={defaults} staff={staff} /></section></main>;
}
