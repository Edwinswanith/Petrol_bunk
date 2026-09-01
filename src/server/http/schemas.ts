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
  staffHandovers: z.record(z.string(), decimal).optional(),
  varianceExplanation: z.string().max(1000).optional()
});

const staffAssignmentSchema = z.object({
  staffId: z.string().min(1).max(100),
  staffName: z.string().min(1).max(80),
  nozzleId: z.string().min(1).max(100)
});

export const openShiftSchema = z.object({
  name: z.string().min(2).max(80),
  businessDate: z.string().date(),
  staffOnDuty: z.array(z.string().min(1).max(80)).max(50),
  staffAssignments: z.array(staffAssignmentSchema).max(100).default([]),
  openingNozzleReadings: z.record(z.string(), decimal),
  openingTankStocks: z.record(z.string(), decimal)
}).superRefine((shift, context) => {
  const nozzleIds = shift.staffAssignments.map((assignment) => assignment.nozzleId);
  if (new Set(nozzleIds).size !== nozzleIds.length) {
    context.addIssue({ code: "custom", path: ["staffAssignments"], message: "A machine can only have one staff member per shift" });
  }
});

export const staffSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional().default(""),
  note: z.string().trim().max(300).optional().default("")
});

export const attendanceSchema = z.object({
  staffId: z.string().min(1),
  businessDate: z.string().date(),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "LEAVE"]),
  checkIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  checkOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  note: z.string().trim().max(300).optional().default(""),
  shiftId: z.string().optional()
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
  product: z.string().min(1).max(100),
  tankId: z.string().min(1).max(100),
  invoiceQuantity: decimal,
  acceptedQuantity: decimal,
  invoiceDensity: decimal,
  observedDensity: decimal,
  landedCost: decimal,
  note: z.string().max(500).optional()
});

export const fuelProductSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(80),
  sellingPricePerLitre: decimal,
  costPricePerLitre: decimal
});

export const fuelPriceSchema = fuelProductSchema.pick({ sellingPricePerLitre: true, costPricePerLitre: true });

export const fuelTankSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(80),
  productId: z.string().min(1).max(100),
  capacityLitres: decimal,
  currentStock: decimal
});

export const fuelStationSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(80),
  productId: z.string().min(1).max(100),
  tankId: z.string().min(1).max(100),
  totalizerPrecision: z.number().int().min(0).max(3).default(3)
});

export const densityCheckSchema = z.object({
  date: z.string().date(),
  tankId: z.enum(["petrol_tank", "diesel_tank"]),
  temperature: decimal,
  observedDensity: decimal,
  waterDip: decimal,
  note: z.string().max(500).optional()
});
