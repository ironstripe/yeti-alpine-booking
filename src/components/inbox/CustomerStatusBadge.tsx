import { Badge } from "@/components/ui/badge";
import { UserCheck, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerStatusBadgeProps {
  isExistingCustomer: boolean;
  size?: "sm" | "md";
}

export function CustomerStatusBadge({ isExistingCustomer, size = "md" }: CustomerStatusBadgeProps) {
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  if (isExistingCustomer) {
    return (
      <Badge variant="outline" className={cn(
        "gap-1 border-green-200 bg-green-50 text-green-700",
        size === "sm" && "text-xs px-1.5 py-0"
      )}>
        <UserCheck className={iconSize} />
        Bestandskunde
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn(
      "gap-1 border-blue-200 bg-blue-50 text-blue-700",
      size === "sm" && "text-xs px-1.5 py-0"
    )}>
      <UserPlus className={iconSize} />
      Neukunde
    </Badge>
  );
}
