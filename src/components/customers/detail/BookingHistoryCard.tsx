import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  Receipt,
  ChevronRight,
  ChevronDown,
  MapPin,
  User,
  Users,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket } from "@/hooks/useCustomerDetail";
import { Skeleton } from "@/components/ui/skeleton";
import {
  derivePaymentStatus,
  getOutstanding,
  getPaymentMethodLabel,
  formatCHF,
  PAYMENT_STATUS_LABELS,
  isActiveTicketStatus,
} from "@/lib/finance";

interface BookingHistoryCardProps {
  tickets: Ticket[];
  isLoading?: boolean;
  customerId: string;
}

const TICKET_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  draft: { label: "Entwurf", variant: "secondary" },
  provisional: { label: "Provisorisch", variant: "outline" },
  payment_pending: { label: "Zahlung ausstehend", variant: "outline" },
  confirmed: { label: "Bestätigt", variant: "default" },
  completed: { label: "Abgeschlossen", variant: "default" },
  cancelled: { label: "Storniert", variant: "destructive" },
  expired: { label: "Abgelaufen", variant: "destructive" },
};

const PAYMENT_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  partially_paid: "outline",
  open: "secondary",
  overdue: "destructive",
  not_applicable: "secondary",
};

function formatDateRange(from: string | null, to: string | null): string {
  if (!from) return "Kein Kursdatum";
  const start = format(parseISO(from), "d. MMM yyyy", { locale: de });
  if (!to || to === from) return start;
  return `${format(parseISO(from), "d. MMM", { locale: de })} – ${format(parseISO(to), "d. MMM yyyy", { locale: de })}`;
}

function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

export function BookingHistoryCard({ tickets, isLoading, customerId }: BookingHistoryCardProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buchungshistorie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Nächster Termin zuerst, danach vergangene Kurse absteigend
  const sorted = [...tickets].sort((a, b) => {
    if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1;
    const aKey = a.courseDateFrom || a.created_at;
    const bKey = b.courseDateFrom || b.created_at;
    return a.isUpcoming ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Buchungshistorie</CardTitle>
          <Badge variant="secondary">{tickets.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">Noch keine Buchungen</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Hier erscheinen alle Buchungen dieses Kunden
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((ticket) => {
              const statusConfig =
                TICKET_STATUS_CONFIG[ticket.status || "draft"] || TICKET_STATUS_CONFIG.draft;

              const total = Number(ticket.total_amount || 0);
              const paid = Number(ticket.paid_amount || 0);
              const outstanding = getOutstanding(total, paid);
              const paymentStatus = derivePaymentStatus({
                ticketStatus: ticket.status,
                totalAmount: total,
                paidAmount: paid,
                dueDate: ticket.payment_due_date,
              });

              const participants = Array.from(
                new Set(ticket.items.map((i) => i.participantName).filter(Boolean))
              ) as string[];
              const products = Array.from(new Set(ticket.items.map((i) => i.productName)));
              const isGroup = ticket.items.some((i) => i.productType === "group");
              const isOpen = !!expanded[ticket.id];

              return (
                <div key={ticket.id} className="rounded-lg border">
                  <div className="flex items-start justify-between gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => setExpanded((s) => ({ ...s, [ticket.id]: !isOpen }))}
                      className="flex flex-1 items-start gap-2 text-left min-w-0"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 font-medium">
                            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                            {formatDateRange(ticket.courseDateFrom, ticket.courseDateTo)}
                          </span>
                          {ticket.isUpcoming && isActiveTicketStatus(ticket.status) && (
                            <Badge variant="outline">Bevorstehend</Badge>
                          )}
                          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                          <Badge variant={PAYMENT_BADGE_VARIANT[paymentStatus] || "secondary"}>
                            {PAYMENT_STATUS_LABELS[paymentStatus]}
                          </Badge>
                        </div>
                        <div className="mt-1 truncate text-sm">
                          {products[0] || "Keine Positionen"}
                          {products.length > 1 && (
                            <span className="text-muted-foreground">
                              {" "}
                              +{products.length - 1} weitere
                            </span>
                          )}
                          <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground">
                            {isGroup ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                            {isGroup ? "Gruppe" : "Privat"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          <span className="font-mono">{ticket.ticket_number}</span>
                          {participants.length > 0 && <> · {participants.join(", ")}</>}
                        </div>
                      </div>
                    </button>

                    <div className="text-right shrink-0">
                      <div className="font-medium">{formatCHF(total)}</div>
                      {outstanding > 0 ? (
                        <div className="text-xs text-destructive">
                          offen {formatCHF(outstanding)}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {getPaymentMethodLabel(ticket.payment_method)}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 px-2 text-xs"
                        onClick={() =>
                          navigate(`/bookings/${ticket.id}?from=customer&customerId=${customerId}`)
                        }
                      >
                        Öffnen
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t bg-muted/30 px-3 py-2 space-y-2">
                      {ticket.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Keine Positionen</p>
                      ) : (
                        ticket.items.map((item) => (
                          <div key={item.id} className="text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">
                                {format(parseISO(item.date), "EEE d. MMM", { locale: de })}
                                {item.time_start && (
                                  <span className="ml-2 text-muted-foreground">
                                    {formatTime(item.time_start)}
                                    {item.time_end && `–${formatTime(item.time_end)}`}
                                  </span>
                                )}
                              </span>
                              <span>{formatCHF(item.lineTotal)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.productName}
                              {item.participantName && <> · {item.participantName}</>}
                              {item.instructorName && <> · Lehrer: {item.instructorName}</>}
                            </div>
                            {item.meeting_point && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                {item.meeting_point}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
