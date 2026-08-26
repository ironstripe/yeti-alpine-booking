import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BookingStatusBadgeProps {
  status: string | null;
  paymentStatus: "paid" | "open" | "overdue" | "partial";
  hasUnconfirmedInstructor: boolean;
}

export function BookingStatusBadge({
  status,
  paymentStatus,
  hasUnconfirmedInstructor,
}: BookingStatusBadgeProps) {
  // Priority: cancelled > draft > instructor pending > payment status
  if (status === "cancelled" || status === "storno") {
    return (
      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
        🔴 Storniert
      </Badge>
    );
  }

  if (status === "partial_cancelled") {
    return (
      <Badge variant="outline" className="bg-destructive/10 text-orange-600 border-orange-500/20">
        🟠 Teilstorniert
      </Badge>
    );
  }

  if (status === "provisional") {
    return (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
        🔵 Provisorisch
      </Badge>
    );
  }

  if (status === "payment_pending") {
    return (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
        🔵 Zahlung läuft
      </Badge>
    );
  }

  if (status === "invoice_pending") {
    return (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/20">
        🟣 Rechnung offen
      </Badge>
    );
  }

  if (status === "expired") {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        ⚪ Abgelaufen
      </Badge>
    );
  }

  if (status === "draft") {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground">
        ⚪ Entwurf
      </Badge>
    );
  }

  if (hasUnconfirmedInstructor) {
    return (
      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/20">
        🟠 Ausstehend
      </Badge>
    );
  }

  if (paymentStatus === "paid") {
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
        🟢 Bezahlt
      </Badge>
    );
  }

  if (paymentStatus === "partial") {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
        🟡 Teilbezahlt
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
      🟡 Offen
    </Badge>
  );
}
