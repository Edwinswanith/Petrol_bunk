import { beforeEach, describe, expect, it } from "vitest";

import { prepareOpenShiftInput } from "@/server/services/open-input-service";

describe("daily forecourt opening", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = undefined;
  });

  it("requires one operator across every nozzle on the same pump side", async () => {
    const configuration = await (await import("@/server/repositories/forecourt-config-store")).getForecourtConfigStore().getConfiguration();
    const readings = Object.fromEntries(configuration.stations.map((station, index) => [station.id, String(1000 + index)]));
    const tankStocks = Object.fromEntries(configuration.tanks.map((tank) => [tank.id, tank.currentStock]));
    const assignments = configuration.stations.map((station) => ({
      staffId: station.sideId === "A-S1" && station.nozzleNumber === 3 ? "staff-ravi" : `staff-${station.sideId}`,
      staffName: station.sideId === "A-S1" && station.nozzleNumber === 3 ? "Ravi" : station.sideLabel ?? "Operator",
      nozzleId: station.id
    }));

    await expect(prepareOpenShiftInput({ name: "Daily forecourt sheet", businessDate: "2026-09-01", staffOnDuty: [], staffAssignments: assignments, openingNozzleReadings: readings, openingTankStocks: tankStocks }))
      .rejects.toThrow("Assign one operator to every nozzle on Pump A Side 1");
  });
});
