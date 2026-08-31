import { z } from "zod";

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "Enter a positive decimal value");

export const closeShiftSchema = z.object({
  closingNozzleReadings: z.record(z.string(), decimal),
  closingTankStocks: z.record(z.string(), decimal),
  nonSaleDispenses: z.array(
    z.object({
      nozzleId: z.string().min(1),
      volume: decimal,
      returnedToTank: z.boolean()
    })
  ),
  receipts: z.record(z.string(), decimal),
  payments: z.object({
    cashSales: decimal,
    upi: decimal,
    card: decimal,
    credit: decimal,
    other: decimal,
    cashReceipts: decimal,
    cashExpenses: decimal,
    cashRemovals: decimal,
    declaredCashHandover: decimal
  }),
  lubricantRevenue: decimal,
  lubricantCost: decimal,
  expenses: decimal,
  varianceExplanation: z.string().max(1000).optional()
});

export const openShiftSchema = z.object({
  name: z.string().min(2).max(80),
  businessDate: z.string().date(),
  staffOnDuty: z.array(z.string().min(1).max(80)).max(12),
  openingNozzleReadings: z.record(z.string(), decimal),
  openingTankStocks: z.record(z.string(), decimal)
});

export const expenseSchema = z.object({
  category: z.enum(["maintenance", "electricity", "salary", "cleaning", "bank_charges", "other"]),
  amount: decimal,
  paymentMethod: z.enum(["cash", "upi", "card", "bank"]),
  date: z.string().date(),
  note: z.string().min(2).max(500)
});

export const fuelReceiptSchema = z.object({
  supplier: z.string().min(2).max(120),
  invoiceNumber: z.string().min(2).max(80),
  tankerNumber: z.string().min(2).max(80),
  product: z.enum(["petrol", "diesel"]),
  tankId: z.enum(["petrol_tank", "diesel_tank"]),
  invoiceQuantity: decimal,
  acceptedQuantity: decimal,
  invoiceDensity: decimal,
  observedDensity: decimal,
  landedCost: decimal,
  note: z.string().max(500).optional()
}).superRefine((receipt, context) => {
  const expectedTank = receipt.product === "petrol" ? "petrol_tank" : "diesel_tank";
  if (receipt.tankId !== expectedTank) {
    context.addIssue({ code: "custom", path: ["tankId"], message: "Product does not match the selected tank" });
  }
});

export const densityCheckSchema = z.object({
  date: z.string().date(),
  tankId: z.enum(["petrol_tank", "diesel_tank"]),
  temperature: decimal,
  observedDensity: decimal,
  waterDip: decimal,
  note: z.string().max(500).optional()
});
