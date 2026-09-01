import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";
import { listExpenses } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { buildDashboardViewModel } from "@/server/services/dashboard-service";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [shifts, expenses, configuration] = await Promise.all([
    getOperationsRepository().listShifts(),
    listExpenses(),
    getForecourtConfigStore().getConfiguration()
  ]);
  return <OwnerDashboard dashboard={buildDashboardViewModel({ shifts, expenses, configuration })} />;
}
