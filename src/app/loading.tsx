import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <main className="page"><PageSkeleton cards={4} panels={1} /></main>;
}
