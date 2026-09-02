import { describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

describe("forecourt configuration", () => {
  it("seeds pumps 1 and 2 with N1/N2 petrol and N3/N4 diesel", async () => {
    const configuration = await createMemoryForecourtConfigStore({ seedDefaults: true }).getConfiguration();

    expect(configuration.stations).toHaveLength(8);
    expect(configuration.stations.map((station) => station.code)).toEqual([
      "P1-N1", "P1-N2", "P1-N3", "P1-N4", "P2-N1", "P2-N2", "P2-N3", "P2-N4"
    ]);
    expect(configuration.stations.filter((station) => station.nozzleNumber === 1 || station.nozzleNumber === 2).every((station) => station.productId === "petrol" && station.tankId === "petrol_tank")).toBe(true);
    expect(configuration.stations.filter((station) => station.nozzleNumber === 3 || station.nozzleNumber === 4).every((station) => station.productId === "diesel" && station.tankId === "diesel_tank")).toBe(true);
    expect(configuration.stations.filter((station) => station.sideId === "P1-S1").map((station) => station.code)).toEqual(["P1-N1", "P1-N3"]);
    expect(configuration.stations.filter((station) => station.sideId === "P1-S2").map((station) => station.code)).toEqual(["P1-N2", "P1-N4"]);
  });

  it("adds a custom fuel, tank and station and keeps station codes unique", async () => {
    const store = createMemoryForecourtConfigStore({ seedDefaults: false });
    const product = await store.createProduct({ code: "ALT", name: "Alternate", sellingPricePerLitre: "110", costPricePerLitre: "102" });
    const tank = await store.createTank({ code: "AT1", name: "Alternate Tank", productId: product.id, capacityLitres: "10000", currentStock: "5000" });
    const station = await store.createStation({ code: "A1", name: "Alternate Station 1", productId: product.id, tankId: tank.id, totalizerPrecision: 3 });

    expect((await store.getConfiguration()).stations).toContainEqual(expect.objectContaining({ id: station.id, code: "A1", productId: product.id, tankId: tank.id }));
    await expect(store.createStation({ code: "A1", name: "Duplicate", productId: product.id, tankId: tank.id, totalizerPrecision: 3 })).rejects.toThrow("Station code already exists");
  });

  it("rejects a station when its product does not match the selected tank", async () => {
    const store = createMemoryForecourtConfigStore({ seedDefaults: true });
    const configuration = await store.getConfiguration();
    const petrol = configuration.products.find((item) => item.code === "PETROL")!;
    const dieselTank = configuration.tanks.find((item) => item.code === "DT1")!;

    await expect(store.createStation({ code: "BAD1", name: "Wrong mapping", productId: petrol.id, tankId: dieselTank.id, totalizerPrecision: 3 })).rejects.toThrow("Station product must match the selected tank");
  });

  it("updates the live price without rewriting existing shift snapshots", async () => {
    const store = createMemoryForecourtConfigStore({ seedDefaults: true });
    const petrol = (await store.getConfiguration()).products.find((item) => item.code === "PETROL")!;
    const updated = await store.updateProductPrice(petrol.id, { sellingPricePerLitre: "104.25", costPricePerLitre: "98.10" });
    expect(updated).toMatchObject({ sellingPricePerLitre: "104.25", costPricePerLitre: "98.10" });
  });
});
