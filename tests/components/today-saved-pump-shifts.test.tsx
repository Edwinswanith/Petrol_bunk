import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TodaySavedPumpShifts } from "@/components/day/today-saved-pump-shifts";
import type { PumpShiftRecord } from "@/server/domain/operations";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function entry(id: string, date: string): PumpShiftRecord {
  return {
    id, pumpId: "pump-a", pumpLabel: "Pump A", staffId: "arun", staffName: date === "2026-09-24" ? "Today Operator" : "Yesterday Operator",
    businessDate: date, shiftStartTime: "06:00", shiftEndTime: "08:00", nozzleIds: ["a_n1"], openingNozzleReadings: { a_n1: "100" },
    closingNozzleReadings: { a_n1: "110" }, nonSaleDispenses: [], collections: { cash: "1000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "1000" },
    litresSold: "10.000", expectedSalesValue: "1000.00", accountedTender: "1000.00", tenderVariance: "0.00", declaredCashHandover: "1000.00",
    cashVariance: "0.00", products: [], nozzles: {}, completedAt: `${date}T08:00:00.000Z`
  };
}

describe("TodaySavedPumpShifts", () => {
  it("shows only current-date entries with an explicit delete action", () => {
    render(<TodaySavedPumpShifts entries={[entry("old", "2026-09-23"), entry("today", "2026-09-24")]} onDeleted={vi.fn()} shiftId="shift-1" today="2026-09-24" />);

    const panel = screen.getByRole("region", { name: "Saved entries for today" });
    expect(within(panel).getByText("Today Operator")).toBeInTheDocument();
    expect(within(panel).queryByText("Yesterday Operator")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Delete Today Operator's Pump A entry" })).toBeInTheDocument();
    expect(within(panel).getByText(/deleting here also removes it from today's Finance view/i)).toBeInTheDocument();
  });

  it("stays hidden when no entries have been saved for today", () => {
    const { container } = render(<TodaySavedPumpShifts entries={[entry("old", "2026-09-23")]} onDeleted={vi.fn()} shiftId="shift-1" today="2026-09-24" />);
    expect(container).toBeEmptyDOMElement();
  });
});
