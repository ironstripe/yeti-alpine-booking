import { Badge } from "@/components/ui/badge";
import { Globe, Phone, Mail, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingSourceBadgeProps {
  source: string | null | undefined;
  className?: string;
}

const SOURCE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  website: {
    label: "Website",
    icon: Globe,
    className: "bg-muted text-muted-foreground border-border hover:bg-muted",
  },
  vapi: {
    label: "Telefon",
    icon: Phone,
    className: "bg-muted text-muted-foreground border-border hover:bg-muted",
  },
  inbox: {
    label: "E-Mail",
    icon: Mail,
    className: "bg-muted text-muted-foreground border-border hover:bg-muted",
  },
  office: {
    label: "Büro",
    icon: Building2,
    className: "bg-muted text-muted-foreground border-border hover:bg-muted",
  },
};

export function BookingSourceBadge({ source, className }: BookingSourceBadgeProps) {
  const cfg = SOURCE_CONFIG[source ?? "office"] ?? SOURCE_CONFIG.office;
  const Icon = cfg.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 px-1.5 py-0 text-[10px] font-medium", cfg.className, className)}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  );
}
