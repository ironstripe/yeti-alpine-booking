import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Phone, MapPin, Calendar, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CustomerStatusBadge } from "./CustomerStatusBadge";

interface CustomerContextPanelProps {
  customerId: string;
}

export function CustomerContextPanel({ customerId }: CustomerContextPanelProps) {
  const [showHistory, setShowHistory] = useState(false);

  const { data: customer, isLoading: customerLoading } = useQuery({
    queryKey: ["customer-context", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  const { data: bookings } = useQuery({
    queryKey: ["customer-bookings-context", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, ticket_number, created_at, total_amount, status")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  const { data: participants } = useQuery({
    queryKey: ["customer-participants-context", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_participants")
        .select("id, first_name, last_name, birth_date")
        .eq("customer_id", customerId);
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  if (customerLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">Kundendaten werden geladen...</p>
        </CardContent>
      </Card>
    );
  }

  if (!customer) return null;

  return (
    <Card className="border-green-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Bestandskunde</CardTitle>
          </div>
          <Link
            to={`/customers/${customerId}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Profil öffnen
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-medium text-foreground">
          {customer.first_name} {customer.last_name}
        </p>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Mail className="h-3 w-3" />
            <span>{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3" />
              <span>{customer.phone}</span>
            </div>
          )}
          {customer.street && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              <span>{customer.street}, {customer.zip} {customer.city}</span>
            </div>
          )}
        </div>

        {participants && participants.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Bekannte Teilnehmer ({participants.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {participants.map((p) => (
                  <Badge key={p.id} variant="secondary" className="text-xs">
                    {p.first_name} {p.last_name}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {bookings && bookings.length > 0 && (
          <>
            <Separator />
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline w-full"
            >
              <Calendar className="h-3 w-3" />
              Buchungshistorie ({bookings.length})
              {showHistory ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </button>
            {showHistory && (
              <div className="space-y-2">
                {bookings.map((booking) => (
                  <Link
                    key={booking.id}
                    to={`/bookings/${booking.id}`}
                    className="block p-2 rounded bg-muted/50 hover:bg-muted text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{booking.ticket_number}</span>
                      <Badge variant="outline" className="text-xs">{booking.status}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>{new Date(booking.created_at).toLocaleDateString("de-CH")}</span>
                      {booking.total_amount != null && (
                        <span>CHF {Number(booking.total_amount).toFixed(2)}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
