import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PumpShiftCorrectionDialog } from "@/components/finance/pump-shift-correction-dialog";
import type { FinancePumpShiftEntry } from "@/server/services/finance-analytics-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});

const entry: FinancePumpShiftEntry = {
  id: "seg-1", pumpId: "pump-a", pumpLabel: "Pump A", staffId: "staff-arun", staffName: "Arun",
  businessDate: "2026-09-04", shiftStartTime: "06:00", shiftEndTime: "14:00",
  openingNozzleReadings: { a_n1: "1000", a_n2: "2000" }, closingNozzleReadings: { a_n1: "1100", a_n2: "2050" },
  nonSaleDispenses: [], collections: { cash: "18000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "18000" },
  litresSold: "150.000", expectedSalesValue: "18000.00", accountedTender: "18000.00", tenderVariance: "0.00",
  declaredCashHandover: "18000", cashVariance: "0.00", products: [], nozzles: {}, completedAt: "2026-09-04T08:00:00.000Z",
  shiftId: "shift-1", shiftState: "OPEN"
};

const staff = [{ id: "staff-arun", name: "Arun" }, { id: "staff-priya", name: "Priya" }];

describe("PumpShiftCorrectionDialog", () => {
  it("prefills the form from the given entry", () => {
    render(<PumpShiftCorrectionDialog entry={entry} onClose={vi.fn()} staff={staff} stationLabels={{ a_n1: "A-N1 · Petrol", a_n2: "A-N2 · Petrol" }} />);

    expect(screen.getByDisplayValue("1100")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2050")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("staff-arun");
  });

  it("submits the correction and shows the before/after summary including any cascaded entry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        pumpShiftHistory: [
          { ...entry, closingNozzleReadings: { a_n1: "1120", a_n2: "2050" }, litresSold: "170.000", expectedSalesValue: "20000.00", tenderVariance: "0.00" },
          { ...entry, id: "seg-2", staffName: "Priya", litresSold: "80.000", expectedSalesValue: "9000.00", cascadeAdjustment: { fromEntryId: "seg-1", adjustedAt: "2026-09-04T09:00:00.000Z" } }
        ]
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PumpShiftCorrectionDialog entry={entry} onClose={vi.fn()} staff={staff} stationLabels={{ a_n1: "A-N1 · Petrol", a_n2: "A-N2 · Petrol" }} />);

    await user.type(screen.getByPlaceholderText("What was wrong and why?"), "Mistyped closing reading");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(screen.getByText("Pump-shift corrected")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/shifts/shift-1/pumps/pump-a/history/seg-1", expect.objectContaining({ method: "PATCH" }));
    expect(screen.getByText(/170.000 L/)).toBeInTheDocument();
    expect(screen.getByText(/Priya \(80.000 L/)).toBeInTheDocument();
  });

  it("surfaces a server error, such as a downstream conflict, via the form error banner", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Correcting this segment would make Priya's later shift invalid: Closing totalizer cannot be below opening totalizer" }) })));

    render(<PumpShiftCorrectionDialog entry={entry} onClose={vi.fn()} staff={staff} stationLabels={{ a_n1: "A-N1 · Petrol", a_n2: "A-N2 · Petrol" }} />);

    await user.type(screen.getByPlaceholderText("What was wrong and why?"), "Overcorrected");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Correcting this segment would make Priya's later shift invalid"));
  });

  it("requires a reason before the browser allows submission", async () => {
    render(<PumpShiftCorrectionDialog entry={entry} onClose={vi.fn()} staff={staff} stationLabels={{ a_n1: "A-N1 · Petrol", a_n2: "A-N2 · Petrol" }} />);

    expect(screen.getByPlaceholderText("What was wrong and why?")).toBeRequired();
  });
});
