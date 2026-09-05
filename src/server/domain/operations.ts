import type {
  NonSaleDispense,
  calculateNozzleSales,
  calculatePaymentReconciliation,
  calculateTankReconciliation
} from "@/server/calculations/reconciliation";

export type ShiftState = "OPEN" | "CLOSED";

export type StaffAssignment = {
  staffId: string;
  staffName: string;
  nozzleId: string;
};

export type StationSnapshot = {
  stationId: string;
  code: string;
  name: string;
  productId: string;
  productName: string;
  tankId: string;
  tankName: string;
  pricePerLitre: string;
  costPerLitre: string;
  marketReferencePrice?: string;
  dispenserId?: string;
  dispenserCode?: string;
  sideId?: string;
  sideLabel?: string;
  nozzleNumber?: number;
  displayOrder?: number;
};

export type SideCollection = {
  cash: string;
  upi: string;
  card: string;
  credit: string;
  other: string;
  declaredCashHandover: string;
};

export type TankSnapshot = {
  tankId: string;
  code: string;
  name: string;
  productId: string;
  productName: string;
  capacityLitres: string;
};

export type OpenShiftInput = {
  name: string;
  businessDate: string;
  staffOnDuty: string[];
  staffAssignments?: StaffAssignment[];
  stationSnapshots?: StationSnapshot[];
  tankSnapshots?: TankSnapshot[];
  openingNozzleReadings: Record<string, string>;
  openingTankStocks: Record<string, string>;
  stationOverrides?: Record<string, { productId: string; tankId: string }>;
};

export type ActiveShiftCorrectionInput = {
  openingNozzleReadings: Record<string, string>;
  staffAssignments: StaffAssignment[];
  productRates?: Record<string, { sellingPricePerLitre: string; costPricePerLitre: string }>;
  reason?: string;
};

export type ActiveShiftPriceUpdateInput = {
  productRates: Record<string, { sellingPricePerLitre: string; costPricePerLitre: string }>;
  reason?: string;
};

export type PumpShiftCompletionInput = {
  staffId: string;
  staffName: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  closingNozzleReadings: Record<string, string>;
  nonSaleDispenses: Array<{ nozzleId: string; volume: string; returnedToTank: boolean }>;
  collections?: SideCollection;
};

export type PumpShiftRecord = {
  id: string;
  pumpId: string;
  pumpLabel: string;
  staffId: string;
  staffName: string;
  businessDate: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  openingNozzleReadings: Record<string, string>;
  closingNozzleReadings: Record<string, string>;
  nonSaleDispenses: Array<{ nozzleId: string; volume: string; returnedToTank: boolean }>;
  collections: SideCollection;
  litresSold: string;
  expectedSalesValue: string;
  accountedTender: string;
  tenderVariance: string;
  declaredCashHandover: string;
  cashVariance: string;
  products: Array<{ productId: string; productName: string; litresSold: string; revenue: string; grossProfit: string }>;
  nozzles: Record<string, { meteredVolume: string; customerSalesVolume: string; expectedTankOutflow: string; revenue: string }>;
  completedAt: string;
  corrections?: PumpShiftCorrection[];
  cascadeAdjustment?: PumpShiftCascadeAdjustment;
};

export type PumpShiftCorrectionInput = {
  staffId: string;
  staffName: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  closingNozzleReadings: Record<string, string>;
  nonSaleDispenses: Array<{ nozzleId: string; volume: string; returnedToTank: boolean }>;
  collections?: SideCollection;
  reason: string;
};

export type PumpShiftCorrection = {
  id: string;
  correctedAt: string;
  reason: string;
  previousClosingNozzleReadings: Record<string, string>;
  revisedClosingNozzleReadings: Record<string, string>;
  previousNonSaleDispenses: Array<{ nozzleId: string; volume: string; returnedToTank: boolean }>;
  revisedNonSaleDispenses: Array<{ nozzleId: string; volume: string; returnedToTank: boolean }>;
  previousCollections: SideCollection;
  revisedCollections: SideCollection;
  previousStaffId: string;
  revisedStaffId: string;
  previousStaffName: string;
  revisedStaffName: string;
  previousShiftStartTime?: string;
  revisedShiftStartTime?: string;
  previousShiftEndTime?: string;
  revisedShiftEndTime?: string;
};

export type PumpShiftCascadeAdjustment = {
  fromEntryId: string;
  adjustedAt: string;
};

export type ShiftCorrection = {
  id: string; correctedAt: string; reason: string;
  previousOpeningNozzleReadings: Record<string, string>; revisedOpeningNozzleReadings: Record<string, string>;
  previousStaffAssignments: StaffAssignment[]; revisedStaffAssignments: StaffAssignment[];
  previousProductRates: Record<string, { sellingPricePerLitre: string; costPricePerLitre: string }>;
  revisedProductRates: Record<string, { sellingPricePerLitre: string; costPricePerLitre: string }>;
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
  staffHandovers?: Record<string, string>;
  sideCollections?: Record<string, SideCollection>;
  varianceExplanation?: string;
};

type NozzleResult = ReturnType<typeof calculateNozzleSales>;
type TankResult = ReturnType<typeof calculateTankReconciliation>;
type SalesResult = ReturnType<typeof calculatePaymentReconciliation>;

export type ShiftReconciliation = {
  nozzles: Record<string, NozzleResult>;
  tanks: Record<string, TankResult>;
  sales: SalesResult;
  staff?: Array<{
    staffId: string;
    staffName: string;
    nozzleId: string;
    machineLabel: string;
    product: string;
    openingReading: string;
    closingReading: string;
    litresSold: string;
    expectedSalesValue: string;
    declaredHandover: string;
    handoverVariance: string;
  }>;
  products?: Array<{
    productId: string;
    productName: string;
    litresSold: string;
    revenue: string;
  }>;
  sides?: Array<{
    sideId: string;
    sideLabel: string;
    dispenserId: string;
    dispenserCode: string;
    staffId: string;
    staffName: string;
    nozzleIds: string[];
    litresSold: string;
    expectedSalesValue: string;
    cash: string;
    upi: string;
    card: string;
    credit: string;
    other: string;
    accountedTender: string;
    tenderVariance: string;
    declaredCashHandover: string;
    cashVariance: string;
    products: Array<{ productId: string; productName: string; litresSold: string; revenue: string; grossProfit: string }>;
  }>;
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
  corrections?: ShiftCorrection[];
  pumpShiftHistory?: PumpShiftRecord[];
};
