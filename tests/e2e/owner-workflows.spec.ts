import { expect, test } from "@playwright/test";

const responsiveRoutes = ["/", "/day", "/shifts", "/stock", "/finance", "/more", "/staff", "/reports", "/settings"];

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

  const sideTotals = new Map<string, number>();
  const tankOutflow = new Map<string, number>();
  for (const station of active.stationSnapshots) {
    await page.getByLabel(`${station.code} active operator`).selectOption({ index: 1 });
    await page.getByLabel(`${station.code} closing totalizer`).fill((Number(active.openingNozzleReadings[station.stationId]) + 1).toFixed(3));
    const sideId = station.sideId ?? station.stationId;
    sideTotals.set(sideId, (sideTotals.get(sideId) ?? 0) + Number(station.pricePerLitre));
    tankOutflow.set(station.tankId, (tankOutflow.get(station.tankId) ?? 0) + 1);
  }
  for (const [sideId, total] of sideTotals) {
    await page.locator(`input[name="cash-${sideId}"]`).fill(total.toFixed(2));
    await page.locator(`input[name="handover-${sideId}"]`).fill(total.toFixed(2));
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
