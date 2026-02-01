import { Badge } from "@/components/ui/badge";

interface EventStatusBadgeProps {
  status: string;
}

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Entwurf", variant: "secondary" },
  registration_open: { label: "Anmeldung offen", variant: "default" },
  registration_closed: { label: "Anmeldung geschlossen", variant: "outline" },
  in_progress: { label: "Läuft", variant: "default" },
  completed: { label: "Abgeschlossen", variant: "secondary" },
  cancelled: { label: "Abgesagt", variant: "destructive" },
};

export function EventStatusBadge({ status }: EventStatusBadgeProps) {
  const config = statusConfig[status] || { label: status, variant: "secondary" as const };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
