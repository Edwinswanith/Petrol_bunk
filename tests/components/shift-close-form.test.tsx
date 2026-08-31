import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShiftCloseForm } from "@/components/shifts/shift-close-form";

afterEach(() => vi.unstubAllGlobals());

describe("ShiftCloseForm", () => {
  it("shows the server reconciliation before allowing closure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sales: {
          expectedSales: "20300.00",
          accountedTender: "20300.00",
          tenderVariance: "0.00",
          expectedCashHandover: "10000.00",
          cashVariance: "0.00"
        },
        tanks: {
          petrol_tank: { variance: "0.000", variancePercent: "0.000" },
          diesel_tank: { variance: "0.000", variancePercent: "0.000" }
        },
        grossMargin: "1180.00",
        estimatedOperatingProfit: "1180.00"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ShiftCloseForm
        shiftId="shift-live-001"
        defaults={{
          petrolClosing: "182450.250",
          dieselClosing: "92640.000",
          petrolStock: "12350",
          dieselStock: "8100",
          cashSales: "10000",
          upi: "10300"
        }}
      />
    );

    await user.click(screen.getByRole("button", { name: /review reconciliation/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("₹20,300.00")).toBeInTheDocument();
    expect(screen.getByText("No payment variance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close shift/i })).toBeEnabled();
  });
});
