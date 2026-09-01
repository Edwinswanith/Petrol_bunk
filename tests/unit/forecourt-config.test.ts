import { describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

describe("forecourt configuration", () => {
  it("seeds the physical two-pump, four-side, eight-nozzle layout", async () => {
    const configuration = await createMemoryForecourtConfigStore({ seedDefaults: true }).getConfiguration();

    expect(configuration.stations).toHaveLength(8);
    expect(configuration.stations.map((station) => station.code)).toEqual([
      "A-N1", "A-N2", "A-N3", "A-N4", "B-N1", "B-N2", "B-N3", "B-N4"
    ]);
    expect(configuration.stations.filter((station) => station.sideId === "A-S1").map((station) => station.code)).toEqual(["A-N1", "A-N3"]);
    expect(configuration.stations.filter((station) => station.sideId === "A-S2").map((station) => station.code)).toEqual(["A-N2", "A-N4"]);
  });

  it("adds a custom fuel, tank and station and keeps station codes unique", async () => {
    const store = createMemoryForecourtConfigStore({ seedDefaults: false });
    const product = await store.createProduct({ code: "XP95", name: "XP95", sellingPricePerLitre: "110", costPricePerLitre: "102" });
    const tank = await store.createTank({ code: "XT1", name: "XP95 Tank", productId: product.id, capacityLitres: "10000", currentStock: "5000" });
    const station = await store.createStation({ code: "X1", name: "XP95 Station 1", productId: product.id, tankId: tank.id, totalizerPrecision: 3 });

    expect((await store.getConfiguration()).stations).toContainEqual(expect.objectContaining({ id: station.id, code: "X1", productId: product.id, tankId: tank.id }));
    await expect(store.createStation({ code: "X1", name: "Duplicate", productId: product.id, tankId: tank.id, totalizerPrecision: 3 })).rejects.toThrow("Station code already exists");
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
