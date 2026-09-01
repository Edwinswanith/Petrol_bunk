import { ForecourtSetup } from "@/components/settings/forecourt-setup";
import { PageHeader } from "@/components/ui/page-header";
import { getForecourtConfigStore } from "@/server/repositories/forecourt-config-store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const configuration = await getForecourtConfigStore().getConfiguration();
  return <main className="page"><PageHeader eyebrow="Single-owner workspace" title="Products, tanks & stations" description="Configure every fuel grade, storage tank and independently metered station used in shift reconciliation." /><ForecourtSetup configuration={configuration} /></main>;
}
