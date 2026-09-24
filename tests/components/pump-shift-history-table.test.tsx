import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PumpShiftHistoryTable } from "@/components/finance/pump-shift-history-table";
import type { FinancePumpShiftEntry } from "@/server/services/finance-analytics-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function entry(id: string, businessDate: string): FinancePumpShiftEntry {
  return {
    id, pumpId: "pump-a", pumpLabel: "Pump A", staffId: "arun", staffName: id === "today" ? "Today Operator" : "Older Operator",
    businessDate, shiftStartTime: "06:00", shiftEndTime: "08:00", openingNozzleReadings: { a_n1: "100" }, closingNozzleReadings: { a_n1: "110" },
    nonSaleDispenses: [], collections: { cash: "1000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "1000" },
    litresSold: "10.000", expectedSalesValue: "1000.00", accountedTender: "1000.00", tenderVariance: "0.00", declaredCashHandover: "1000.00",
    cashVariance: "0.00", products: [], nozzles: {}, completedAt: `${businessDate}T08:00:00.000Z`, shiftId: "shift-1", shiftState: "OPEN"
  };
}

describe("PumpShiftHistoryTable deletion eligibility", () => {
  it("offers deletion only for an open entry on the current business date", () => {
    render(<PumpShiftHistoryTable pumpShifts={[entry("today", "2026-09-24"), entry("old", "2026-09-23")]} staff={[]} stationLabels={{}} today="2026-09-24" />);

    expect(screen.getByRole("button", { name: "Delete Today Operator's Pump A entry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Older Operator's Pump A entry" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Correct .* entry/ })).toHaveLength(2);
  });
});
