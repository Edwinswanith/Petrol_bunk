import { expect, test } from "@playwright/test";

test("owner can move through the core operating views", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening)/i })).toBeVisible();
  await expect(page.getByText("₹5,42,850")).toBeVisible();

  await page.getByRole("link", { name: "Stock" }).first().click();
  await expect(page).toHaveURL(/\/stock$/);
  await expect(page.getByRole("heading", { name: /fuel & stock/i })).toBeVisible();

  await page.getByRole("link", { name: "Finance" }).first().click();
  await expect(page.getByRole("heading", { name: /money & margin/i })).toBeVisible();
});

test("owner can review a shift reconciliation", async ({ page, request }) => {
  const shifts = await (await request.get("/api/shifts")).json();
  const active = shifts.find((shift: { state: string }) => shift.state === "OPEN");
  expect(active).toBeTruthy();
  await page.goto(`/shifts/${active.id}`);

  await expect(page.getByRole("heading", { name: "Evening shift" })).toBeVisible();
  await page.getByLabel(/petrol closing meter/i).fill((Number(active.openingNozzleReadings.petrol_1) + 100).toFixed(3));
  await page.getByLabel(/diesel closing meter/i).fill((Number(active.openingNozzleReadings.diesel_1) + 100).toFixed(3));
  await page.getByLabel(/cash sales/i).fill("10000");
  await page.locator('input[name="upi"]').fill("10300");
  await page.getByLabel(/declared cash handover/i).fill("10000");
  await page.getByRole("button", { name: /review reconciliation/i }).click();

  await expect(page.getByText("₹20,300.00")).toBeVisible();
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
  await page.getByRole("link", { name: /download csv/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^forecourt-\d{4}-\d{2}-\d{2}\.csv$/);
});
