import { DailyForecourtSheet } from "@/components/day/daily-forecourt-sheet";
import { businessDate } from "@/lib/business-time";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { getStaffStore } from "@/server/repositories/staff-store";
import { deriveOpeningCarryForward } from "@/server/services/opening-carry-forward-service";

export const dynamic = "force-dynamic";

export default async function DailyForecourtPage() {
  const today = businessDate();
  const [shifts, staff, attendance, configuration] = await Promise.all([
    getOperationsRepository().listShifts(), getStaffStore().listStaff(), getStaffStore().listAttendance(today), getForecourtConfigStore().getConfiguration()
  ]);
  const active = shifts.find((shift) => shift.state === "OPEN");
  const products = new Map(configuration.products.map((product) => [product.id, product]));
  const tanks = new Map(configuration.tanks.map((tank) => [tank.id, tank]));
  const activeStations = configuration.stations.filter((station) => station.active);
  const carryForward = deriveOpeningCarryForward(shifts, activeStations.map((station) => station.id));
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
  const tankIds = configuration.tanks.filter((tank) => tank.active).map((tank) => tank.id);
  const sheetTanks = tankIds.map((tankId) => {
    const tank = tanks.get(tankId); const snapshot = active?.tankSnapshots?.find((item) => item.tankId === tankId);
    return { tankId, productId: tank?.productId ?? "", name: snapshot?.name ?? tank?.name ?? tankId, productName: snapshot?.productName ?? products.get(tank?.productId ?? "")?.name ?? "Fuel", currentStock: tank?.currentStock ?? active?.openingTankStocks[tankId] ?? "0" };
  });

  return <main className="page daily-page"><DailyForecourtSheet
    activeShift={active ? { id: active.id, name: active.name, businessDate: active.businessDate, startedAt: active.startedAt, openingNozzleReadings: active.openingNozzleReadings, openingTankStocks: active.openingTankStocks, staffAssignments: active.staffAssignments ?? [] } : undefined}
    attendance={attendance}
    businessDate={active?.businessDate ?? today}
    previousReadings={carryForward.readings}
    previousReadingSources={carryForward.sources}
    products={configuration.products.filter((product) => product.active)}
    staff={staff.filter((person) => person.active).map((person) => ({ id: person.id, name: person.name, monthlySalary: person.monthlySalary ?? "0", dailyBeta: person.dailyBeta ?? "0", assignedShift: person.assignedShift ?? "SHIFT_1" }))}
    stations={stations}
    tanks={sheetTanks}
  /></main>;
}
