import { Skeleton } from "@/components/ui/skeleton";

export default function TeacherLoading() {
  return (
    <div className="px-5 pt-8 pb-4 space-y-6">
      <Skeleton className="h-6 w-32 rounded-lg" />
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}
