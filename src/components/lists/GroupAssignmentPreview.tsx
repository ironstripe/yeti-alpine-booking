import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useReactToPrint } from "react-to-print";
import { getLevelLabel } from "@/lib/level-utils";
import { LANGUAGE_OPTIONS } from "@/lib/participant-utils";
import type { GroupData } from "@/hooks/useListsData";

interface GroupAssignmentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  groups: GroupData[];
  showLevel: boolean;
  setShowLevel: (show: boolean) => void;
  showLanguage: boolean;
  setShowLanguage: (show: boolean) => void;
  showParentContact: boolean;
  setShowParentContact: (show: boolean) => void;
}

export function GroupAssignmentPreview({
  open,
  onOpenChange,
  date,
  groups,
  showLevel,
  setShowLevel,
  showLanguage,
  setShowLanguage,
  showParentContact,
  setShowParentContact,
}: GroupAssignmentPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Gruppeneinteilung-${format(date, "yyyy-MM-dd")}`,
  });

  const dateDisplay = format(date, "EEEE, d. MMMM yyyy", { locale: de });

  const getLanguageFlag = (lang: string | null) => {
    return LANGUAGE_OPTIONS[lang || "de"]?.flag || "🇩🇪";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Gruppeneinteilung · {format(date, "d. MMMM yyyy", { locale: de })}
          </DialogTitle>
        </DialogHeader>

        {/* Options */}
        <div className="space-y-3 border-b pb-4">
          <p className="text-sm font-medium">Optionen:</p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="showLevel"
                checked={showLevel}
                onCheckedChange={(checked) => setShowLevel(checked === true)}
              />
              <Label htmlFor="showLevel" className="text-sm">
                Swiss Snow League Level anzeigen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showLanguage"
                checked={showLanguage}
                onCheckedChange={(checked) => setShowLanguage(checked === true)}
              />
              <Label htmlFor="showLanguage" className="text-sm">
                Sprache anzeigen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showParentContact"
                checked={showParentContact}
                onCheckedChange={(checked) => setShowParentContact(checked === true)}
              />
              <Label htmlFor="showParentContact" className="text-sm">
                Elternkontakt anzeigen
              </Label>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="border rounded-lg p-6 bg-white" ref={printRef}>
          <div className="print-content">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold">SCHNEESPORTSCHULE MALBUN</h1>
              <h2 className="text-lg font-semibold">GRUPPENEINTEILUNG</h2>
              <p className="text-muted-foreground">{dateDisplay}</p>
            </div>

            {groups.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Keine Gruppen für diesen Tag
              </p>
            ) : (
              <div className="space-y-6">
                {groups.map((group, groupIndex) => {
                  const lunchCount = group.participants.filter((p) => p.hasLunch).length;

                  return (
                    <div key={group.id} className="border-t-2 border-primary pt-4">
                      <div className="mb-3">
                        <h3 className="font-bold text-base">
                          GRUPPE {groupIndex + 1}: {group.name.toUpperCase()} ({getLevelLabel(group.level)})
                        </h3>
                        <p className="text-sm">
                          Skilehrer: <span className="font-medium">{group.instructorName || "Nicht zugewiesen"}</span>
                        </p>
                        <p className="text-sm">
                          Zeit: {group.timeStart} - {group.timeEnd}
                        </p>
                        <p className="text-sm">
                          Treffpunkt: {group.meetingPoint || "Nicht angegeben"}
                        </p>
                      </div>

                      {group.participants.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                          Keine Teilnehmer zugeordnet
                        </p>
                      ) : (
                        <div className="space-y-1 text-sm">
                          {group.participants.map((participant, pIndex) => (
                            <div key={participant.id} className="flex items-center gap-2">
                              <span className="w-5">{pIndex + 1}.</span>
                              <span className="font-medium">
                                {participant.firstName} {participant.lastName || ""} ({participant.age})
                              </span>
                              {showLevel && (
                                <span className="text-muted-foreground">
                                  {getLevelLabel(participant.level)}
                                </span>
                              )}
                              {showLanguage && (
                                <span>{getLanguageFlag(participant.language)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 text-sm text-muted-foreground">
                        Teilnehmer: {group.participants.length}/{group.maxParticipants} ·{" "}
                        {lunchCount > 0
                          ? `Mittagsbetreuung: ${lunchCount}`
                          : "Keine Mittagsbetreuung"}
                      </div>
                    </div>
                  );
                })}
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
            Drucken
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
