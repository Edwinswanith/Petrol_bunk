import type { OpenShiftInput } from "@/server/domain/operations";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export async function prepareOpenShiftInput(input: OpenShiftInput): Promise<OpenShiftInput> {
  const configuration = await getForecourtConfigStore().getConfiguration();
  const products = new Map(configuration.products.map((product) => [product.id, product]));
  const tanks = new Map(configuration.tanks.map((tank) => [tank.id, tank]));
  const activeStations = configuration.stations.filter((station) => station.active);
  const submittedStationIds = Object.keys(input.openingNozzleReadings);
  const unknownStation = submittedStationIds.find((stationId) => !activeStations.some((station) => station.id === stationId));
  if (unknownStation) throw new Error(`Unknown station: ${unknownStation}`);
  const missingStation = activeStations.find((station) => !submittedStationIds.includes(station.id));
  if (missingStation) throw new Error(`Missing opening reading for ${missingStation.code}`);
  const invalidAssignment = input.staffAssignments?.find((assignment) => !submittedStationIds.includes(assignment.nozzleId));
  if (invalidAssignment) throw new Error(`Unknown assigned station: ${invalidAssignment.nozzleId}`);
  const unassignedStation = activeStations.find((station) => !input.staffAssignments?.some((assignment) => assignment.nozzleId === station.id));
  if (unassignedStation) throw new Error(`Assign an operator to ${unassignedStation.code}`);
  const sides = new Map<string, typeof activeStations>();
  for (const station of activeStations) {
    const sideId = station.sideId ?? station.id;
    sides.set(sideId, [...(sides.get(sideId) ?? []), station]);
  }
  for (const sideStations of sides.values()) {
    const staffIds = new Set(sideStations.map((station) => input.staffAssignments?.find((assignment) => assignment.nozzleId === station.id)?.staffId));
    if (staffIds.size !== 1) {
      const station = sideStations[0];
      throw new Error(`Assign one operator to every nozzle on Pump ${station.dispenserCode} ${station.sideLabel}`);
    }
  }

  const stationSnapshots = activeStations.map((station) => {
    const product = products.get(station.productId);
    const tank = tanks.get(station.tankId);
    if (!product || !product.active) throw new Error(`Active product not found for ${station.code}`);
    if (!tank || !tank.active) throw new Error(`Active tank not found for ${station.code}`);
    if (tank.productId !== product.id) throw new Error(`Station product does not match its tank: ${station.code}`);
    return {
      stationId: station.id,
      code: station.code,
      name: station.name,
      productId: product.id,
      productName: product.name,
      tankId: tank.id,
      tankName: tank.name,
      pricePerLitre: product.sellingPricePerLitre,
      costPerLitre: product.costPricePerLitre,
      marketReferencePrice: product.marketReferencePrice,
      dispenserId: station.dispenserId ?? station.id, dispenserCode: station.dispenserCode ?? station.code,
      sideId: station.sideId ?? station.id, sideLabel: station.sideLabel ?? station.name,
      nozzleNumber: station.nozzleNumber, displayOrder: station.displayOrder
    };
  });
  const referencedTankIds = [...new Set(stationSnapshots.map((station) => station.tankId))];
  const tankSnapshots = referencedTankIds.map((tankId) => {
    const tank = tanks.get(tankId)!;
    const product = products.get(tank.productId)!;
    if (input.openingTankStocks[tankId] === undefined) throw new Error(`Missing opening stock for ${tank.code}`);
    return { tankId: tank.id, code: tank.code, name: tank.name, productId: product.id, productName: product.name, capacityLitres: tank.capacityLitres };
  });

  return { ...structuredClone(input), stationSnapshots, tankSnapshots };
}
