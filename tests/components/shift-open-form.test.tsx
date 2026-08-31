import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShiftOpenForm } from "@/components/shifts/shift-open-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
afterEach(() => { vi.unstubAllGlobals(); push.mockClear(); });

describe("ShiftOpenForm", () => {
  it("sends the selected staff-to-machine allocation with opening totalizers", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "shift-new" }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
    render(<ShiftOpenForm defaults={{ businessDate: "2026-08-31", petrolOpening: "1000", dieselOpening: "2000", petrolStock: "5000", dieselStock: "6000" }} staff={[
      { id: "staff-arun", name: "Arun", phone: "", note: "", active: true, createdAt: "now", updatedAt: "now" },
      { id: "staff-priya", name: "Priya", phone: "", note: "", active: true, createdAt: "now", updatedAt: "now" }
    ]} />);

    await user.selectOptions(screen.getByLabelText("Petrol machine operator"), "staff-arun");
    await user.selectOptions(screen.getByLabelText("Diesel machine operator"), "staff-priya");
    await user.click(screen.getByRole("button", { name: /open shift/i }));

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({
      staffOnDuty: ["Arun", "Priya"],
      staffAssignments: [
        { staffId: "staff-arun", staffName: "Arun", nozzleId: "petrol_1" },
        { staffId: "staff-priya", staffName: "Priya", nozzleId: "diesel_1" }
      ]
    });
    expect(push).toHaveBeenCalledWith("/shifts/shift-new");
  });
});
