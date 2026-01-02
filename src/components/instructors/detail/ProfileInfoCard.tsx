import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Mail, Phone, MapPin, ChevronDown, Eye, EyeOff, Edit } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { getLevelLabel } from "@/lib/instructor-utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type Instructor = Tables<"instructors">;

interface ProfileInfoCardProps {
  instructor: Instructor;
  onEdit: () => void;
}

export function ProfileInfoCard({ instructor, onEdit }: ProfileInfoCardProps) {
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const maskIBAN = (iban: string | null) => {
    if (!iban) return "-";
    if (showBankDetails) return iban;
    // Show first 4 and last 2 characters
    const cleaned = iban.replace(/\s/g, "");
    return `${cleaned.slice(0, 4)} **** **** **** **${cleaned.slice(-2)}`;
  };

  const maskAHV = (ahv: string | null) => {
    if (!ahv) return "-";
    if (showBankDetails) return ahv;
    // Show first 3 and last 2 characters
    return `${ahv.slice(0, 3)}.****.****.${ahv.slice(-2)}`;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500">Aktiv</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inaktiv</Badge>;
      case "paused":
        return <Badge variant="outline">Pausiert</Badge>;
      default:
        return <Badge variant="secondary">-</Badge>;
    }
  };

  const formatAddress = () => {
    const parts = [
      instructor.street,
      [instructor.zip, instructor.city].filter(Boolean).join(" "),
      instructor.country,
    ].filter(Boolean);
    return parts.join(", ") || null;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Profil</CardTitle>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-2" />
          Bearbeiten
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Contact Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Kontakt</h4>
          <div className="space-y-2">
            <a
              href={`mailto:${instructor.email}`}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <Mail className="h-4 w-4 text-muted-foreground" />
              {instructor.email}
            </a>
            <a
              href={`tel:${instructor.phone}`}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              {instructor.phone}
            </a>
            {formatAddress() && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>{formatAddress()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Qualifications Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Qualifikationen</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Ausbildungsstufe:</span>
              <Badge variant="outline">{getLevelLabel(instructor.level)}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Spezialisierung:</span>
              <span className="text-sm">
                {instructor.specialization === "both"
                  ? "Ski & Snowboard"
                  : instructor.specialization === "snowboard"
                  ? "Snowboard"
                  : "Ski"}
              </span>
            </div>
            {instructor.languages && instructor.languages.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Sprachen:</span>
                {instructor.languages.map((lang) => (
                  <Badge key={lang} variant="secondary" className="text-xs">
                    {lang === "de" ? "Deutsch" : lang === "en" ? "English" : lang === "fr" ? "Français" : lang === "it" ? "Italiano" : lang}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Employment Section */}
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Anstellung</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Stundenlohn:</span>
              <span className="ml-2 font-medium">CHF {instructor.hourly_rate?.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Rolle:</span>
              <span className="ml-2">
                {instructor.role === "rolle_2" ? "Rolle 2 (Senior)" : "Rolle 1 (Standard)"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              {getStatusBadge(instructor.status)}
            </div>
            {instructor.entry_date && (
              <div>
                <span className="text-muted-foreground">Dabei seit:</span>
                <span className="ml-2">
                  {format(new Date(instructor.entry_date), "dd.MM.yyyy", { locale: de })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bank Details Section (Collapsible) */}
        {(instructor.bank_name || instructor.iban || instructor.ahv_number) && (
          <Collapsible open={bankOpen} onOpenChange={setBankOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                <h4 className="text-sm font-medium text-muted-foreground">Bankverbindung</h4>
                <ChevronDown className={`h-4 w-4 transition-transform ${bankOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="space-y-2 text-sm">
                <div className="flex justify-end mb-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBankDetails(!showBankDetails)}
                  >
                    {showBankDetails ? (
                      <>
                        <EyeOff className="h-3 w-3 mr-1" /> Ausblenden
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3 mr-1" /> Anzeigen
                      </>
                    )}
                  </Button>
                </div>
                {instructor.bank_name && (
                  <div>
                    <span className="text-muted-foreground">Bank:</span>
                    <span className="ml-2">{instructor.bank_name}</span>
                  </div>
                )}
                {instructor.iban && (
                  <div>
                    <span className="text-muted-foreground">IBAN:</span>
                    <span className="ml-2 font-mono text-xs">{maskIBAN(instructor.iban)}</span>
                  </div>
                )}
                {instructor.ahv_number && (
                  <div>
                    <span className="text-muted-foreground">AHV:</span>
                    <span className="ml-2 font-mono text-xs">{maskAHV(instructor.ahv_number)}</span>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Notes Section */}
        {instructor.notes && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Notizen</h4>
            <p className="text-sm bg-muted/50 p-3 rounded-md">{instructor.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
