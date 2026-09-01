import { ShiftOpenForm } from "@/components/shifts/shift-open-form";
import { PageHeader } from "@/components/ui/page-header";
import { businessDate } from "@/lib/business-time";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";
import { redirect } from "next/navigation";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export const dynamic = "force-dynamic";

export default async function NewShiftPage() {
  const [shifts, staff, configuration] = await Promise.all([getOperationsRepository().listShifts(), getStaffStore().listStaff(), getForecourtConfigStore().getConfiguration()]);
  const active = shifts.find((shift) => shift.state === "OPEN");
  if (active) redirect(`/shifts/${active.id}`);
  const previous = shifts.find((shift) => shift.closingNozzleReadings && shift.closingTankStocks);
  const activeStations = configuration.stations.filter((station) => station.active);
  const activeTankIds = [...new Set(activeStations.map((station) => station.tankId))];
  const products = new Map(configuration.products.map((product) => [product.id, product]));
  const defaults = { businessDate: businessDate(), stationReadings: Object.fromEntries(activeStations.map((station) => [station.id, previous?.closingNozzleReadings?.[station.id] ?? ""])), tankStocks: Object.fromEntries(activeTankIds.map((tankId) => [tankId, configuration.tanks.find((tank) => tank.id === tankId)?.currentStock ?? previous?.closingTankStocks?.[tankId] ?? ""])) };
  const stations = activeStations.map((station) => ({ id: station.id, code: station.code, name: station.name, productName: products.get(station.productId)?.name ?? "Fuel", tankId: station.tankId, pricePerLitre: products.get(station.productId)?.sellingPricePerLitre ?? "0" }));
  const tanks = configuration.tanks.filter((tank) => activeTankIds.includes(tank.id)).map((tank) => ({ id: tank.id, code: tank.code, name: tank.name, productName: products.get(tank.productId)?.name ?? "Fuel", currentStock: tank.currentStock }));
  return <main className="page"><PageHeader eyebrow="Guided opening" title="Open a shift" description="Assign every active station, then confirm totalizers and tank stock." /><section className="panel panel-pad form-panel reveal reveal-2"><ShiftOpenForm defaults={defaults} staff={staff} stations={stations} tanks={tanks} /></section></main>;
}
