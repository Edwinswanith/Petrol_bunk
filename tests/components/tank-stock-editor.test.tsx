import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TankStockEditor } from "@/components/stock/tank-stock-editor";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

const tanks = [
  { id: "petrol_tank", name: "Petrol Tank 1", productName: "Petrol", currentStock: "12460", capacityLitres: "20000" },
  { id: "diesel_tank", name: "Diesel Tank 1", productName: "Diesel", currentStock: "9002.985", capacityLitres: "20000" }
];

describe("TankStockEditor", () => {
  it("lets the owner enter and revise each tank's current stock", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ balanceAfter: "15000.000" })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TankStockEditor businessDate="2026-09-02" tanks={tanks} />);
    expect(screen.getByText("Petrol Tank 1")).toBeInTheDocument();
    expect(screen.getByText("Diesel Tank 1")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Petrol current stock"));
    await user.type(screen.getByLabelText("Petrol current stock"), "15000");
    await user.type(screen.getByLabelText("Petrol adjustment reason"), "Opening physical dip");
    await user.click(screen.getByRole("button", { name: "Save Petrol stock" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/tanks/petrol_tank", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({
        currentStock: "15000",
        previousStock: "12460",
        businessDate: "2026-09-02",
        reason: "Opening physical dip"
      })
    }));
    expect(await screen.findByText("Petrol stock updated to 15,000 L")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows a server validation error without changing the displayed balance", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Stock cannot exceed the 20000 litre tank capacity" })
    }));

    render(<TankStockEditor businessDate="2026-09-02" tanks={tanks} />);
    await user.clear(screen.getByLabelText("Diesel current stock"));
    await user.type(screen.getByLabelText("Diesel current stock"), "21000");
    await user.type(screen.getByLabelText("Diesel adjustment reason"), "Correcting first stock");
    await user.click(screen.getByRole("button", { name: "Save Diesel stock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Stock cannot exceed the 20000 litre tank capacity");
    expect(refresh).not.toHaveBeenCalled();
  });
});
