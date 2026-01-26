import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardTaskCardProps {
  title: string;
  count?: number;
  children: ReactNode;
  className?: string;
  emptyMessage?: string;
  isEmpty?: boolean;
}

export function DashboardTaskCard({
  title,
  count,
  children,
  className,
  emptyMessage = "Keine Einträge",
  isEmpty = false,
}: DashboardTaskCardProps) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {count !== undefined && count > 0 && (
            <Badge variant="secondary" className="text-xs">
              {count}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {emptyMessage}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
