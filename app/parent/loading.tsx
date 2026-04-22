import { Skeleton } from "@/components/ui/skeleton";

export default function ParentLoading() {
  return (
    <div className="px-5 pt-8 pb-4 max-w-md mx-auto space-y-section">
      <Skeleton className="h-6 w-32 rounded-lg" />
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}
