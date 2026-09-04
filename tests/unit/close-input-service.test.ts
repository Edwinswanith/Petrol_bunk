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

  it("derives canonical payment and staff totals from pump-side collections", async () => {
    vi.mocked(listExpenses).mockResolvedValue([]);
    vi.mocked(listFuelReceipts).mockResolvedValue([]);
    const pumpShift: ShiftRecord = {
      ...shift,
      staffAssignments: [
        { staffId: "staff-edwin", staffName: "Edwin", nozzleId: "a_n1" },
        { staffId: "staff-edwin", staffName: "Edwin", nozzleId: "a_n3" },
        { staffId: "staff-priya", staffName: "Priya", nozzleId: "a_n2" }
      ],
      stationSnapshots: [
        { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95", sideId: "A-S1" },
        { stationId: "a_n3", code: "A-N3", name: "Nozzle 3", productId: "diesel", productName: "Diesel", tankId: "diesel_tank", tankName: "Diesel Tank", pricePerLitre: "90", costPerLitre: "85", sideId: "A-S1" },
        { stationId: "a_n2", code: "A-N2", name: "Nozzle 2", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95", sideId: "A-S2" }
      ]
    };
    const prepared = await prepareCloseInput(pumpShift, {
      ...closeInput,
      payments: { ...closeInput.payments, cashSales: "999999", upi: "999999", declaredCashHandover: "999999" },
      staffHandovers: { "staff-edwin": "999999" },
      sideCollections: {
        "A-S1": { cash: "0.10", upi: "0.20", card: "10", credit: "2", other: "3", declaredCashHandover: "0.10" },
        "A-S2": { cash: "20", upi: "30", card: "40", credit: "5", other: "6", declaredCashHandover: "20" }
      }
    });

    expect(prepared.payments).toEqual(expect.objectContaining({
      cashSales: "20.1", upi: "30.2", card: "50", credit: "7", other: "9", declaredCashHandover: "20.1"
    }));
    expect(prepared.staffHandovers).toEqual({ "staff-edwin": "15.3", "staff-priya": "101" });
  });

  it("collects one entry per pump when stations carry a dispenser", async () => {
    vi.mocked(listExpenses).mockResolvedValue([]);
    vi.mocked(listFuelReceipts).mockResolvedValue([]);
    const nozzle = (id: string, sideId: string) => ({
      stationId: id, code: id.toUpperCase(), name: id, productId: "petrol", productName: "Petrol",
      tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95",
      dispenserId: "pump-a", dispenserCode: "1", sideId
    });
    const pumpShift: ShiftRecord = {
      ...shift,
      staffAssignments: ["a_n1", "a_n2", "a_n3", "a_n4"].map((nozzleId) => ({ staffId: "staff-edwin", staffName: "Edwin", nozzleId })),
      stationSnapshots: [nozzle("a_n1", "A-S1"), nozzle("a_n2", "A-S2"), nozzle("a_n3", "A-S1"), nozzle("a_n4", "A-S2")]
    };

    const prepared = await prepareCloseInput(pumpShift, {
      ...closeInput,
      payments: { ...closeInput.payments, cashSales: "999999", upi: "999999", declaredCashHandover: "999999" },
      staffHandovers: { "staff-edwin": "999999" },
      sideCollections: { "pump-a": { cash: "500", upi: "300", card: "100", credit: "50", other: "25", declaredCashHandover: "500" } }
    });

    expect(prepared.payments).toEqual(expect.objectContaining({ cashSales: "500", upi: "300", card: "100", credit: "50", other: "25", declaredCashHandover: "500" }));
    expect(prepared.staffHandovers).toEqual({ "staff-edwin": "975" });
  });

  it("sums a pump's completed shift history together with the currently live segment when closing the day", async () => {
    vi.mocked(listExpenses).mockResolvedValue([]);
    vi.mocked(listFuelReceipts).mockResolvedValue([]);
    const nozzle = (id: string) => ({
      stationId: id, code: id.toUpperCase(), name: id, productId: "petrol", productName: "Petrol",
      tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95",
      dispenserId: "pump-a", dispenserCode: "1", sideId: "A-S1"
    });
    const pumpShift: ShiftRecord = {
      ...shift,
      staffAssignments: [
        { staffId: "staff-edwin", staffName: "Edwin", nozzleId: "a_n1" },
        { staffId: "staff-edwin", staffName: "Edwin", nozzleId: "a_n2" }
      ],
      stationSnapshots: [nozzle("a_n1"), nozzle("a_n2")],
      pumpShiftHistory: [
        {
          id: "seg-1", pumpId: "pump-a", pumpLabel: "Pump 1", staffId: "staff-arun", staffName: "Arun", businessDate: "2026-08-31",
          openingNozzleReadings: { a_n1: "1000", a_n2: "1000" }, closingNozzleReadings: { a_n1: "1100", a_n2: "1050" },
          nonSaleDispenses: [{ nozzleId: "a_n1", volume: "2", returnedToTank: true }],
          collections: { cash: "100", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "100" },
          litresSold: "148.000", expectedSalesValue: "14800.00", accountedTender: "100.00", tenderVariance: "-14700.00",
          declaredCashHandover: "100.00", cashVariance: "0.00", products: [], nozzles: {}, completedAt: "2026-08-31T12:00:00.000Z"
        },
        {
          id: "seg-2", pumpId: "pump-a", pumpLabel: "Pump 1", staffId: "staff-priya", staffName: "Priya", businessDate: "2026-08-31",
          openingNozzleReadings: { a_n1: "1100", a_n2: "1050" }, closingNozzleReadings: { a_n1: "1150", a_n2: "1080" },
          nonSaleDispenses: [],
          collections: { cash: "50", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "50" },
          litresSold: "80.000", expectedSalesValue: "8000.00", accountedTender: "50.00", tenderVariance: "-7950.00",
          declaredCashHandover: "50.00", cashVariance: "0.00", products: [], nozzles: {}, completedAt: "2026-08-31T18:00:00.000Z"
        }
      ]
    };

    const prepared = await prepareCloseInput(pumpShift, {
      ...closeInput,
      nonSaleDispenses: [{ nozzleId: "a_n2", volume: "1", returnedToTank: false }],
      payments: { ...closeInput.payments, cashSales: "999999", upi: "999999", declaredCashHandover: "999999" },
      staffHandovers: { "staff-edwin": "999999" },
      sideCollections: { "pump-a": { cash: "30", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "30" } }
    });

    expect(prepared.payments).toEqual(expect.objectContaining({ cashSales: "180", declaredCashHandover: "180" }));
    expect(prepared.staffHandovers).toEqual({ "staff-arun": "100", "staff-priya": "50", "staff-edwin": "30" });
    expect(prepared.nonSaleDispenses).toEqual([
      { nozzleId: "a_n1", volume: "2", returnedToTank: true },
      { nozzleId: "a_n2", volume: "1", returnedToTank: false }
    ]);
  });

  it("does not allow a configured pump to be omitted from closing", async () => {
    vi.mocked(listExpenses).mockResolvedValue([]);
    vi.mocked(listFuelReceipts).mockResolvedValue([]);
    const pumpShift: ShiftRecord = {
      ...shift,
      stationSnapshots: [
        { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95", dispenserId: "pump-a", sideId: "A-S1" },
        { stationId: "b_n1", code: "B-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95", dispenserId: "pump-b", sideId: "B-S1" }
      ]
    };

    await expect(prepareCloseInput(pumpShift, {
      ...closeInput,
      sideCollections: { "pump-a": { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" } }
    })).rejects.toThrow("Enter collections for pump pump-b");
  });

  it("falls back to grouping by side when stations predate dispensers", async () => {
    vi.mocked(listExpenses).mockResolvedValue([]);
    vi.mocked(listFuelReceipts).mockResolvedValue([]);
    const pumpShift: ShiftRecord = {
      ...shift,
      stationSnapshots: [
        { stationId: "a_n1", code: "A-N1", name: "Nozzle 1", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95", sideId: "A-S1" },
        { stationId: "a_n2", code: "A-N2", name: "Nozzle 2", productId: "petrol", productName: "Petrol", tankId: "petrol_tank", tankName: "Petrol Tank", pricePerLitre: "100", costPerLitre: "95", sideId: "A-S2" }
      ]
    };

    await expect(prepareCloseInput(pumpShift, {
      ...closeInput,
      sideCollections: {
        "A-S1": { cash: "0", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "0" }
      }
    })).rejects.toThrow("Enter collections for pump A-S2");
  });

  it("treats a custom station without layout metadata as its own side", async () => {
    vi.mocked(listExpenses).mockResolvedValue([]);
    vi.mocked(listFuelReceipts).mockResolvedValue([]);
    const customShift: ShiftRecord = {
      ...shift,
      staffAssignments: [{ staffId: "staff-edwin", staffName: "Edwin", nozzleId: "xp95" }],
      stationSnapshots: [
        { stationId: "xp95", code: "XP95", name: "XP95 station", productId: "xp95", productName: "XP95", tankId: "xp95_tank", tankName: "XP95 Tank", pricePerLitre: "110", costPerLitre: "102" }
      ]
    };
    const prepared = await prepareCloseInput(customShift, {
      ...closeInput,
      sideCollections: {
        xp95: { cash: "10", upi: "20", card: "0", credit: "0", other: "0", declaredCashHandover: "10" }
      }
    });

    expect(prepared.payments).toEqual(expect.objectContaining({ cashSales: "10", upi: "20" }));
    expect(prepared.staffHandovers).toEqual({ "staff-edwin": "30" });
  });
});
