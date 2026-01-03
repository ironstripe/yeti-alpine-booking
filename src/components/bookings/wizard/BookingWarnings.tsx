import { forwardRef } from "react";
import { AlertTriangle, Info, MapPin, Baby, Tag } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
}

const iconMap = {
  age: Baby,
  location: MapPin,
  discount: Tag,
  beginner: Info,
  general: AlertTriangle,
};

export const BookingWarnings = forwardRef<HTMLDivElement, BookingWarningsProps>(
  ({ warnings, className }, ref) => {
    if (warnings.length === 0) return null;

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
