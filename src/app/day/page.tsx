import { DailyForecourtSheet } from "@/components/day/daily-forecourt-sheet";
import { businessDate } from "@/lib/business-time";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";

export const dynamic = "force-dynamic";

export default async function DailyForecourtPage() {
  const [shifts, staff, configuration] = await Promise.all([
    getOperationsRepository().listShifts(), getStaffStore().listStaff(), getForecourtConfigStore().getConfiguration()
  ]);
  const active = shifts.find((shift) => shift.state === "OPEN");
  const previous = shifts.find((shift) => shift.state === "CLOSED" && shift.closingNozzleReadings);
  const products = new Map(configuration.products.map((product) => [product.id, product]));
  const tanks = new Map(configuration.tanks.map((tank) => [tank.id, tank]));
  const activeStations = configuration.stations.filter((station) => station.active);
  const stations = active?.stationSnapshots?.length ? active.stationSnapshots : activeStations.map((station) => {
    const product = products.get(station.productId)!; const tank = tanks.get(station.tankId)!;
    return {
      stationId: station.id, code: station.code, name: station.name, productId: station.productId, productName: product?.name ?? "Fuel",
      tankId: station.tankId, tankName: tank?.name ?? "Tank", pricePerLitre: product?.sellingPricePerLitre ?? "0",
      costPerLitre: product?.costPricePerLitre ?? "0", marketReferencePrice: product?.marketReferencePrice,
      dispenserId: station.dispenserId, dispenserCode: station.dispenserCode, sideId: station.sideId, sideLabel: station.sideLabel,
      nozzleNumber: station.nozzleNumber, displayOrder: station.displayOrder
    };
  });
  const tankIds = [...new Set(stations.map((station) => station.tankId))];
  const sheetTanks = tankIds.map((tankId) => {
    const tank = tanks.get(tankId); const snapshot = active?.tankSnapshots?.find((item) => item.tankId === tankId);
    return { tankId, name: snapshot?.name ?? tank?.name ?? tankId, productName: snapshot?.productName ?? products.get(tank?.productId ?? "")?.name ?? "Fuel", currentStock: tank?.currentStock ?? active?.openingTankStocks[tankId] ?? "0" };
  });

  return <main className="page daily-page"><DailyForecourtSheet
    activeShift={active ? { id: active.id, name: active.name, businessDate: active.businessDate, startedAt: active.startedAt, openingNozzleReadings: active.openingNozzleReadings, openingTankStocks: active.openingTankStocks, staffAssignments: active.staffAssignments ?? [] } : undefined}
    businessDate={active?.businessDate ?? businessDate()}
    previousReadings={previous?.closingNozzleReadings ?? {}}
    products={configuration.products.filter((product) => product.active)}
    staff={staff.filter((person) => person.active).map((person) => ({ id: person.id, name: person.name }))}
    stations={stations}
    tanks={sheetTanks}
  /></main>;
}
