import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, ChevronRight, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isPast, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface PendingPayment {
  id: string;
  ticket_number: string;
  total_amount: number;
  paid_amount: number;
  payment_due_date: string | null;
  customer: {
    first_name: string | null;
    last_name: string;
  };
}

export function PendingPaymentsCard() {
  const navigate = useNavigate();

  const { data: pendingPayments, isLoading } = useQuery({
    queryKey: ["pending-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          ticket_number,
          total_amount,
          paid_amount,
          payment_due_date,
          customer:customers!tickets_customer_id_fkey (
            first_name,
            last_name
          )
        `)
        .neq("status", "cancelled")
        .order("payment_due_date", { ascending: true, nullsFirst: false })
        .limit(10);

      if (error) throw error;

      // Filter to only unpaid/partially paid
      return (data || []).filter((ticket) => {
        const remaining = (ticket.total_amount || 0) - (ticket.paid_amount || 0);
        return remaining > 0;
      }) as PendingPayment[];
    },
  });

  const openCount = pendingPayments?.length || 0;

  const getPaymentStatus = (dueDate: string | null) => {
    if (!dueDate) return { isOverdue: false, isDueSoon: false, label: "" };
    
    const due = parseISO(dueDate);
    const daysUntilDue = differenceInDays(due, new Date());
    
    if (isPast(due)) {
      return { 
        isOverdue: true, 
        isDueSoon: false, 
        label: "überfällig!" 
      };
    }
    
    if (daysUntilDue <= 3) {
      return { 
        isOverdue: false, 
        isDueSoon: true, 
        label: `in ${daysUntilDue} ${daysUntilDue === 1 ? "Tag" : "Tagen"}` 
      };
    }
    
    return { 
      isOverdue: false, 
      isDueSoon: false, 
      label: format(due, "dd.MM.yyyy", { locale: de }) 
    };
  };

  const handleRecordPayment = (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/bookings?payment=${ticketId}`);
  };

  const handleRemind = (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Mahnung senden - MVP placeholder", ticketId);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Zahlungen ausstehend
          {openCount > 0 && (
            <Badge variant="outline" className="ml-auto text-xs bg-amber-100 text-amber-800 border-amber-300">
              {openCount} offen
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Laden...</p>
        )}

        {!isLoading && openCount === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            Keine offenen Zahlungen
          </p>
        )}

        {pendingPayments?.slice(0, 3).map((payment) => {
          const remaining = (payment.total_amount || 0) - (payment.paid_amount || 0);
          const { isOverdue, isDueSoon, label } = getPaymentStatus(payment.payment_due_date);
          const customerName = `${payment.customer?.first_name || ""} ${payment.customer?.last_name || ""}`.trim();

          return (
            <div
              key={payment.id}
              className="flex items-start gap-2 p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/bookings/${payment.id}`)}
            >
              <div className={cn(
                "w-2 h-2 rounded-full mt-1.5 shrink-0",
                isOverdue && "bg-destructive",
                isDueSoon && !isOverdue && "bg-amber-500",
                !isOverdue && !isDueSoon && "bg-muted-foreground"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {payment.ticket_number}
                  </span>
                  <span className="text-sm font-medium truncate">
                    {customerName}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    CHF {remaining.toFixed(2)}
                  </span>
                  {payment.payment_due_date && (
                    <>
                      <span>•</span>
                      <span className={cn(
                        isOverdue && "text-destructive font-medium",
                        isDueSoon && !isOverdue && "text-amber-600 font-medium"
                      )}>
                        Fällig: {label}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {isOverdue && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => handleRemind(payment.id, e)}
                  >
                    Mahnen
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => handleRecordPayment(payment.id, e)}
                >
                  Erfassen
                </Button>
              </div>
            </div>
          );
        })}

        {openCount > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => navigate("/bookings?paymentStatus=open")}
          >
            Alle {openCount} anzeigen
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
