import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";
import { listExpenses } from "@/server/repositories/journal-store";
import { getOperationsRepository } from "@/server/repositories/repository-provider";
import { buildDashboardViewModel } from "@/server/services/dashboard-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [shifts, expenses] = await Promise.all([
    getOperationsRepository().listShifts(),
    listExpenses()
  ]);
  return <OwnerDashboard dashboard={buildDashboardViewModel({ shifts, expenses })} />;
}
