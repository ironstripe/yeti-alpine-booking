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
  Bot,
  MapPin
} from "lucide-react";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { DateConflictWarning, type DateConflict } from "./DateConflictWarning";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { formatPhoneDisplay } from "@/lib/phone-utils";

interface ParticipantBooking {
  product_type?: string;
  product_suggestion?: string;
  dates?: Array<{ date: string; start_time?: string; end_time?: string; time_preference?: string }>;
  lunch_supervision?: boolean;
  is_vegetarian?: boolean;
}

interface BookingSummary {
  total_participants?: number;
  has_different_levels?: boolean;
  has_different_dates?: boolean;
  has_different_products?: boolean;
  date_range?: { start?: string; end?: string };
  warnings?: string[];
  date_conflicts?: DateConflict[];
  has_date_conflicts?: boolean;
}

interface ExtractedData {
  customer?: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string | {
      street?: string;
      zip?: string;
      city?: string;
      country?: string;
    };
    hotel?: string;
  };
  participants?: Array<{
    name: string;
    first_name?: string;
    last_name?: string;
    age?: number;
    skill_level?: string;
    discipline?: string;
    notes?: string;
    booking?: ParticipantBooking;
  }>;
  booking?: {
    product_type?: string;
    dates?: Array<{ date: string; start_time?: string; end_time?: string; time_preference?: string }>;
    flexibility?: string;
    instructor_preference?: string;
    lunch_supervision?: boolean;
    special_requests?: string;
  };
  booking_summary?: BookingSummary;
  confidence: number;
  notes?: string;
  is_booking_request?: boolean;
  classification?: string;
  detected_language?: string;
  missing_information?: string[];
  data_completeness?: number;
  booking_ready?: boolean;
}

const missingFieldLabels: Record<string, string> = {
  // Customer fields
  customer_name: "Vor- und Nachname",
  customer_contact: "E-Mail oder Telefonnummer",
  customer_address: "Adresse",
  customer_email: "E-Mail-Adresse",
  customer_phone: "Telefonnummer",
  // Participant fields
  participant_names: "Vornamen der Teilnehmer",
  participant_birthdates: "Geburtsdaten der Teilnehmer",
  participant_skill_levels: "Könnensstufe",
  participant_ages: "Alter der Teilnehmer",
  // Booking fields
  booking_dates: "Konkrete Buchungsdaten",
  booking_course_type: "Kurstyp (Privat/Gruppe)",
  booking_times: "Uhrzeiten (Start/Ende)",
  lunch_supervision: "Mittagsbetreuung",
  vegetarian_preference: "Vegetarisch (ja/nein)",
  // Legacy field names (backwards compatibility)
  start_date: "Startdatum",
  end_date: "Enddatum",
  number_of_days: "Anzahl Tage",
  number_of_participants: "Anzahl Teilnehmer",
  course_type: "Kurstyp",
  discipline: "Sportart (Ski/Snowboard)",
  skill_level: "Kenntnisstand",
  booking_reference: "Buchungsnummer",
  contact_phone: "Telefonnummer",
  preferred_time: "Bevorzugte Uhrzeit",
};

function formatMissingField(field: string): string {
  return missingFieldLabels[field] || field.replace(/_/g, " ");
}

interface ExtractionPanelProps {
  data: ExtractedData;
  onEdit?: () => void;
  showHeader?: boolean;
}

const skillLevelLabels: Record<string, string> = {
  beginner: "Anfänger",
  intermediate: "Fortgeschritten",
  advanced: "Experte",
  expert: "Experte",
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

function formatProductName(slug: string): string {
  const names: Record<string, string> = {
    "windel-wedel": "Windel-Wedel (3-4 J.)",
    "anfaenger-gruppenkurs": "Anfänger-Gruppenkurs",
    "fortgeschrittenen-gruppenkurs": "Fortgeschrittenen-Kurs",
    "experten-kurs": "Experten-Kurs",
    "privat": "Privatstunde",
  };
  return names[slug] || slug.replace(/-/g, " ");
}

function getSkillLevelVariant(level: string): "default" | "secondary" | "outline" {
  switch (level) {
    case "beginner": return "default";
    case "intermediate": return "secondary";
    case "advanced":
    case "expert": return "outline";
    default: return "secondary";
  }
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "EEE, dd.MM.yyyy", { locale: de });
  } catch {
    return dateStr;
  }
}

export function ExtractionPanel({ data, onEdit, showHeader = true }: ExtractionPanelProps) {
  const hasCustomer = data.customer && (data.customer.name || data.customer.email || data.customer.phone);
  const hasParticipants = data.participants && data.participants.length > 0;
  const hasDates = data.booking?.dates && data.booking.dates.length > 0;
  const hasParticipantBookings = data.participants?.some(p => p.booking);
  const hasWarnings = data.booking_summary?.warnings && data.booking_summary.warnings.length > 0;
  const hasDateConflicts = data.booking_summary?.has_date_conflicts && data.booking_summary.date_conflicts;

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

  // If showHeader is false, just render the content without the Card wrapper
  if (!showHeader) {
    return (
      <div className="space-y-4">
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
                  {formatPhoneDisplay(data.customer.phone)}
                </p>
              )}
              {/* Address display - handle both string and object formats */}
              {data.customer?.address && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {typeof data.customer.address === 'string' 
                    ? data.customer.address
                    : [
                        data.customer.address.street,
                        [data.customer.address.zip, data.customer.address.city].filter(Boolean).join(' '),
                        data.customer.address.country
                      ].filter(Boolean).join(', ')
                  }
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

        {/* Date Conflict Warning - show prominently */}
        {hasDateConflicts && (
          <DateConflictWarning conflicts={data.booking_summary!.date_conflicts!} />
        )}

        {/* Booking Summary Warnings */}
        {hasWarnings && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Hinweise
            </h4>
            <ul className="pl-6 space-y-1 text-sm text-amber-600">
              {data.booking_summary!.warnings!.map((warning, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Participants with Individual Booking Details */}
        {hasParticipants && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Teilnehmer & Buchungen ({data.participants!.length})
            </h4>
            <div className="space-y-3">
              {data.participants!.map((p, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/30">
                  {/* Participant Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {p.age && (
                        <Badge variant="outline" className="text-xs">
                          {p.age} J.
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {p.skill_level && p.skill_level !== "unknown" && (
                        <Badge variant={getSkillLevelVariant(p.skill_level)} className="text-xs">
                          {skillLevelLabels[p.skill_level] || p.skill_level}
                        </Badge>
                      )}
                      {p.discipline && p.discipline !== "unknown" && (
                        <Badge variant="secondary" className="text-xs">
                          {disciplineLabels[p.discipline] || p.discipline}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Participant-specific booking */}
                  {p.booking && (
                    <div className="pl-4 space-y-1 text-sm border-l-2 border-primary/20">
                      {/* Product suggestion */}
                      {p.booking.product_suggestion && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Kurs:</span>
                          <Badge variant="secondary" className="text-xs">
                            {formatProductName(p.booking.product_suggestion)}
                          </Badge>
                        </div>
                      )}

                      {/* Dates */}
                      {p.booking.dates && p.booking.dates.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>
                            {p.booking.dates.length} Tag(e): {p.booking.dates.map(d => formatDate(d.date)).join(", ")}
                          </span>
                        </div>
                      )}

                      {/* Lunch */}
                      {p.booking.lunch_supervision && (
                        <div className="flex items-center gap-2">
                          <UtensilsCrossed className="h-3 w-3 text-muted-foreground" />
                          <span>Mittagsbetreuung</span>
                          {p.booking.is_vegetarian && (
                            <Badge variant="outline" className="text-xs">Vegi</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Participant notes */}
                  {p.notes && (
                    <p className="text-xs text-muted-foreground italic pl-4">
                      "{p.notes}"
                    </p>
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

        {/* Missing Information */}
        {data.missing_information && data.missing_information.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                Fehlende Informationen
              </h4>
              <div className="pl-6 space-y-1">
                {data.missing_information.map((field, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-orange-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    {formatMissingField(field)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
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
            <ConfidenceIndicator completeness={data.data_completeness ?? data.confidence ?? 0} />
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
                  {formatPhoneDisplay(data.customer.phone)}
                </p>
              )}
              {/* Address display - handle both string and object formats */}
              {data.customer?.address && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {typeof data.customer.address === 'string' 
                    ? data.customer.address
                    : [
                        data.customer.address.street,
                        [data.customer.address.zip, data.customer.address.city].filter(Boolean).join(' '),
                        data.customer.address.country
                      ].filter(Boolean).join(', ')
                  }
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

        {/* Date Conflict Warning - show prominently */}
        {hasDateConflicts && (
          <DateConflictWarning conflicts={data.booking_summary!.date_conflicts!} />
        )}

        {/* Booking Summary Warnings */}
        {hasWarnings && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Hinweise
            </h4>
            <ul className="pl-6 space-y-1 text-sm text-amber-600">
              {data.booking_summary!.warnings!.map((warning, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Participants with Individual Booking Details */}
        {hasParticipants && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Teilnehmer & Buchungen ({data.participants!.length})
            </h4>
            <div className="space-y-3">
              {data.participants!.map((p, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/30">
                  {/* Participant Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {p.age && (
                        <Badge variant="outline" className="text-xs">
                          {p.age} J.
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {p.skill_level && p.skill_level !== "unknown" && (
                        <Badge variant={getSkillLevelVariant(p.skill_level)} className="text-xs">
                          {skillLevelLabels[p.skill_level] || p.skill_level}
                        </Badge>
                      )}
                      {p.discipline && p.discipline !== "unknown" && (
                        <Badge variant="secondary" className="text-xs">
                          {disciplineLabels[p.discipline] || p.discipline}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Participant-specific booking */}
                  {p.booking && (
                    <div className="pl-4 space-y-1 text-sm border-l-2 border-primary/20">
                      {/* Product suggestion */}
                      {p.booking.product_suggestion && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Kurs:</span>
                          <Badge variant="secondary" className="text-xs">
                            {formatProductName(p.booking.product_suggestion)}
                          </Badge>
                        </div>
                      )}

                      {/* Dates */}
                      {p.booking.dates && p.booking.dates.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span>
                            {p.booking.dates.length} Tag(e): {p.booking.dates.map(d => formatDate(d.date)).join(", ")}
                          </span>
                        </div>
                      )}

                      {/* Lunch */}
                      {p.booking.lunch_supervision && (
                        <div className="flex items-center gap-2">
                          <UtensilsCrossed className="h-3 w-3 text-muted-foreground" />
                          <span>Mittagsbetreuung</span>
                          {p.booking.is_vegetarian && (
                            <Badge variant="outline" className="text-xs">Vegi</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Participant notes */}
                  {p.notes && (
                    <p className="text-xs text-muted-foreground italic pl-4">
                      "{p.notes}"
                    </p>
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

        {/* Missing Information */}
        {data.missing_information && data.missing_information.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                Fehlende Informationen
              </h4>
              <div className="pl-6 space-y-1">
                {data.missing_information.map((field, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-orange-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    {formatMissingField(field)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
