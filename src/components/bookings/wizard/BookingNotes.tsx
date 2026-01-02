import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface BookingNotesProps {
  internalNotes: string;
  instructorNotes: string;
  onInternalNotesChange: (notes: string) => void;
  onInstructorNotesChange: (notes: string) => void;
}

export function BookingNotes({
  internalNotes,
  instructorNotes,
  onInternalNotesChange,
  onInstructorNotesChange,
}: BookingNotesProps) {
  return (
    <div className="space-y-6">
      {/* Internal Notes */}
      <div className="space-y-2">
        <Label htmlFor="internal-notes">
          Interne Bemerkungen{" "}
          <span className="text-xs text-muted-foreground">
            (nur für Büro sichtbar)
          </span>
        </Label>
        <Textarea
          id="internal-notes"
          placeholder="z.B. Kulanzregelung, Sonderwünsche, Vorgeschichte..."
          value={internalNotes}
          onChange={(e) => onInternalNotesChange(e.target.value)}
          className="min-h-[80px]"
        />
      </div>

      {/* Instructor Notes */}
      <div className="space-y-2">
        <Label htmlFor="instructor-notes">Bemerkungen für Skilehrer</Label>
        <Textarea
          id="instructor-notes"
          placeholder="z.B. Treffpunkt-Details, Teilnehmer-Infos..."
          value={instructorNotes}
          onChange={(e) => onInstructorNotesChange(e.target.value)}
          className="min-h-[80px]"
        />
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
          Diese Bemerkungen werden dem Skilehrer bei der Buchungsbestätigung
          angezeigt.
        </p>
      </div>
    </div>
  );
}