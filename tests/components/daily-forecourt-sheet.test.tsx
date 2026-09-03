import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DailyForecourtSheet } from "@/components/day/daily-forecourt-sheet";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

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
  it("shows daily reseller/customer prices, operator dropdowns and independently editable opening totalizers", async () => {
    const user = userEvent.setup();
    render(<DailyForecourtSheet
      attendance={[]}
      businessDate="2026-09-01"
      previousReadings={{ a_n1: "1000.000", a_n2: "2000.000" }}
      products={[
        { id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80", marketReferencePrice: "102.50" },
        { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40", marketReferencePrice: "100.50" }
      ]}
      staff={[{ id: "staff-edwin", name: "Edwin", monthlySalary: "18000" }]}
      stations={(["A", "B"] as const).flatMap((pump) => [1, 2, 3, 4].map((nozzle) => station(pump, nozzle)))}
      tanks={[
        { tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" },
        { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }
      ]}
    />);

    expect(screen.getByRole("heading", { name: "Today's forecourt sheet" })).toBeInTheDocument();
    expect(screen.getByText("Pump A")).toBeInTheDocument();
    expect(screen.getByText("Pump B")).toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton", { name: /reseller purchase price/i })).toHaveLength(2);
    expect(screen.getAllByRole("spinbutton", { name: /customer selling price/i })).toHaveLength(2);
    expect(screen.getAllByRole("combobox", { name: /operator/i })).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "Pump A operator" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Pump B operator" })).toBeInTheDocument();
    expect(screen.queryAllByRole("combobox", { name: /fuel grade/i })).toHaveLength(0);
    expect(screen.getByText(/Permanent fuel map: every pump runs two petrol and two diesel nozzles, worked by one employee/i)).toBeInTheDocument();
    expect([...document.querySelectorAll(".nozzle-badge")].map((badge) => badge.textContent)).toEqual(["Petrol", "Petrol", "Diesel", "Diesel", "Petrol", "Petrol", "Diesel", "Diesel"]);
    for (const legacy of ["N1", "N2", "N3", "N4"]) expect(screen.queryByText(legacy)).not.toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton", { name: /opening totalizer/i })).toHaveLength(8);
    const nozzleOne = screen.getByRole("spinbutton", { name: "A-N1 opening totalizer" });
    const nozzleTwo = screen.getByRole("spinbutton", { name: "A-N2 opening totalizer" });
    expect(nozzleOne).toHaveValue(1000); expect(nozzleTwo).toHaveValue(2000);
    await user.clear(nozzleOne); await user.type(nozzleOne, "1015.250");
    expect(nozzleOne).toHaveValue(1015.25); expect(nozzleTwo).toHaveValue(2000);
    expect(screen.getByRole("button", { name: /start business day/i })).toBeEnabled();
  });

  it("keeps active rates, nozzle openings and nozzle employees editable on the closing workspace", () => {
    const stations = (["A", "B"] as const).flatMap((pump) => [1, 2, 3, 4].map((nozzle) => station(pump, nozzle)));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{ a_n1: "999.000" }} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }, { id: "priya", name: "Priya", monthlySalary: "18000" }, { id: "kumar", name: "Kumar", monthlySalary: "18000" }, { id: "ravi", name: "Ravi", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: Object.fromEntries(stations.map((item, index) => [item.stationId, String(1000 + index)])), openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);
    expect(screen.getAllByRole("spinbutton", { name: /active reseller purchase price/i })).toHaveLength(2);
    expect(screen.getAllByRole("spinbutton", { name: /active customer selling price/i })).toHaveLength(2);
    expect(screen.getAllByRole("spinbutton", { name: /editable opening totalizer/i })).toHaveLength(8);
    expect(screen.getAllByRole("combobox", { name: /active operator/i })).toHaveLength(2);
    expect(screen.getAllByText("Collections")).toHaveLength(2);
    expect(screen.getAllByRole("spinbutton", { name: /cash collected/i })).toHaveLength(2);
    expect(screen.getByText("₹72,000.00")).toBeInTheDocument();
    expect(screen.getByText("monthly payroll")).toBeInTheDocument();
  });

  it("groups each pump's nozzles by fuel so litres, revenue and profit read as one petrol and one diesel total", async () => {
    const user = userEvent.setup();
    const stations = [1, 2, 3, 4].map((nozzle) => station("A", nozzle));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);

    await user.type(screen.getByRole("spinbutton", { name: "A-N1 closing totalizer" }), "100");
    await user.type(screen.getByRole("spinbutton", { name: "A-N2 closing totalizer" }), "50");
    await user.type(screen.getByRole("spinbutton", { name: "A-N3 closing totalizer" }), "30");
    await user.type(screen.getByRole("spinbutton", { name: "A-N4 closing totalizer" }), "20");

    const petrolTotal = screen.getByLabelText("Pump A petrol total");
    expect(within(petrolTotal).getByText("150.000 L")).toBeInTheDocument();
    expect(within(petrolTotal).getByText("₹15,375.00")).toBeInTheDocument();
    expect(within(petrolTotal).getByText("₹855.00 profit")).toBeInTheDocument();

    const dieselTotal = screen.getByLabelText("Pump A diesel total");
    expect(within(dieselTotal).getByText("50.000 L")).toBeInTheDocument();
    expect(within(dieselTotal).getByText("₹5,025.00")).toBeInTheDocument();
    expect(within(dieselTotal).getByText("₹305.00 profit")).toBeInTheDocument();

    const pumpTotal = screen.getByLabelText("Pump A total sales");
    expect(within(pumpTotal).getByText("200.000 L")).toBeInTheDocument();
    expect(within(pumpTotal).getByText("₹20,400.00")).toBeInTheDocument();
    expect(within(pumpTotal).getByText("₹1,160.00")).toBeInTheDocument();
  });

  it("nets test fuel out of sales figures and auto-populates the excluded amount in Collections", async () => {
    const user = userEvent.setup();
    const stations = [1, 2, 3, 4].map((nozzle) => station("A", nozzle));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);

    await user.type(screen.getByRole("spinbutton", { name: "A-N1 closing totalizer" }), "100");
    await user.type(screen.getByRole("spinbutton", { name: "A-N2 closing totalizer" }), "50");
    await user.type(screen.getByRole("spinbutton", { name: "A-N3 closing totalizer" }), "30");
    await user.type(screen.getByRole("spinbutton", { name: "A-N4 closing totalizer" }), "20");
    await user.clear(screen.getByRole("spinbutton", { name: "A-N1 test fuel" }));
    await user.type(screen.getByRole("spinbutton", { name: "A-N1 test fuel" }), "10");
    await user.clear(screen.getByRole("spinbutton", { name: "A-N3 test fuel" }));
    await user.type(screen.getByRole("spinbutton", { name: "A-N3 test fuel" }), "5");

    const petrolTotal = screen.getByLabelText("Pump A petrol total");
    expect(within(petrolTotal).getByText("140.000 L")).toBeInTheDocument();
    expect(within(petrolTotal).getByText("₹14,350.00")).toBeInTheDocument();
    expect(within(petrolTotal).getByText("₹798.00 profit")).toBeInTheDocument();

    const dieselTotal = screen.getByLabelText("Pump A diesel total");
    expect(within(dieselTotal).getByText("45.000 L")).toBeInTheDocument();
    expect(within(dieselTotal).getByText("₹4,522.50")).toBeInTheDocument();
    expect(within(dieselTotal).getByText("₹274.50 profit")).toBeInTheDocument();

    const pumpTotal = screen.getByLabelText("Pump A total sales");
    expect(within(pumpTotal).getByText("185.000 L")).toBeInTheDocument();
    expect(within(pumpTotal).getByText("₹18,872.50")).toBeInTheDocument();
    expect(within(pumpTotal).getByText("₹1,072.50")).toBeInTheDocument();

    const petrolTestFuel = screen.getByLabelText("Pump A petrol test fuel");
    expect(petrolTestFuel).toHaveTextContent("10.000 L");
    expect(petrolTestFuel).toHaveTextContent("₹1,025.00");

    const dieselTestFuel = screen.getByLabelText("Pump A diesel test fuel");
    expect(dieselTestFuel).toHaveTextContent("5.000 L");
    expect(dieselTestFuel).toHaveTextContent("₹502.50");
  });

  it("hides the test fuel note when no nozzle has a test dispense", () => {
    const stations = [1, 3].map((nozzle) => station("A", nozzle));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n3: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);

    expect(screen.queryByLabelText("Pump A petrol test fuel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pump A diesel test fuel")).not.toBeInTheDocument();
  });

  it("only shows the Returned checkbox once a test fuel amount has actually been entered", async () => {
    const user = userEvent.setup();
    const stations = [1, 2, 3, 4].map((nozzle) => station("A", nozzle));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);

    expect(screen.queryAllByRole("checkbox", { name: /returned/i })).toHaveLength(0);

    const testFuelField = screen.getByRole("spinbutton", { name: "A-N1 test fuel" });
    await user.clear(testFuelField);
    await user.type(testFuelField, "5");
    expect(screen.getByRole("checkbox", { name: "A-N1 returned to tank" })).toBeChecked();

    await user.clear(testFuelField);
    await user.type(testFuelField, "0");
    expect(screen.queryByRole("checkbox", { name: "A-N1 returned to tank" })).not.toBeInTheDocument();
  });

  it("uses the station code when legacy station data has no nozzle number", () => {
    const legacyStation = { ...station("A", 1), stationId: "petrol_1", code: "P1", name: "Petrol station P1", dispenserId: undefined, dispenserCode: undefined, sideId: undefined, sideLabel: undefined, nozzleNumber: undefined };
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={[legacyStation]} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { petrol_1: "1000" }, openingTankStocks: { petrol_tank: "10000" }, staffAssignments: [{ nozzleId: "petrol_1", staffId: "arun", staffName: "Arun" }] }} />);

    expect(screen.queryByText("Nundefined")).not.toBeInTheDocument();
    expect(screen.queryByText("NP1")).not.toBeInTheDocument();
    expect(screen.getAllByText("P1").length).toBeGreaterThan(0);
  });

  it("shows a large, colour-coded variance callout so a mismatch is easy to notice after reviewing", async () => {
    const user = userEvent.setup();
    const stations = [1, 2, 3, 4].map((nozzle) => station("A", nozzle));
    const preview = { sales: { expectedSales: "1000.00", accountedTender: "700.00", tenderVariance: "-300.00", expectedCashHandover: "700.00", cashVariance: "-300.00" }, nozzles: {}, tanks: {}, sides: [], products: [], staff: [], grossMargin: "0.00", estimatedOperatingProfit: "0.00" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/preview")) return { ok: true, json: async () => preview };
      return { ok: true, json: async () => ({}) };
    }));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);

    await user.click(screen.getByRole("button", { name: /review closing/i }));

    const callouts = await screen.findAllByText(/tender variance|cash variance/i);
    expect(callouts.length).toBeGreaterThanOrEqual(2);
    callouts.forEach((callout) => {
      expect(callout).toHaveClass("variance-callout", "unbalanced");
      expect(callout.textContent).toMatch(/^-₹300\.00/);
    });
  });

  it("colours the review variance callouts green when the shift has a surplus instead of a shortfall", async () => {
    const user = userEvent.setup();
    const stations = [1, 2, 3, 4].map((nozzle) => station("A", nozzle));
    const preview = { sales: { expectedSales: "1000.00", accountedTender: "1300.00", tenderVariance: "300.00", expectedCashHandover: "1300.00", cashVariance: "300.00" }, nozzles: {}, tanks: {}, sides: [], products: [], staff: [], grossMargin: "0.00", estimatedOperatingProfit: "0.00" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/preview")) return { ok: true, json: async () => preview };
      return { ok: true, json: async () => ({}) };
    }));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);

    await user.click(screen.getByRole("button", { name: /review closing/i }));

    const callouts = await screen.findAllByText(/tender variance|cash variance/i);
    expect(callouts.length).toBeGreaterThanOrEqual(2);
    callouts.forEach((callout) => {
      expect(callout).toHaveClass("variance-callout", "balanced");
      expect(callout).not.toHaveClass("unbalanced");
      expect(callout.textContent).toMatch(/^\+₹300\.00/);
    });
  });

  it("shows entered cash prominently in Collections without an expected figure, and colours the variance by its sign", async () => {
    const user = userEvent.setup();
    const stations = [1, 2, 3, 4].map((nozzle) => station("A", nozzle));
    render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={[{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }]} staff={[{ id: "arun", name: "Arun", monthlySalary: "18000" }]} stations={stations} tanks={[{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }]} activeShift={{ id: "open", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) }} />);

    expect(screen.queryByText(/expected ₹/)).not.toBeInTheDocument();

    const cashField = screen.getByRole("spinbutton", { name: "Pump A cash collected" });
    await user.clear(cashField);
    await user.type(cashField, "500");

    const entered = screen.getByText("₹500.00 entered");
    expect(entered).toHaveClass("entered-callout");

    const variance = screen.getByText(/variance$/);
    expect(variance).toHaveClass("variance-callout", "balanced");
    expect(variance).not.toHaveClass("unbalanced");
    expect(variance.textContent).toBe("+₹500.00 variance");
  });

  describe("draft persistence", () => {
    const stations = [1, 2, 3, 4].map((nozzle) => station("A", nozzle));
    const products = [{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }];
    const staff = [{ id: "arun", name: "Arun", monthlySalary: "18000" }];
    const tanks = [{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }];

    it("keeps the opening form filled in after the page is left and revisited", async () => {
      const user = userEvent.setup();
      const props = { attendance: [], businessDate: "2026-09-01", previousReadings: {}, products, staff, stations, tanks };
      const { unmount } = render(<DailyForecourtSheet {...props} />);

      await user.selectOptions(screen.getByRole("combobox", { name: "Pump A operator" }), "arun");
      const openingOne = screen.getByRole("spinbutton", { name: "A-N1 opening totalizer" });
      await user.clear(openingOne); await user.type(openingOne, "555");
      const tankStock = screen.getByRole("spinbutton", { name: "Petrol Tank opening stock" });
      await user.clear(tankStock); await user.type(tankStock, "8000");

      unmount();
      render(<DailyForecourtSheet {...props} />);

      expect(screen.getByRole("combobox", { name: "Pump A operator" })).toHaveValue("arun");
      expect(screen.getByRole("spinbutton", { name: "A-N1 opening totalizer" })).toHaveValue(555);
      expect(screen.getByRole("spinbutton", { name: "Petrol Tank opening stock" })).toHaveValue(8000);
    });

    it("clears the opening draft once the business day actually starts", async () => {
      const user = userEvent.setup();
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ id: "shift-new" }) })));
      vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
      const props = { attendance: [], businessDate: "2026-09-01", previousReadings: {}, products, staff, stations, tanks };
      render(<DailyForecourtSheet {...props} />);

      await user.selectOptions(screen.getByRole("combobox", { name: "Pump A operator" }), "arun");
      for (const code of ["A-N1", "A-N2", "A-N3", "A-N4"]) {
        const field = screen.getByRole("spinbutton", { name: `${code} opening totalizer` });
        await user.clear(field); await user.type(field, "100");
      }
      expect(localStorage.getItem("forecourt-draft:opening:2026-09-01")).not.toBeNull();

      await user.click(screen.getByRole("button", { name: /start business day/i }));

      await waitFor(() => expect(localStorage.getItem("forecourt-draft:opening:2026-09-01")).toBeNull());
    });

    it("keeps the closing form filled in after the page is left and revisited", async () => {
      const user = userEvent.setup();
      const activeShift = { id: "shift-1", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) };
      const props = { attendance: [], businessDate: "2026-09-01", previousReadings: {}, products, staff, stations, tanks, activeShift };
      const { unmount } = render(<DailyForecourtSheet {...props} />);

      const closingOne = screen.getByRole("spinbutton", { name: "A-N1 closing totalizer" });
      await user.type(closingOne, "150");
      const testFuelField = screen.getByRole("spinbutton", { name: "A-N1 test fuel" });
      await user.clear(testFuelField); await user.type(testFuelField, "5");
      const returnedCheckbox = screen.getAllByRole("checkbox", { name: /returned/i })[0];
      expect(returnedCheckbox).toBeChecked();
      await user.click(returnedCheckbox);
      const cashField = screen.getByRole("spinbutton", { name: "Pump A cash collected" });
      await user.clear(cashField); await user.type(cashField, "4500");
      const variance = screen.getByLabelText("Variance explanation");
      await user.type(variance, "Till was short by mistake");

      unmount();
      render(<DailyForecourtSheet {...props} />);

      expect(screen.getByRole("spinbutton", { name: "A-N1 closing totalizer" })).toHaveValue(150);
      expect(screen.getAllByRole("checkbox", { name: /returned/i })[0]).not.toBeChecked();
      expect(screen.getByRole("spinbutton", { name: "Pump A cash collected" })).toHaveValue(4500);
      expect(screen.getByLabelText("Variance explanation")).toHaveValue("Till was short by mistake");
    });

    it("clears the closing draft once the business day is actually closed", async () => {
      const user = userEvent.setup();
      const preview = { sales: { expectedSales: "0.00", accountedTender: "0.00", tenderVariance: "0.00", expectedCashHandover: "0.00", cashVariance: "0.00" }, nozzles: {}, tanks: {}, sides: [], products: [], staff: [], grossMargin: "0.00", estimatedOperatingProfit: "0.00" };
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.endsWith("/preview")) return { ok: true, json: async () => preview };
        if (url.endsWith("/close")) return { ok: true, json: async () => ({ id: "shift-1", reconciliation: preview }) };
        return { ok: true, json: async () => ({}) };
      }));
      vi.stubGlobal("crypto", { randomUUID: () => "request-1" });
      const activeShift = { id: "shift-1", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) };
      render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={products} staff={staff} stations={stations} tanks={tanks} activeShift={activeShift} />);

      for (const code of ["A-N1", "A-N2", "A-N3", "A-N4"]) {
        const field = screen.getByRole("spinbutton", { name: `${code} closing totalizer` });
        await user.type(field, "150");
      }
      for (const tank of tanks) {
        const field = screen.getByRole("spinbutton", { name: `${tank.name} closing stock` });
        await user.clear(field); await user.type(field, tank.currentStock);
      }
      expect(localStorage.getItem("forecourt-draft:closing:shift-1")).not.toBeNull();

      await user.click(screen.getByRole("button", { name: /review closing/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /close day/i })).toBeEnabled());
      await user.click(screen.getByRole("button", { name: /close day/i }));

      await waitFor(() => expect(localStorage.getItem("forecourt-draft:closing:shift-1")).toBeNull());
    });

    it("keeps test fuel marked as returned by default even when an older saved draft has no returned choices recorded", () => {
      localStorage.setItem("forecourt-draft:closing:shift-1", JSON.stringify({ testFuel: { a_n1: "5" }, testFuelReturned: {} }));
      const activeShift = { id: "shift-1", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: { a_n1: "0", a_n2: "0", a_n3: "0", a_n4: "0" }, openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) };
      render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={products} staff={staff} stations={stations} tanks={tanks} activeShift={activeShift} />);

      for (const checkbox of screen.getAllByRole("checkbox", { name: /returned/i })) {
        expect(checkbox).toBeChecked();
      }
    });
  });

  describe("individual pump save", () => {
    const stations = (["A", "B"] as const).flatMap((pump) => [1, 2, 3, 4].map((nozzle) => station(pump, nozzle)));
    const products = [{ id: "petrol", code: "PETROL", name: "Petrol", sellingPricePerLitre: "102.50", costPricePerLitre: "96.80" }, { id: "diesel", code: "DIESEL", name: "Diesel", sellingPricePerLitre: "100.50", costPricePerLitre: "94.40" }];
    const staff = [{ id: "arun", name: "Arun", monthlySalary: "18000" }];
    const tanks = [{ tankId: "petrol_tank", productId: "petrol", name: "Petrol Tank", productName: "Petrol", currentStock: "10000" }, { tankId: "diesel_tank", productId: "diesel", name: "Diesel Tank", productName: "Diesel", currentStock: "9000" }];
    const activeShift = { id: "shift-1", name: "Daily", businessDate: "2026-09-01", startedAt: "2026-09-01T06:00:00.000Z", openingNozzleReadings: Object.fromEntries(stations.map((item) => [item.stationId, "0"])), openingTankStocks: { petrol_tank: "10000", diesel_tank: "9000" }, staffAssignments: stations.map((item) => ({ nozzleId: item.stationId, staffId: "arun", staffName: "Arun" })) };

    it("saves only that pump's shift time, readings and collections when its own Save button is clicked", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({ ok: true, json: async () => ({ id: "shift-1" }) }));
      vi.stubGlobal("fetch", fetchMock);
      render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={products} staff={staff} stations={stations} tanks={tanks} activeShift={activeShift} />);

      const closingOne = screen.getByRole("spinbutton", { name: "A-N1 closing totalizer" });
      await user.clear(closingOne); await user.type(closingOne, "150");
      await user.type(screen.getByLabelText("Pump A shift start time"), "0600");
      await user.type(screen.getByLabelText("Pump A shift end time"), "1400");
      const cashField = screen.getByRole("spinbutton", { name: "Pump A cash collected" });
      await user.clear(cashField); await user.type(cashField, "1000");

      await user.click(screen.getByRole("button", { name: /save pump a/i }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/shifts/shift-1/pumps/pump-a", expect.objectContaining({ method: "PATCH" })));
      const [, request] = fetchMock.mock.calls.find(([url]) => url === "/api/shifts/shift-1/pumps/pump-a")!;
      const body = JSON.parse((request as RequestInit).body as string);
      expect(body.shiftStartTime).toBe("06:00");
      expect(body.shiftEndTime).toBe("14:00");
      expect(body.closingNozzleReadings).toMatchObject({ a_n1: "150" });
      expect(body.closingNozzleReadings).not.toHaveProperty("b_n1");
      expect(body.collections).toMatchObject({ cash: "1000" });

      expect(await screen.findByText(/^saved \d/i)).toBeInTheDocument();
    });

    it("pre-fills a pump's closing data and shift times from progress already saved on the server", () => {
      const shiftWithProgress = {
        ...activeShift,
        pumpProgress: {
          "pump-a": {
            pumpId: "pump-a", shiftStartTime: "06:00", shiftEndTime: "14:00",
            closingNozzleReadings: { a_n1: "500", a_n2: "500", a_n3: "500", a_n4: "500" },
            nonSaleDispenses: [],
            collections: { cash: "2000", upi: "0", card: "0", credit: "0", other: "0", declaredCashHandover: "2000" },
            savedAt: "2026-09-01T08:00:00.000Z"
          }
        }
      };
      render(<DailyForecourtSheet attendance={[]} businessDate="2026-09-01" previousReadings={{}} products={products} staff={staff} stations={stations} tanks={tanks} activeShift={shiftWithProgress} />);

      expect(screen.getByRole("spinbutton", { name: "A-N1 closing totalizer" })).toHaveValue(500);
      expect(screen.getByLabelText("Pump A shift start time")).toHaveValue("06:00");
      expect(screen.getByLabelText("Pump A shift end time")).toHaveValue("14:00");
      expect(screen.getByRole("spinbutton", { name: "Pump A cash collected" })).toHaveValue(2000);
      expect(screen.getByRole("spinbutton", { name: "Pump B cash collected" })).toHaveValue(0);
    });
  });
});
