import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CustomerTableSkeleton() {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>E-Mail</TableHead>
            <TableHead>Telefon</TableHead>
            <TableHead>Kinder</TableHead>
            <TableHead>Erstellt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-5 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CustomerCardSkeleton() {
  return (
    <div className="md:hidden space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-6 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}
