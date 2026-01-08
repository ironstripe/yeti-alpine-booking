import { cn } from "@/lib/utils";
import { Bot, AlertTriangle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConfidenceIndicatorProps {
  confidence: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function ConfidenceIndicator({ 
  confidence, 
  showLabel = true, 
  size = "md" 
}: ConfidenceIndicatorProps) {
  const getConfig = () => {
    if (confidence >= 0.85) {
      return {
        color: "text-green-600",
        bgColor: "bg-green-50 border-green-200",
        icon: CheckCircle,
        label: "Hohe Sicherheit",
        description: "Die KI ist sehr sicher bei der Extraktion",
      };
    }
    if (confidence >= 0.6) {
      return {
        color: "text-yellow-600",
        bgColor: "bg-yellow-50 border-yellow-200",
        icon: Bot,
        label: "Mittlere Sicherheit",
        description: "Bitte prüfen Sie die extrahierten Daten",
      };
    }
    return {
      color: "text-red-600",
      bgColor: "bg-red-50 border-red-200",
      icon: AlertTriangle,
      label: "Niedrige Sicherheit",
      description: "Manuelle Eingabe empfohlen",
    };
  };

  const config = getConfig();
  const Icon = config.icon;
  const percentage = Math.round(confidence * 100);
  const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "gap-1 cursor-help border",
            config.bgColor,
            config.color,
            textSize
          )}
        >
          <Icon className={iconSize} />
          <span>{percentage}%</span>
          {showLabel && <span className="hidden sm:inline">({config.label})</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{config.label}</p>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
