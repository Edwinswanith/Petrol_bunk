import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryForecourtConfigStore, getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";
import { listFuelReceipts, saveFuelReceipt, updateFuelReceipt, voidFuelReceipt } from "@/server/repositories/journal-store";

const RECEIPT = {
  supplier: "IndianOil", invoiceNumber: "INV-1001", tankerNumber: "TN 01 AB 1234",
  product: "petrol", tankId: "petrol_tank", invoiceQuantity: "1000", acceptedQuantity: "1000",
  invoiceDensity: "0.745", observedDensity: "0.744", landedCost: "95.00"
};

describe("fuel receipt corrections", () => {
  beforeEach(() => {
    globalThis.forecourtConfigStore = createMemoryForecourtConfigStore({ seedDefaults: true });
    globalThis.forecourtFuelReceipts = [];
    globalThis.forecourtReceiptInventoryMovements = [];
  });

  it("adjusts the tank balance by the delta when a receipt's accepted quantity is corrected", async () => {
    const receipt = await saveFuelReceipt(RECEIPT, "receipt-key-1");
    const opening = await getForecourtConfigStore().getConfiguration();
    expect(opening.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("13460.000");

    const { receipt: updated, movement } = await updateFuelReceipt(receipt.id, {
      ...RECEIPT, acceptedQuantity: "1200", reason: "Dip reading was higher than first logged"
    });

    expect(updated.acceptedQuantity).toBe("1200");
    const configuration = await getForecourtConfigStore().getConfiguration();
    expect(configuration.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("13660.000");
    expect(movement).toMatchObject({ tankId: "petrol_tank", type: "ADJUSTMENT", quantity: "200.000", balanceAfter: "13660.000" });
  });

  it("reverses the receipt's quantity from the tank and excludes it from future totals when voided", async () => {
    const receipt = await saveFuelReceipt(RECEIPT, "receipt-key-2");

    const { movement } = await voidFuelReceipt(receipt.id, "Duplicate entry from the same tanker");

    const configuration = await getForecourtConfigStore().getConfiguration();
    expect(configuration.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("12460.000");
    expect(movement).toMatchObject({ tankId: "petrol_tank", type: "ADJUSTMENT", quantity: "-1000.000", balanceAfter: "12460.000" });

    expect(await listFuelReceipts()).toHaveLength(0);
    const withVoided = await listFuelReceipts({ includeVoided: true });
    expect(withVoided).toHaveLength(1);
    expect(withVoided[0]).toMatchObject({ voided: true, voidReason: "Duplicate entry from the same tanker" });
  });

  it("refuses to edit or void a receipt that has already been voided", async () => {
    const receipt = await saveFuelReceipt(RECEIPT, "receipt-key-3");
    await voidFuelReceipt(receipt.id, "Wrong tanker");

    await expect(updateFuelReceipt(receipt.id, { ...RECEIPT, reason: "Try again" })).rejects.toThrow("already been voided");
    await expect(voidFuelReceipt(receipt.id, "Second attempt")).rejects.toThrow("already been voided");
  });

  it("refuses a correction that would exceed the tank's capacity", async () => {
    const receipt = await saveFuelReceipt(RECEIPT, "receipt-key-4");

    await expect(updateFuelReceipt(receipt.id, { ...RECEIPT, acceptedQuantity: "50000", reason: "Typo fix" }))
      .rejects.toThrow("capacity");
  });

  it("gives every correction and void movement its own referenceId, since Mongo enforces uniqueness on (referenceId, tankId, type)", async () => {
    const receipt = await saveFuelReceipt(RECEIPT, "receipt-key-5");

    const first = await updateFuelReceipt(receipt.id, { ...RECEIPT, acceptedQuantity: "1100", reason: "First correction" });
    const second = await updateFuelReceipt(receipt.id, { ...RECEIPT, acceptedQuantity: "1300", reason: "Second correction" });
    const voided = await voidFuelReceipt(receipt.id, "Actually a duplicate delivery");

    const referenceIds = [first.movement.referenceId, second.movement.referenceId, voided.movement.referenceId];
    expect(new Set(referenceIds).size).toBe(3);
    referenceIds.forEach((referenceId) => expect(referenceId).not.toBe(receipt.id));

    const configuration = await getForecourtConfigStore().getConfiguration();
    expect(configuration.tanks.find((tank) => tank.id === "petrol_tank")?.currentStock).toBe("12460.000");
  });
});
