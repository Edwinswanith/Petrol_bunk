import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { saveFuelReceipt, updateFuelReceipt, voidFuelReceipt } from "@/server/repositories/journal-store";

describe("weighted-average reseller purchase price from fuel receipts", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true });
    globalThis.forecourtFuelReceipts = [];
    globalThis.forecourtReceiptInventoryMovements = [];
  });

  it("blends the delivery's price into the product's reseller purchase price, weighted by existing stock", async () => {
    const configStore = getForecourtConfigStore();
    await configStore.setTankStock("petrol_tank", "5000");
    await configStore.updateProductPrice("petrol", { sellingPricePerLitre: "102.50", costPricePerLitre: "100.00" });

    await saveFuelReceipt({
      supplier: "IndianOil", invoiceNumber: "INV-2001", tankerNumber: "TN 01 AB 0001",
      product: "petrol", tankId: "petrol_tank", invoiceQuantity: "5000", acceptedQuantity: "5000",
      invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "510000.00"
    }, "avg-key-1");

    const configuration = await configStore.getConfiguration();
    expect(configuration.products.find((product) => product.id === "petrol")?.costPricePerLitre).toBe("101.00");
    expect(configuration.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("10000.000");
    expect(configuration.products.find((product) => product.id === "petrol")?.sellingPricePerLitre).toBe("102.50");
  });

  it("keeps blending forward from the newly updated average on the next delivery, not from the original figure", async () => {
    const configStore = getForecourtConfigStore();
    await configStore.setTankStock("petrol_tank", "5000");
    await configStore.updateProductPrice("petrol", { sellingPricePerLitre: "102.50", costPricePerLitre: "100.00" });

    await saveFuelReceipt({
      supplier: "IndianOil", invoiceNumber: "INV-2001", tankerNumber: "TN 01 AB 0001",
      product: "petrol", tankId: "petrol_tank", invoiceQuantity: "5000", acceptedQuantity: "5000",
      invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "510000.00"
    }, "avg-key-1");

    await saveFuelReceipt({
      supplier: "IndianOil", invoiceNumber: "INV-2002", tankerNumber: "TN 01 AB 0002",
      product: "petrol", tankId: "petrol_tank", invoiceQuantity: "10000", acceptedQuantity: "10000",
      invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "1030000.00"
    }, "avg-key-2");

    const configuration = await configStore.getConfiguration();
    expect(configuration.products.find((product) => product.id === "petrol")?.costPricePerLitre).toBe("102.00");
    expect(configuration.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("20000.000");
  });

  it("uses the delivery's own price as the starting average when the tank is empty", async () => {
    const configStore = getForecourtConfigStore();
    await configStore.setTankStock("petrol_tank", "0");
    await configStore.updateProductPrice("petrol", { sellingPricePerLitre: "102.50", costPricePerLitre: "999.00" });

    await saveFuelReceipt({
      supplier: "IndianOil", invoiceNumber: "INV-2003", tankerNumber: "TN 01 AB 0003",
      product: "petrol", tankId: "petrol_tank", invoiceQuantity: "2000", acceptedQuantity: "2000",
      invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "204000.00"
    }, "avg-key-3");

    const configuration = await configStore.getConfiguration();
    expect(configuration.products.find((product) => product.id === "petrol")?.costPricePerLitre).toBe("102.00");
  });

  it("does not retroactively change the reseller purchase price when a receipt is later corrected or voided", async () => {
    const configStore = getForecourtConfigStore();
    await configStore.setTankStock("petrol_tank", "5000");
    await configStore.updateProductPrice("petrol", { sellingPricePerLitre: "102.50", costPricePerLitre: "100.00" });

    const receipt = await saveFuelReceipt({
      supplier: "IndianOil", invoiceNumber: "INV-2004", tankerNumber: "TN 01 AB 0004",
      product: "petrol", tankId: "petrol_tank", invoiceQuantity: "5000", acceptedQuantity: "5000",
      invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "510000.00"
    }, "avg-key-4");

    const afterReceipt = await configStore.getConfiguration();
    expect(afterReceipt.products.find((product) => product.id === "petrol")?.costPricePerLitre).toBe("101.00");

    await updateFuelReceipt(receipt.id, {
      supplier: "IndianOil", invoiceNumber: "INV-2004", tankerNumber: "TN 01 AB 0004",
      invoiceQuantity: "5000", acceptedQuantity: "4800",
      invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "510000.00",
      reason: "Dip reading was lower than first logged"
    });

    const afterCorrection = await configStore.getConfiguration();
    expect(afterCorrection.products.find((product) => product.id === "petrol")?.costPricePerLitre).toBe("101.00");
    expect(afterCorrection.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("9800.000");

    await voidFuelReceipt(receipt.id, "Duplicate entry from the same tanker");

    const afterVoid = await configStore.getConfiguration();
    expect(afterVoid.products.find((product) => product.id === "petrol")?.costPricePerLitre).toBe("101.00");
    expect(afterVoid.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("5000.000");
  });

  it("only blends the price into the delivered product, leaving the other product's cost untouched", async () => {
    const configStore = getForecourtConfigStore();
    const before = await configStore.getConfiguration();
    const dieselCostBefore = before.products.find((product) => product.id === "diesel")?.costPricePerLitre;

    await saveFuelReceipt({
      supplier: "IndianOil", invoiceNumber: "INV-2005", tankerNumber: "TN 01 AB 0005",
      product: "petrol", tankId: "petrol_tank", invoiceQuantity: "1000", acceptedQuantity: "1000",
      invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "98000.00"
    }, "avg-key-5");

    const after = await configStore.getConfiguration();
    expect(after.products.find((product) => product.id === "diesel")?.costPricePerLitre).toBe(dieselCostBefore);
  });
});
