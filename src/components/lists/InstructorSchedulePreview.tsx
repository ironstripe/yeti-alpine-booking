import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useReactToPrint } from "react-to-print";
import { getLevelLabel, formatInstructorLevel, formatDisciplines } from "@/lib/level-utils";
import { LANGUAGE_OPTIONS } from "@/lib/participant-utils";
import type { InstructorSchedule } from "@/hooks/useListsData";

interface InstructorSchedulePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  instructors: InstructorSchedule[];
  onlyWithBookings: boolean;
  setOnlyWithBookings: (value: boolean) => void;
  showContact: boolean;
  setShowContact: (value: boolean) => void;
  showParticipantDetails: boolean;
  setShowParticipantDetails: (value: boolean) => void;
}

export function InstructorSchedulePreview({
  open,
  onOpenChange,
  date,
  instructors,
  onlyWithBookings,
  setOnlyWithBookings,
  showContact,
  setShowContact,
  showParticipantDetails,
  setShowParticipantDetails,
}: InstructorSchedulePreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [viewFormat, setViewFormat] = useState<"individual" | "overview">("overview");

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Skilehrer-Einsatzplan-${format(date, "yyyy-MM-dd")}`,
  });

  const dateDisplay = format(date, "EEEE, d. MMMM yyyy", { locale: de });
  const filteredInstructors = onlyWithBookings
    ? instructors.filter((i) => i.items.length > 0)
    : instructors;

  const getLanguageLabel = (lang: string | null) => {
    return LANGUAGE_OPTIONS[lang || "de"]?.label || "Deutsch";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Skilehrer-Einsatzplan · {format(date, "d. MMMM yyyy", { locale: de })}
          </DialogTitle>
        </DialogHeader>

        {/* Options */}
        <div className="space-y-3 border-b pb-4">
          <p className="text-sm font-medium">Optionen:</p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="onlyWithBookings"
                checked={onlyWithBookings}
                onCheckedChange={(checked) => setOnlyWithBookings(checked === true)}
              />
              <Label htmlFor="onlyWithBookings" className="text-sm">
                Nur Skilehrer mit Buchungen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showContact"
                checked={showContact}
                onCheckedChange={(checked) => setShowContact(checked === true)}
              />
              <Label htmlFor="showContact" className="text-sm">
                Kundenkontakt auf Karte
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showParticipantDetails"
                checked={showParticipantDetails}
                onCheckedChange={(checked) => setShowParticipantDetails(checked === true)}
              />
              <Label htmlFor="showParticipantDetails" className="text-sm">
                Teilnehmer-Details
              </Label>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-sm font-medium mb-2">Format:</p>
            <RadioGroup
              value={viewFormat}
              onValueChange={(val) => setViewFormat(val as "individual" | "overview")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="individual" id="individual" />
                <Label htmlFor="individual" className="text-sm">
                  Eine Seite pro Skilehrer (A5)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="overview" id="overview" />
                <Label htmlFor="overview" className="text-sm">
                  Alle auf einer Seite (Übersicht)
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Preview */}
        <div className="border rounded-lg p-6 bg-white" ref={printRef}>
          <div className="print-content">
            {filteredInstructors.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Keine Skilehrer für diesen Tag
              </p>
            ) : viewFormat === "overview" ? (
              // Overview format
              <div>
                <div className="text-center mb-6">
                  <h1 className="text-xl font-bold">SCHNEESPORTSCHULE MALBUN</h1>
                  <h2 className="text-lg font-semibold">SKILEHRER-EINSATZPLAN</h2>
                  <p className="text-muted-foreground">{dateDisplay}</p>
                </div>

                <div className="space-y-4">
                  {filteredInstructors.map((instructor) => (
                    <div key={instructor.id} className="border rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold">{instructor.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {formatInstructorLevel(instructor.level)} · {formatDisciplines(instructor.specialization)}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p>Total: {instructor.totalHours}h</p>
                          <p className="text-muted-foreground">
                            P: {instructor.privateHours}h · G: {instructor.groupHours}h
                          </p>
                        </div>
                      </div>

                      {instructor.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Keine Buchungen</p>
                      ) : (
                        <div className="space-y-2 text-sm">
                          {instructor.items.map((item) => (
                            <div key={item.id} className="border-l-2 border-primary pl-2">
                              <p className="font-medium">
                                {item.timeStart} - {item.timeEnd}: {item.productName}
                              </p>
                              <p className="text-muted-foreground">
                                {item.customerName}
                                {showContact && item.customerPhone && ` · ${item.customerPhone}`}
                              </p>
                              {showParticipantDetails && item.participants.length > 0 && (
                                <ul className="text-xs text-muted-foreground ml-2">
                                  {item.participants.map((p, idx) => (
                                    <li key={idx}>
                                      {p.name} ({p.age}) - {getLevelLabel(p.level)}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Individual format
              <div className="space-y-8">
                {filteredInstructors.map((instructor) => (
                  <div
                    key={instructor.id}
                    className="border-2 rounded-lg p-4 page-break-after"
                  >
                    <div className="flex justify-between items-start border-b pb-2 mb-4">
                      <div>
                        <h2 className="text-lg font-bold">{instructor.name.toUpperCase()}</h2>
                        <p className="text-sm text-muted-foreground">
                          {formatInstructorLevel(instructor.level)} · {formatDisciplines(instructor.specialization)}
                        </p>
                      </div>
                      <p className="text-sm">{format(date, "d. MMMM yyyy", { locale: de })}</p>
                    </div>

                    {instructor.items.length === 0 ? (
                      <p className="text-muted-foreground py-8 text-center">Keine Buchungen</p>
                    ) : (
                      <div className="space-y-4">
                        {instructor.items.map((item) => (
                          <div key={item.id} className="border-b pb-3">
                            <p className="font-bold">
                              {item.timeStart} - {item.timeEnd} · {item.productName.toUpperCase()}
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-sm mt-1">
                              <p>
                                Ticket: <span className="font-mono">{item.ticketNumber}</span>
                              </p>
                              <p>Treffpunkt: {item.meetingPoint || "Nicht angegeben"}</p>
                              <p>
                                Kunde: {item.customerName}
                                {showContact && item.customerPhone && (
                                  <span className="font-mono text-xs ml-1">
                                    ({item.customerPhone})
                                  </span>
                                )}
                              </p>
                              <p>Sprache: {getLanguageLabel(item.language)}</p>
                            </div>

                            {showParticipantDetails && item.participants.length > 0 && (
                              <div className="mt-2">
                                <p className="text-sm font-medium">Teilnehmer:</p>
                                <ul className="text-sm ml-4">
                                  {item.participants.map((p, idx) => (
                                    <li key={idx}>
                                      • {p.name} ({p.age}) - {getLevelLabel(p.level)} -{" "}
                                      {p.sport === "ski" ? "Ski" : "Snowboard"}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {item.notes && (
                              <p className="text-sm mt-2 bg-muted/50 p-2 rounded">
                                Hinweis: {item.notes}
                              </p>
                            )}
                          </div>
                        ))}

                        <div className="text-sm pt-2 border-t">
                          Tagesstunden: {instructor.totalHours}h · Privatstunden:{" "}
                          {instructor.privateHours}h · Gruppenstunden: {instructor.groupHours}h
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-4 border-t text-sm text-muted-foreground">
              <p>
                Erstellt: {format(new Date(), "dd.MM.yyyy, HH:mm", { locale: de })} Uhr
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            {viewFormat === "individual" ? "Alle drucken" : "Drucken"}
          </Button>
          <Button variant="outline" onClick={() => handlePrint()}>
            <Download className="h-4 w-4 mr-2" />
            Als PDF speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
