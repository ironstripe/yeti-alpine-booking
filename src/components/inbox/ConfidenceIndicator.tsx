import { cn } from "@/lib/utils";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConfidenceIndicatorProps {
  completeness: number; // 0-1, rule-based completeness score
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ConfidenceIndicator({ 
  completeness, 
  showLabel = true, 
  size = "md",
  className,
}: ConfidenceIndicatorProps) {
  const percentage = Math.round(completeness * 100);
  
  // Determine level based on completeness
  const getLevel = () => {
    if (percentage >= 80) return { 
      label: "Vollständig", 
      color: "text-green-600", 
      bgColor: "bg-green-50 border-green-200",
      icon: CheckCircle,
      description: "Alle wichtigen Daten wurden extrahiert",
    };
    if (percentage >= 50) return { 
      label: "Teilweise", 
      color: "text-yellow-600", 
      bgColor: "bg-yellow-50 border-yellow-200",
      icon: AlertTriangle,
      description: "Einige Daten fehlen noch",
    };
    return { 
      label: "Unvollständig", 
      color: "text-red-600", 
      bgColor: "bg-red-50 border-red-200",
      icon: XCircle,
      description: "Viele wichtige Daten fehlen",
    };
  };
  
  const level = getLevel();
  const Icon = level.icon;
  
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };
  
  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "gap-1 cursor-help border",
            level.bgColor,
            level.color,
            sizeClasses[size],
            className
          )}
        >
          <Icon className={iconSizes[size]} />
          {showLabel && <span>{percentage}%</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{level.label}</p>
        <p className="text-xs text-muted-foreground">{level.description}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {percentage}% der Buchungsdaten extrahiert
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
