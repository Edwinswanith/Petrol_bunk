import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DailyForecourtSheet } from "@/components/day/daily-forecourt-sheet";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const station = (pump: "A" | "B", nozzle: number) => {
  const petrol = nozzle <= 2;
  return {
    stationId: `${pump.toLowerCase()}_n${nozzle}`, code: `${pump}-N${nozzle}`, name: `Pump ${pump} nozzle ${nozzle}`,
    productId: petrol ? "petrol" : "diesel", productName: petrol ? "Petrol" : "Diesel",
    tankId: petrol ? "petrol_tank" : "diesel_tank", tankName: petrol ? "Petrol Tank" : "Diesel Tank",
    pricePerLitre: petrol ? "102.50" : "100.50", costPerLitre: petrol ? "96.80" : "94.40",
    dispenserId: `pump-${pump.toLowerCase()}`, dispenserCode: pump,
    sideId: `${pump}-S${nozzle % 2 ? 1 : 2}`, sideLabel: `Side ${nozzle % 2 ? 1 : 2}`, nozzleNumber: nozzle, displayOrder: (pump === "A" ? 0 : 4) + nozzle
  };
};

describe("DailyForecourtSheet", () => {
  it("shows two physical pumps, four staff positions and eight opening totalizers on one page", () => {
    render(<DailyForecourtSheet
      businessDate="2026-09-01"
      previousReadings={{}}
      products={[
        { id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80", marketReferencePrice: "102.50" },
        { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40", marketReferencePrice: "100.50" }
      ]}
      staff={[{ id: "staff-edwin", name: "Edwin" }]}
      stations={(["A", "B"] as const).flatMap((pump) => [1, 2, 3, 4].map((nozzle) => station(pump, nozzle)))}
      tanks={[
        { tankId: "petrol_tank", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" },
        { tankId: "diesel_tank", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }
      ]}
    />);

    expect(screen.getByRole("heading", { name: "Today's forecourt sheet" })).toBeInTheDocument();
    expect(screen.getByText("Pump A")).toBeInTheDocument();
    expect(screen.getByText("Pump B")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox", { name: /operator/i })).toHaveLength(4);
    expect(screen.getAllByPlaceholderText("Opening")).toHaveLength(8);
    expect(screen.getByRole("button", { name: /start business day/i })).toBeEnabled();
  });
});
