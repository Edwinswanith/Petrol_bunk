import type { DashboardViewModel } from "@/contracts/dashboard";

export const demoDashboard: DashboardViewModel = {
  greeting: "Good evening",
  ownerName: "Edwin",
  outletName: "Swanith Fuels",
  businessDateLabel: "Monday, 31 August",
  lastUpdatedLabel: "Updated just now",
  dataStatus: "LIVE",
  metrics: [
    { label: "Sales today", value: "₹5,42,850", detail: "+8.4% from last Monday", tone: "positive" },
    { label: "Gross margin", value: "₹29,420", detail: "5.4% of sales", tone: "positive" },
    { label: "Expenses", value: "₹6,350", detail: "3 entries today", tone: "default" },
    { label: "Est. operating profit", value: "₹23,070", detail: "Live estimate", tone: "positive" }
  ],
  currentShift: {
    id: "shift-live-001",
    name: "Evening shift",
    status: "OPEN",
    startedAtLabel: "Started at 5:00 PM",
    staffOnDuty: ["Kumar", "Ravi"],
    completion: 62
  },
  tanks: [
    {
      id: "petrol_tank",
      name: "Tank P1",
      product: "Petrol",
      litres: "12,450 L",
      capacityLitres: "20,000 L",
      percentage: 62,
      daysRemaining: "2.6 days",
      status: "healthy"
    },
    {
      id: "diesel_tank",
      name: "Tank D1",
      product: "Diesel",
      litres: "8,200 L",
      capacityLitres: "20,000 L",
      percentage: 41,
      daysRemaining: "1.4 days",
      status: "watch"
    }
  ],
  fuelSold: [
    { product: "Petrol", litres: "3,245 L", percentage: 54 },
    { product: "Diesel", litres: "2,819 L", percentage: 46 }
  ],
  paymentMix: [
    { method: "UPI", amount: "₹2,42,000", percentage: 45 },
    { method: "Cash", amount: "₹1,86,850", percentage: 34 },
    { method: "Card", amount: "₹1,04,000", percentage: 19 },
    { method: "Credit", amount: "₹10,000", percentage: 2 }
  ],
  alerts: [
    {
      id: "diesel-low",
      title: "Diesel stock is nearing reorder level",
      detail: "Approximately 1.4 days remaining at the current sales rate.",
      severity: "warning",
      href: "/stock"
    },
    {
      id: "density-complete",
      title: "Density checks completed",
      detail: "Petrol and diesel readings are within the recorded reference range.",
      severity: "info",
      href: "/stock/density"
    }
  ]
};
