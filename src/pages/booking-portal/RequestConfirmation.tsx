import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { BookingPortalLayout } from "@/components/booking-portal/BookingPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, Calendar, Users, Phone, Mail, Home, FileText, XCircle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface BookingRequest {
  id: string;
  request_number: string;
  status: string;
  type: string;
  sport_type: string;
  requested_date: string;
  requested_time_slot: string;
  duration_hours: number;
  participant_count: number;
  participants_data: Array<{
    firstName: string;
    lastName: string;
    birthDate: string;
  }>;
  customer_data: {
    firstName: string;
    lastName: string;
    email: string;
    salutation?: string;
  };
  estimated_price: number;
  voucher_code?: string;
  voucher_discount?: number;
  converted_ticket_id?: string;
  created_at: string;
}

const statusConfig = {
  pending: {
    label: "In Bearbeitung",
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  processing: {
    label: "Wird geprüft",
    icon: Clock,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  confirmed: {
    label: "Bestätigt",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  rejected: {
    label: "Abgelehnt",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
  expired: {
    label: "Abgelaufen",
    icon: XCircle,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
};

export default function RequestConfirmation() {
  const { token } = useParams<{ token: string }>();
  const [request, setRequest] = useState<BookingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRequest() {
      if (!token) {
        setError("Kein Token angegeben");
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("booking_requests")
          .select("*")
          .eq("magic_token", token)
          .single();

        if (fetchError) throw fetchError;
        
        // Transform the data to match our interface
        const transformedData: BookingRequest = {
          ...data,
          participants_data: (data.participants_data as unknown as BookingRequest['participants_data']) || [],
          customer_data: (data.customer_data as unknown as BookingRequest['customer_data']) || { firstName: '', lastName: '', email: '' },
        };
        setRequest(transformedData);
      } catch (err) {
        console.error("Error fetching request:", err);
        setError("Anfrage nicht gefunden");
      } finally {
        setLoading(false);
      }
    }

    fetchRequest();
  }, [token]);

  if (loading) {
    return (
      <BookingPortalLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </BookingPortalLayout>
    );
  }

  if (error || !request) {
    return (
      <BookingPortalLayout>
        <div className="text-center py-8">
          <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Anfrage nicht gefunden</h1>
          <p className="text-muted-foreground mb-4">
            Die angeforderte Buchungsanfrage konnte nicht gefunden werden.
          </p>
          <Button asChild>
            <Link to="/book">Neue Anfrage stellen</Link>
          </Button>
        </div>
      </BookingPortalLayout>
    );
  }

  const status = statusConfig[request.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;
  const customerName = `${request.customer_data.salutation || ""} ${request.customer_data.lastName}`.trim();
  const isNewRequest = request.status === "pending";

  return (
    <BookingPortalLayout>
      {/* Success Header (only for new requests) */}
      {isNewRequest && (
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Anfrage erhalten</h1>
          <p className="text-muted-foreground">
            Vielen Dank für Ihre Buchungsanfrage{customerName ? `, ${customerName}` : ""}!
          </p>
        </div>
      )}

      {/* Request Number */}
      <Card className="mb-6">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">Ihre Anfrage-Nummer</p>
          <p className="text-2xl font-mono font-bold tracking-wide">
            {request.request_number}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Bitte notieren Sie diese Nummer für Rückfragen.
          </p>
        </CardContent>
      </Card>

      {/* Status */}
      <Card className={cn("mb-6", status.bgColor)}>
        <CardContent className="p-4 flex items-center gap-3">
          <StatusIcon className={cn("h-6 w-6", status.color)} />
          <div>
            <div className={cn("font-medium", status.color)}>
              Status: {status.label}
            </div>
            <div className="text-sm text-muted-foreground">
              Aktualisiert: {format(new Date(request.created_at), "dd.MM.yyyy, HH:mm", { locale: de })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps (for pending requests) */}
      {isNewRequest && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="font-semibold mb-4">Wie geht es weiter?</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                  1
                </div>
                <div>
                  <div className="font-medium">Wir prüfen die Verfügbarkeit</div>
                  <div className="text-sm text-muted-foreground">innerhalb von 24 Stunden</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
                  2
                </div>
                <div>
                  <div className="font-medium">Sie erhalten eine Bestätigung</div>
                  <div className="text-sm text-muted-foreground">per E-Mail mit dem finalen Preis</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
                  3
                </div>
                <div>
                  <div className="font-medium">Bezahlen Sie bequem</div>
                  <div className="text-sm text-muted-foreground">online oder vor Ort bei Kursbeginn</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request Details */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Ihre Anfrage</h2>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium">
                {request.type === "private" ? "Privatstunde" : "Gruppenkurs"}{" "}
                {request.sport_type === "ski" ? "Ski" : "Snowboard"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {format(new Date(request.requested_date), "dd.MM.yyyy", { locale: de })} ·{" "}
              {request.requested_time_slot === "morning" 
                ? "Vormittag" 
                : request.requested_time_slot === "afternoon" 
                ? "Nachmittag" 
                : "Flexibel"}
            </div>
            {request.duration_hours && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {request.duration_hours} Stunden
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              {request.participant_count} {request.participant_count === 1 ? "Teilnehmer" : "Teilnehmer"}
            </div>

            {request.participants_data && request.participants_data.length > 0 && (
              <div className="pt-2 border-t">
                <div className="font-medium mb-1">Teilnehmer:</div>
                <ul className="list-disc list-inside text-muted-foreground">
                  {request.participants_data.map((p, i) => (
                    <li key={i}>
                      {p.firstName} {p.lastName}{" "}
                      {p.birthDate && `(${new Date().getFullYear() - new Date(p.birthDate).getFullYear()})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t">
              {request.voucher_discount && (
                <>
                  <div className="flex justify-between">
                    <span>Unterricht:</span>
                    <span>CHF {(request.estimated_price || 0) + request.voucher_discount}.00</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Gutschein {request.voucher_code}:</span>
                    <span>-CHF {request.voucher_discount}.00</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold">
                <span>Geschätzter Preis:</span>
                <span>CHF {request.estimated_price || 0}.-</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Email */}
      <Card className="mb-6 bg-muted/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4" />
            <span>Bestätigung gesendet an: {request.customer_data.email}</span>
          </div>
          <Button variant="link" size="sm" className="p-0 h-auto mt-1">
            Keine E-Mail erhalten? Erneut senden
          </Button>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Fragen?</h2>
          <div className="space-y-3">
            <a href="tel:+41811234567" className="flex items-center gap-2 hover:text-primary">
              <Phone className="h-4 w-4" />
              +41 81 123 45 67
            </a>
            <a href="mailto:info@skischule-yety.ch" className="flex items-center gap-2 hover:text-primary">
              <Mail className="h-4 w-4" />
              info@skischule-yety.ch
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" asChild className="flex-1">
          <Link to="/book">
            <Home className="h-4 w-4 mr-2" />
            Zur Startseite
          </Link>
        </Button>
        {request.status === "confirmed" && (
          <Button className="flex-1">
            <FileText className="h-4 w-4 mr-2" />
            Bestätigung (PDF)
          </Button>
        )}
      </div>
    </BookingPortalLayout>
  );
}
