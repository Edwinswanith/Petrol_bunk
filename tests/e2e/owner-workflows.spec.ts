import { expect, test } from "@playwright/test";

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

  await expect(page.getByText(new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(expected))).toBeVisible();
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
