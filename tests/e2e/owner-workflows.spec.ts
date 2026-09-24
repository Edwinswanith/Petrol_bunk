import { expect, test } from "@playwright/test";

const responsiveRoutes = ["/", "/day", "/shifts", "/stock", "/finance", "/more", "/staff", "/reports", "/settings"];

function indiaBusinessDate() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

test("Today automatically advances after every pump is completed for the previous business date", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One isolated rollover flow is sufficient.");
  const shifts = await (await request.get("/api/shifts")).json();
  const active = shifts.find((shift: { state: string }) => shift.state === "OPEN");
  expect(active).toBeTruthy();

  const stationsByPump = new Map<string, Array<{ stationId: string }>>();
  for (const station of active.stationSnapshots) {
    const pumpId = station.dispenserId ?? station.sideId ?? station.stationId;
    stationsByPump.set(pumpId, [...(stationsByPump.get(pumpId) ?? []), station]);
  }
  for (const [pumpId, stations] of stationsByPump) {
    const nozzleIds = stations.map((station) => station.stationId);
    const response = await request.patch(`/api/shifts/${active.id}/pumps/${pumpId}`, { data: {
      staffId: "rollover-test-employee", staffName: "Rollover Test Employee", nozzleIds,
      closingNozzleReadings: Object.fromEntries(nozzleIds.map((id) => [id, (Number(active.openingNozzleReadings[id]) + 1).toFixed(3)])),
      nonSaleDispenses: []
    } });
    expect(response.ok()).toBe(true);
  }

  const expectedDate = new Date(`${active.businessDate}T00:00:00.000Z`);
  expectedDate.setUTCDate(expectedDate.getUTCDate() + 1);
  const nextBusinessDate = expectedDate.toISOString().slice(0, 10);

  await page.goto("/day");
  await expect(page.getByLabel("Active business date")).toHaveValue(nextBusinessDate);

  const updated = (await (await request.get("/api/shifts")).json()).find((shift: { id: string }) => shift.id === active.id);
  expect(updated.businessDate).toBe(nextBusinessDate);
  expect(updated.pumpShiftHistory.every((entry: { businessDate: string }) => entry.businessDate === active.businessDate)).toBe(true);
});

test("owner can save and delete a dummy entry for today without changing previous records", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One isolated destructive-flow check is sufficient.");
  const today = indiaBusinessDate();
  const initialShifts = await (await request.get("/api/shifts")).json();
  const active = initialShifts.find((shift: { state: string }) => shift.state === "OPEN");
  const previousRecords = initialShifts.filter((shift: { state: string }) => shift.state === "CLOSED");
  expect(active).toBeTruthy();

  const dateResponse = await request.patch(`/api/shifts/${active.id}/business-date`, { data: { businessDate: today, reason: "Local dummy deletion verification" } });
  expect(dateResponse.ok()).toBe(true);
  const current = await dateResponse.json();
  const station = current.stationSnapshots[0];
  const pumpId = station.dispenserId ?? station.sideId ?? station.stationId;
  const previousEntry = [...(current.pumpShiftHistory ?? [])].reverse().find((entry: { closingNozzleReadings: Record<string, string> }) => entry.closingNozzleReadings[station.stationId] !== undefined);
  const opening = previousEntry?.closingNozzleReadings[station.stationId] ?? current.openingNozzleReadings[station.stationId];
  const closing = (Number(opening) + 1).toFixed(3);
  const saveResponse = await request.patch(`/api/shifts/${current.id}/pumps/${pumpId}`, { data: {
    staffId: "dummy-delete-operator", staffName: "Dummy Delete Operator", nozzleIds: [station.stationId],
    shiftStartTime: "12:00", shiftEndTime: "12:05", closingNozzleReadings: { [station.stationId]: closing }, nonSaleDispenses: []
  } });
  expect(saveResponse.ok()).toBe(true);
  const saved = await saveResponse.json();
  const dummyEntry = saved.pumpShiftHistory.find((entry: { staffId: string }) => entry.staffId === "dummy-delete-operator");
  expect(dummyEntry).toBeTruthy();

  await page.goto("/day");
  const savedPanel = page.getByRole("region", { name: "Saved entries for today" });
  await expect(savedPanel.getByText("Dummy Delete Operator")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await savedPanel.getByRole("button", { name: `Delete Dummy Delete Operator's ${dummyEntry.pumpLabel} entry` }).click();
  const mobileDialog = page.getByRole("dialog");
  await expect(mobileDialog).toBeVisible();
  const dialogBox = await mobileDialog.boundingBox();
  expect(dialogBox?.width ?? 1000).toBeLessThanOrEqual(390);
  expect(dialogBox?.height ?? 1000).toBeLessThanOrEqual(844);
  await page.getByRole("button", { name: "Keep entry" }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await savedPanel.getByRole("button", { name: `Delete Dummy Delete Operator's ${dummyEntry.pumpLabel} entry` }).click();
  await page.getByLabel("Reason for deleting this entry").fill("Dummy data used to verify deletion");
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(savedPanel.getByText("Dummy Delete Operator")).toHaveCount(0);
  await expect(page.getByLabel(`${station.code} closing totalizer`)).toHaveValue("");
  await expect(page.getByLabel(`${station.code} editable opening totalizer`)).toHaveValue(opening);

  const finalShifts = await (await request.get("/api/shifts")).json();
  const finalActive = finalShifts.find((shift: { id: string }) => shift.id === current.id);
  expect(finalActive.pumpShiftHistory.some((entry: { id: string }) => entry.id === dummyEntry.id)).toBe(false);
  expect(finalActive.pumpShiftVoids).toEqual(expect.arrayContaining([expect.objectContaining({ entryId: dummyEntry.id, reason: "Dummy data used to verify deletion" })]));
  expect(finalShifts.filter((shift: { state: string }) => shift.state === "CLOSED")).toEqual(previousRecords);

  await page.goto(`/finance/day/${today}`);
  await expect(page.getByText("Dummy Delete Operator")).toHaveCount(0);
});

test("owner screens stay inside common laptop, tablet and mobile viewports", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser project covers the responsive matrix.");

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    for (const route of responsiveRoutes) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} overflows at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test("Today pump workspace fits narrow desktops and preserves the two-employee handover flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop project covers the responsive workflow.");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1321, height: 800 },
    { width: 920, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/day");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `/day overflows at ${viewport.width}px`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/day");
  await page.getByRole("button", { name: "Add second employee to Pump 1" }).click();
  await expect(page.getByLabel("Pump 1 employee 1 workspace")).toBeVisible();
  await expect(page.getByLabel("Pump 1 employee 2 workspace")).toBeVisible();
  const employeeCards = await page.locator(".pump-workspace").first().locator(".employee-shift-card").evaluateAll((cards) => cards.map((card) => {
    const rect = card.getBoundingClientRect();
    return { top: Math.round(rect.top), right: Math.round(rect.right), width: Math.round(rect.width) };
  }));
  expect(employeeCards[1].top).toBeGreaterThan(employeeCards[0].top);
  expect(employeeCards.every((card) => card.right <= 1440 && card.width >= 900)).toBe(true);

  await page.getByLabel("Pump 1 employee 1 shift start time").fill("06:00");
  await page.getByLabel("Pump 1 employee 1 shift end time").fill("14:00");
  await page.getByRole("button", { name: "Extend Pump 1 Employee 1 shift" }).click();
  await expect(page.getByLabel("Pump 1 employee 1 shift end time")).toHaveValue("16:00");
  await expect(page.getByLabel("Pump 1 employee 2 shift start time")).toHaveValue("16:00");

  const workspaceOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(workspaceOverflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Use one employee on Pump 1" }).click();
  await expect(page.getByRole("button", { name: "Add second employee to Pump 1" })).toBeVisible();
});

test("Today actions never cover an editable field", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop project covers the laptop viewport.");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/day");

  const coveredFields = await page.evaluate(() => {
    const action = document.querySelector(".daily-sticky-action")?.getBoundingClientRect();
    if (!action) return [];
    return [...document.querySelectorAll("input, select, textarea")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        const overlaps = rect.left < action.right && rect.right > action.left && rect.top < action.bottom && rect.bottom > action.top;
        return visible && overlaps && !element.closest(".daily-sticky-action");
      })
      .map((element) => element.getAttribute("aria-label") ?? element.getAttribute("name") ?? element.tagName);
  });

  expect(coveredFields).toEqual([]);
});

test("Today collection fields use the available side width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop project covers the laptop viewport.");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/day");

  const widthRatio = await page.locator('input[name^="cash-"]').first().evaluate((input) => {
    const label = input.closest("label");
    return label ? input.getBoundingClientRect().width / label.getBoundingClientRect().width : 0;
  });
  expect(widthRatio).toBeGreaterThan(0.8);
});

test("mobile data tables retain their column labels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop project supplies the mobile viewport matrix.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/staff");

  const performanceTable = page.locator(".data-table").last();
  await expect(performanceTable.locator("tbody tr").first().locator("td").nth(1)).toHaveAttribute("data-label", "Monthly salary");
});

test("mobile operational form controls keep touch-friendly heights", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop project supplies the mobile viewport.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/day");
  for (const control of [page.locator('input[name^="cash-"]').first(), page.locator('input[name^="tank-closing-"]').first()]) {
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
  }

  await page.goto("/staff");
  for (const control of [page.getByLabel("Omapathy monthly salary"), page.locator('input[name="halfDays"]').first(), page.getByRole("button", { name: "Save Omapathy salary" })]) {
    expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
});

test("all six mobile navigation items stay on one row", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop project supplies the mobile viewport.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const positions = await page.locator(".bottom-nav-item").evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
  }));
  expect(positions).toHaveLength(6);
  expect(new Set(positions.map((position) => position.top)).size).toBe(1);
  const navBottom = await page.locator(".bottom-nav").evaluate((nav) => Math.round(nav.getBoundingClientRect().bottom));
  expect(Math.max(...positions.map((position) => position.bottom))).toBeLessThanOrEqual(navBottom);
});

test("owner can enter a balanced dummy day and review it from Today", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One isolated dummy close preview is sufficient.");
  const shifts = await (await request.get("/api/shifts")).json();
  const active = shifts.find((shift: { state: string }) => shift.state === "OPEN");
  expect(active).toBeTruthy();
  await page.goto("/day");

  const pumpTotals = new Map<string, number>();
  const pumpCodes = new Map<string, string>();
  const tankOutflow = new Map<string, number>();
  for (const station of active.stationSnapshots) {
    await page.getByLabel(`${station.code} closing totalizer`).fill((Number(active.openingNozzleReadings[station.stationId]) + 1).toFixed(3));
    const pumpId = station.dispenserId ?? station.sideId ?? station.stationId;
    pumpCodes.set(pumpId, station.dispenserCode ?? pumpId);
    pumpTotals.set(pumpId, (pumpTotals.get(pumpId) ?? 0) + Number(station.pricePerLitre));
    tankOutflow.set(station.tankId, (tankOutflow.get(station.tankId) ?? 0) + 1);
  }
  for (const [pumpId, total] of pumpTotals) {
    await page.getByLabel(`Pump ${pumpCodes.get(pumpId)} active operator`).selectOption({ index: 1 });
    await page.locator(`input[name="cash-${pumpId}"]`).fill(total.toFixed(2));
    await page.locator(`input[name="handover-${pumpId}"]`).fill(total.toFixed(2));
  }
  for (const [tankId, opening] of Object.entries(active.openingTankStocks as Record<string, string>)) {
    await page.locator(`input[name="tank-closing-${tankId}"]`).fill((Number(opening) - (tankOutflow.get(tankId) ?? 0)).toFixed(3));
  }

  await page.getByRole("button", { name: "Review closing" }).click();
  await expect(page.getByText("Server-calculated preview")).toBeVisible();
  await expect(page.locator(".form-error")).toHaveCount(0);
});

test("owner can move through the core operating views", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening)/i })).toBeVisible();
  await expect(page.getByText("Enter and review today’s forecourt operations.")).toBeVisible();
  await expect(page.getByText("Owner workspace")).toHaveCount(1);
  await expect(page.getByText("Swanith Fuels")).toHaveCount(0);
  await expect(page.getByText("Sales today")).toBeVisible();

  await page.getByRole("link", { name: "Stock" }).first().click();
  await expect(page).toHaveURL(/\/stock$/);
  await expect(page.getByRole("heading", { name: /fuel & stock/i })).toBeVisible();

  await page.getByRole("link", { name: "Finance" }).first().click();
  await expect(page.getByRole("heading", { name: /finance & profitability/i })).toBeVisible();
});

test("owner can enter the current petrol stock and see the audited adjustment", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One isolated stock adjustment is sufficient.");
  await page.goto("/stock");

  await page.getByLabel("Petrol current stock").fill("13500.250");
  await page.getByLabel("Petrol adjustment reason").fill("First physical dip");
  await page.getByRole("button", { name: "Save Petrol stock" }).click();

  await expect(page.getByText("Petrol stock updated to 13,500.25 L")).toBeVisible();
  await page.getByRole("link", { name: "Tank history" }).first().click();
  await expect(page.getByText("Manual stock adjustment · First physical dip")).toBeVisible();
  await expect(page.getByText("13,500.25 L", { exact: true })).toBeVisible();
});

test("owner can review a shift reconciliation", async ({ page, request }) => {
  const shifts = await (await request.get("/api/shifts")).json();
  const active = shifts.find((shift: { state: string }) => shift.state === "OPEN");
  expect(active).toBeTruthy();
  await page.goto(`/shifts/${active.id}`);

  await expect(page.getByRole("heading", { name: "Evening shift" })).toBeVisible();
  const stations = active.stationSnapshots ?? [
    { stationId: "petrol_1", code: "P1", productName: "Petrol", pricePerLitre: "102.50" },
    { stationId: "diesel_1", code: "D1", productName: "Diesel", pricePerLitre: "100.50" }
  ];
  for (const station of stations) {
    await page.locator(`input[name="closing-${station.stationId}"]`).fill((Number(active.openingNozzleReadings[station.stationId]) + 100).toFixed(3));
  }
  const expected = stations.reduce((total: number, station: { pricePerLitre: string }) => total + Number(station.pricePerLitre) * 100, 0);
  await page.getByLabel(/cash sales/i).fill(expected.toFixed(2));
  await page.locator('input[name="upi"]').fill("0");
  await page.getByLabel(/declared cash handover/i).fill(expected.toFixed(2));
  await page.getByRole("button", { name: /review reconciliation/i }).click();

  await expect(page.getByText(new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(expected), { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No payment variance")).toBeVisible();
});

test("owner can record an expense", async ({ page }) => {
  await page.goto("/finance/expenses/new");

  await page.getByLabel(/category/i).selectOption("maintenance");
  await page.getByLabel(/^amount/i).fill("4500");
  await page.getByLabel(/note/i).fill("Dispenser hose replacement");
  await page.getByRole("button", { name: /save expense/i }).click();

  await expect(page.getByText("Expense recorded")).toBeVisible();
});

test("owner can record receipt and quality evidence", async ({ page }) => {
  await page.goto("/stock/receipts/new");
  await page.getByLabel(/invoice number/i).fill(`INV-${Date.now()}`);
  await page.getByLabel(/tanker number/i).fill("TN 01 AB 1000");
  await page.getByLabel(/invoice quantity/i).fill("1000");
  await page.getByLabel(/accepted quantity/i).fill("998.5");
  await page.getByLabel(/invoice density/i).fill("742.5");
  await page.getByLabel(/observed density/i).fill("742.4");
  await page.getByLabel(/landed cost/i).fill("96.8");
  await page.getByRole("button", { name: /accept fuel receipt/i }).click();
  await expect(page.getByText("Fuel receipt recorded")).toBeVisible();

  await page.goto("/stock/density");
  await page.getByLabel(/temperature/i).fill("29");
  await page.getByLabel(/^density/i).fill("742.5");
  await page.getByLabel(/water dip/i).fill("0");
  await page.getByRole("button", { name: /save quality check/i }).click();
  await expect(page.getByText("Quality check recorded")).toBeVisible();
});

test("health and daily export are available", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const healthBody = await health.json();
  expect(healthBody.status).toBe("ok");
  expect(["memory-demo", "mongodb"]).toContain(healthBody.storage);

  await page.goto("/reports");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /daily export/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^forecourt-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("owner can configure a custom product, tank and station", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name === "mobile" ? "M" : "D";
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /products, tanks & stations/i })).toBeVisible();

  const productForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add fuel product" }) });
  await productForm.getByLabel("Code").fill(`ALT${suffix}`);
  await productForm.getByLabel("Name").fill(`Alternate ${suffix}`);
  await productForm.getByLabel(/customer selling price/i).fill("110");
  await productForm.getByLabel(/reseller purchase price/i).fill("102");
  await productForm.getByRole("button", { name: /add product/i }).click();
  await expect(page.getByRole("option", { name: `Alternate ${suffix} · ₹110` })).toBeAttached();

  const tankForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add fuel tank" }) });
  await tankForm.getByLabel("Code").fill(`XT${suffix}`);
  await tankForm.getByLabel("Name").fill(`Alternate Tank ${suffix}`);
  await tankForm.getByLabel("Fuel product").selectOption({ label: `Alternate ${suffix}` });
  await tankForm.getByLabel("Capacity").fill("10000");
  await tankForm.getByLabel("Opening stock").fill("5000");
  await tankForm.getByRole("button", { name: /add tank/i }).click();
  await expect(page.getByRole("option", { name: new RegExp(`Alternate Tank ${suffix}`) })).toBeAttached();

  const stationForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add station" }) });
  await stationForm.getByLabel("Code").fill(`X${suffix}`);
  await stationForm.getByLabel("Name").fill(`Alternate Station ${suffix}`);
  await stationForm.getByLabel("Fuel product").selectOption({ label: `Alternate ${suffix}` });
  await stationForm.getByLabel("Source tank").selectOption({ label: `Alternate Tank ${suffix} · Alternate ${suffix}` });
  await stationForm.getByRole("button", { name: /add station/i }).click();
  await expect(page.getByText(`Alternate Station ${suffix}`)).toBeVisible();
});
