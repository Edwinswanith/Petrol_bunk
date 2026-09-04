import { PageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <main className="page"><PageSkeleton cards={5} panels={3} /></main>;
}
