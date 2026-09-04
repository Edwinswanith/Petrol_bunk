import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <main className="page"><PageSkeleton cards={2} panels={2} /></main>;
}
