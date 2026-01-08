import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Mail, 
  Phone, 
  Hotel, 
  Users, 
  Calendar, 
  UtensilsCrossed, 
  MessageSquare,
  Pencil,
  AlertTriangle,
  Bot
} from "lucide-react";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface ExtractedData {
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    hotel?: string;
  };
  participants?: Array<{
    name: string;
    age?: number;
    skill_level?: string;
    discipline?: string;
    notes?: string;
  }>;
  booking?: {
    product_type?: string;
    dates?: Array<{ date: string; time_preference?: string }>;
    flexibility?: string;
    instructor_preference?: string;
    lunch_supervision?: boolean;
    special_requests?: string;
  };
  confidence: number;
  notes?: string;
  is_booking_request?: boolean;
}

interface ExtractionPanelProps {
  data: ExtractedData;
  onEdit?: () => void;
}

const skillLevelLabels: Record<string, string> = {
  beginner: "Anfänger",
  intermediate: "Fortgeschritten",
  advanced: "Experte",
  unknown: "Unbekannt",
};

const disciplineLabels: Record<string, string> = {
  ski: "Ski",
  snowboard: "Snowboard",
  unknown: "Unbekannt",
};

const productTypeLabels: Record<string, string> = {
  private: "Privatstunde",
  group: "Gruppenkurs",
  unknown: "Unbekannt",
};

const timePreferenceLabels: Record<string, string> = {
  morning: "Vormittag",
  afternoon: "Nachmittag",
  full_day: "Ganztags",
  any: "Flexibel",
};

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "EEE, dd.MM.yyyy", { locale: de });
  } catch {
    return dateStr;
  }
}

export function ExtractionPanel({ data, onEdit }: ExtractionPanelProps) {
  const hasCustomer = data.customer && (data.customer.name || data.customer.email || data.customer.phone);
  const hasParticipants = data.participants && data.participants.length > 0;
  const hasDates = data.booking?.dates && data.booking.dates.length > 0;

  if (!data.is_booking_request) {
    return (
      <Card className="border-muted">
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Bot className="h-5 w-5" />
            <div>
              <p className="font-medium">Keine Buchungsanfrage erkannt</p>
              <p className="text-sm">Diese Nachricht scheint keine Buchungsanfrage zu sein.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            KI-Extraktion
          </CardTitle>
          <div className="flex items-center gap-2">
            <ConfidenceIndicator confidence={data.confidence} />
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-1" />
                Bearbeiten
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Customer Info */}
        {hasCustomer && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Kunde
            </h4>
            <div className="pl-6 space-y-1 text-sm">
              {data.customer?.name && (
                <p className="font-medium">{data.customer.name}</p>
              )}
              {data.customer?.email && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {data.customer.email}
                </p>
              )}
              {data.customer?.phone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {data.customer.phone}
                </p>
              )}
              {data.customer?.hotel && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Hotel className="h-3 w-3" />
                  {data.customer.hotel}
                </p>
              )}
            </div>
          </div>
        )}

        {hasCustomer && (hasParticipants || hasDates) && <Separator />}

        {/* Participants */}
        {hasParticipants && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Teilnehmer ({data.participants!.length})
            </h4>
            <div className="pl-6 space-y-2">
              {data.participants!.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  {p.age && (
                    <Badge variant="outline" className="text-xs">
                      {p.age} Jahre
                    </Badge>
                  )}
                  {p.skill_level && p.skill_level !== "unknown" && (
                    <Badge variant="secondary" className="text-xs">
                      {skillLevelLabels[p.skill_level] || p.skill_level}
                    </Badge>
                  )}
                  {p.discipline && p.discipline !== "unknown" && (
                    <Badge variant="secondary" className="text-xs">
                      {disciplineLabels[p.discipline] || p.discipline}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasParticipants && hasDates && <Separator />}

        {/* Booking Details */}
        {(hasDates || data.booking?.product_type) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Buchungsdetails
            </h4>
            <div className="pl-6 space-y-2 text-sm">
              {data.booking?.product_type && data.booking.product_type !== "unknown" && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Typ:</span>
                  <Badge>{productTypeLabels[data.booking.product_type] || data.booking.product_type}</Badge>
                </div>
              )}
              
              {hasDates && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Termine:</span>
                  <ul className="list-disc list-inside ml-2 space-y-0.5">
                    {data.booking!.dates!.map((d, i) => (
                      <li key={i}>
                        {formatDate(d.date)}
                        {d.time_preference && d.time_preference !== "any" && (
                          <span className="text-muted-foreground">
                            {" "}({timePreferenceLabels[d.time_preference] || d.time_preference})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.booking?.lunch_supervision && (
                <div className="flex items-center gap-2">
                  <UtensilsCrossed className="h-3 w-3 text-muted-foreground" />
                  <span>Mittagsbetreuung gewünscht</span>
                </div>
              )}

              {data.booking?.instructor_preference && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Lehrerwunsch:</span>
                  <span>{data.booking.instructor_preference}</span>
                </div>
              )}

              {data.booking?.special_requests && (
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-3 w-3 text-muted-foreground mt-1" />
                  <span className="text-muted-foreground italic">
                    "{data.booking.special_requests}"
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Notes / Warnings */}
        {data.notes && (
          <>
            <Separator />
            <div className="flex items-start gap-2 text-sm text-yellow-600 bg-yellow-50 p-2 rounded-md">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{data.notes}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
