import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function InstructorCardSkeleton() {
  return (
    <Card className="border-l-4 border-muted">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="mt-4">
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="mt-4 pt-3 border-t flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function InstructorGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <InstructorCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function InstructorTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="hidden min-w-[820px] grid-cols-[minmax(15rem,1.4fr)_8rem_11rem_11rem_7rem_12rem] gap-4 border-b bg-muted/40 px-4 py-3 md:grid">
        {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-4 w-20" />)}
      </div>
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="grid gap-3 px-4 py-3 md:min-w-[820px] md:grid-cols-[minmax(15rem,1.4fr)_8rem_11rem_11rem_7rem_12rem] md:items-center">
            <div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-5 w-40" /></div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
