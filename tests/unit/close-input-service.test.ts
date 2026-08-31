import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CloseShiftInput, ShiftRecord } from "@/server/domain/operations";
import { listExpenses, listFuelReceipts } from "@/server/repositories/journal-store";
import { prepareCloseInput } from "@/server/services/close-input-service";

vi.mock("@/server/repositories/journal-store", () => ({
  listExpenses: vi.fn(),
  listFuelReceipts: vi.fn()
}));

const shift: ShiftRecord = {
  id: "shift-1",
  state: "OPEN",
  name: "Evening shift",
  businessDate: "2026-08-31",
  staffOnDuty: [],
  openingNozzleReadings: { petrol_1: "1000", diesel_1: "2000" },
  openingTankStocks: { petrol_tank: "5000", diesel_tank: "6000" },
  createdAt: "2026-08-31T10:00:00.000Z",
  startedAt: "2026-08-31T10:00:00.000Z",
  version: 1
};

const closeInput: CloseShiftInput = {
  closingNozzleReadings: { petrol_1: "1100", diesel_1: "2100" },
  closingTankStocks: { petrol_tank: "5900", diesel_tank: "5900" },
  nonSaleDispenses: [],
  receipts: { petrol_tank: "999", diesel_tank: "999" },
  payments: { cashSales: "10000", upi: "10300", card: "0", credit: "0", other: "0", cashReceipts: "0", cashExpenses: "999", cashRemovals: "0", declaredCashHandover: "9750" },
  lubricantRevenue: "0",
  lubricantCost: "0",
  expenses: "999"
};

describe("prepareCloseInput", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses linked journal entries instead of client-supplied receipt and expense totals", async () => {
    vi.mocked(listExpenses).mockResolvedValue([
      { id: "e1", category: "maintenance", amount: "250", paymentMethod: "cash", date: "2026-08-31", note: "Repair", createdAt: "2026-08-31T11:00:00.000Z", idempotencyKey: "e1", shiftId: "shift-1" },
      { id: "e2", category: "bank_charges", amount: "50", paymentMethod: "bank", date: "2026-08-31", note: "Charge", createdAt: "2026-08-31T11:15:00.000Z", idempotencyKey: "e2", shiftId: "shift-1" },
      { id: "other", category: "other", amount: "1000", paymentMethod: "cash", date: "2026-08-31", note: "Other shift", createdAt: "2026-08-31T11:00:00.000Z", idempotencyKey: "other", shiftId: "shift-2" }
    ]);
    vi.mocked(listFuelReceipts).mockResolvedValue([
      { id: "r1", supplier: "OMC", invoiceNumber: "INV-1", tankerNumber: "TN-1", product: "petrol", tankId: "petrol_tank", invoiceQuantity: "1000", acceptedQuantity: "995", invoiceDensity: "742", observedDensity: "742", landedCost: "96", createdAt: "2026-08-31T11:00:00.000Z", idempotencyKey: "r1", shiftId: "shift-1" },
      { id: "r2", supplier: "OMC", invoiceNumber: "INV-2", tankerNumber: "TN-2", product: "petrol", tankId: "petrol_tank", invoiceQuantity: "500", acceptedQuantity: "498", invoiceDensity: "742", observedDensity: "742", landedCost: "96", createdAt: "2026-08-31T11:30:00.000Z", idempotencyKey: "r2", shiftId: "shift-1" }
    ]);

    const prepared = await prepareCloseInput(shift, closeInput);

    expect(prepared.receipts).toEqual({ petrol_tank: "1493", diesel_tank: "0" });
    expect(prepared.payments.cashExpenses).toBe("250");
    expect(prepared.expenses).toBe("300");
    expect(prepared.payments.cashSales).toBe("10000");
  });
});
