import { forwardRef } from "react";
import { AlertTriangle, Info, MapPin, Baby, Tag } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BookingWarning {
  id: string;
  type: "info" | "warning";
  icon: "age" | "location" | "discount" | "beginner" | "general";
  message: string;
}

interface BookingWarningsProps {
  warnings: BookingWarning[];
  className?: string;
  variant?: "default" | "compact";
}

const iconMap = {
  age: Baby,
  location: MapPin,
  discount: Tag,
  beginner: Info,
  general: AlertTriangle,
};

export const BookingWarnings = forwardRef<HTMLDivElement, BookingWarningsProps>(
  ({ warnings, className, variant = "default" }, ref) => {
    if (warnings.length === 0) return null;

    // Compact variant - inline badges
    if (variant === "compact") {
      return (
        <div ref={ref} className={cn("flex flex-wrap items-center gap-1.5", className)}>
          {warnings.map((warning) => {
            const Icon = iconMap[warning.icon];
            const isInfo = warning.type === "info";

            return (
              <Badge
                key={warning.id}
                variant="outline"
                className={cn(
                  "gap-1 text-[10px] px-1.5 py-0.5 font-normal",
                  isInfo
                    ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                    : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                )}
              >
                <Icon className="h-3 w-3 flex-shrink-0" />
                <span className="truncate max-w-[180px]">{warning.message}</span>
              </Badge>
            );
          })}
        </div>
      );
    }

    // Default variant - full alerts
    return (
      <div ref={ref} className={cn("space-y-2", className)}>
        {warnings.map((warning) => {
          const Icon = iconMap[warning.icon];
          const isInfo = warning.type === "info";

          return (
            <Alert
              key={warning.id}
              className={cn(
                isInfo
                  ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20"
                  : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  isInfo ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"
                )}
              />
              <AlertDescription
                className={cn(
                  isInfo ? "text-blue-800 dark:text-blue-200" : "text-amber-800 dark:text-amber-200"
                )}
              >
                {warning.message}
              </AlertDescription>
            </Alert>
          );
        })}
      </div>
    );
  }
);

BookingWarnings.displayName = "BookingWarnings";

export type { BookingWarning };
