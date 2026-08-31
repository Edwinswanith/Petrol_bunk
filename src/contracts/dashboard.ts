export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "default" | "positive" | "warning";
};

export type TankSummary = {
  id: string;
  name: string;
  product: "Petrol" | "Diesel";
  litres: string;
  capacityLitres: string;
  percentage: number;
  daysRemaining: string;
  status: "healthy" | "watch" | "critical";
};

export type DashboardAlert = {
  id: string;
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  href: string;
};

export type DashboardViewModel = {
  greeting: string;
  ownerName: string;
  outletName: string;
  businessDateLabel: string;
  lastUpdatedLabel: string;
  dataStatus: "LIVE" | "CLOSED";
  metrics: DashboardMetric[];
  currentShift: {
    id: string;
    name: string;
    status: "OPEN";
    startedAtLabel: string;
    staffOnDuty: string[];
    completion: number;
  } | null;
  tanks: TankSummary[];
  fuelSold: Array<{ product: string; litres: string; percentage: number }>;
  paymentMix: Array<{ method: string; amount: string; percentage: number }>;
  alerts: DashboardAlert[];
};
