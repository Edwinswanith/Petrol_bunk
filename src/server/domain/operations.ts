import type {
  NonSaleDispense,
  calculateNozzleSales,
  calculatePaymentReconciliation,
  calculateTankReconciliation
} from "@/server/calculations/reconciliation";

export type ShiftState = "OPEN" | "CLOSED";

export type OpenShiftInput = {
  name: string;
  businessDate: string;
  staffOnDuty: string[];
  openingNozzleReadings: Record<string, string>;
  openingTankStocks: Record<string, string>;
};

export type CloseShiftInput = {
  closingNozzleReadings: Record<string, string>;
  closingTankStocks: Record<string, string>;
  nonSaleDispenses: Array<NonSaleDispense & { nozzleId: string }>;
  receipts: Record<string, string>;
  payments: {
    cashSales: string;
    upi: string;
    card: string;
    credit: string;
    other: string;
    cashReceipts: string;
    cashExpenses: string;
    cashRemovals: string;
    declaredCashHandover: string;
  };
  lubricantRevenue: string;
  lubricantCost: string;
  expenses: string;
  varianceExplanation?: string;
};

type NozzleResult = ReturnType<typeof calculateNozzleSales>;
type TankResult = ReturnType<typeof calculateTankReconciliation>;
type SalesResult = ReturnType<typeof calculatePaymentReconciliation>;

export type ShiftReconciliation = {
  nozzles: Record<string, NozzleResult>;
  tanks: Record<string, TankResult>;
  sales: SalesResult;
  grossMargin: string;
  estimatedOperatingProfit: string;
};

export type ShiftRecord = OpenShiftInput & {
  id: string;
  state: ShiftState;
  createdAt: string;
  startedAt: string;
  closedAt?: string;
  version: number;
  closingNozzleReadings?: Record<string, string>;
  closingTankStocks?: Record<string, string>;
  closingInput?: CloseShiftInput;
  reconciliation?: ShiftReconciliation;
  varianceExplanation?: string;
};
