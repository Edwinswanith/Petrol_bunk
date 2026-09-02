export type FuelProduct = {
  id: string;
  code: string;
  name: string;
  sellingPricePerLitre: string;
  costPricePerLitre: string;
  marketReferencePrice?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FuelTank = {
  id: string;
  code: string;
  name: string;
  productId: string;
  capacityLitres: string;
  currentStock: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FuelStation = {
  id: string;
  code: string;
  name: string;
  productId: string;
  tankId: string;
  totalizerPrecision: number;
  dispenserId?: string;
  dispenserCode?: string;
  sideId?: string;
  sideLabel?: string;
  nozzleNumber?: number;
  displayOrder?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ForecourtConfiguration = {
  products: FuelProduct[];
  tanks: FuelTank[];
  stations: FuelStation[];
};

export type InventoryMovementType =
  | "OPENING_BALANCE"
  | "FUEL_RECEIPT"
  | "SHIFT_DISPENSE"
  | "ADJUSTMENT";

export type InventoryMovement = {
  id: string;
  tankId: string;
  productId: string;
  type: InventoryMovementType;
  quantity: string;
  balanceAfter: string;
  referenceId: string;
  referenceLabel: string;
  businessDate: string;
  createdAt: string;
};

export type TankStockAdjustmentInput = {
  tankId: string;
  currentStock: string;
  previousStock: string;
  businessDate: string;
  reason: string;
};
