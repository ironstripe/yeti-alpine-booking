import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, ChevronRight, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useOutstandingCount } from "@/hooks/useOutstandingTickets";
import { formatCHF, PAYMENT_STATUS_LABELS } from "@/lib/finance";

/**
 * Dashboard counter for open balances.
 * Uses the exact same query as the "Unbezahlte Kurse" worklist,
 * so counter and list can never disagree.
 */
export function PendingPaymentsCard() {
  const navigate = useNavigate();
  const { count, totalOutstanding, rows, isLoading } = useOutstandingCount();

  const topRows = rows.slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Offene Zahlungen
          {count > 0 && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate("/finance/unpaid")}>
          Alle
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Wird geladen…</p>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground">Alle Kurse sind bezahlt.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Offener Betrag gesamt:{" "}
              <span className="font-semibold text-foreground">{formatCHF(totalOutstanding)}</span>
            </p>
            <div className="space-y-2">
              {topRows.map((row) => (
                <button
                  key={row.id}
                  onClick={() => navigate(`/bookings/${row.id}`)}
                  className="flex w-full items-center justify-between rounded-md border p-2 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.customer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.ticket_number}
                      {row.payment_due_date
                        ? ` · fällig ${format(parseISO(row.payment_due_date), "dd.MM.yyyy", { locale: de })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.isOverdue && <AlertCircle className="h-4 w-4 text-destructive" />}
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        row.isOverdue && "text-destructive"
                      )}
                    >
                      {formatCHF(row.outstanding)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {count > topRows.length && (
              <p className="text-xs text-muted-foreground">
                {count - topRows.length} weitere · Status:{" "}
                {PAYMENT_STATUS_LABELS[topRows[0].paymentStatus]}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
