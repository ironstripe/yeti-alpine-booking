import { format } from "date-fns";
import { de } from "date-fns/locale";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface PartialCancellationSelectorProps {
  bookingDays: string[];
  cancellationType: "full" | "partial";
  cancelledDays: string[];
  onCancellationTypeChange: (type: "full" | "partial") => void;
  onCancelledDaysChange: (days: string[]) => void;
}

export function PartialCancellationSelector({
  bookingDays,
  cancellationType,
  cancelledDays,
  onCancellationTypeChange,
  onCancelledDaysChange,
}: PartialCancellationSelectorProps) {
  if (bookingDays.length <= 1) return null;

  return (
    <div className="space-y-3">
      <Label>Art der Stornierung</Label>
      <RadioGroup
        value={cancellationType}
        onValueChange={(v) => onCancellationTypeChange(v as "full" | "partial")}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="full" id="cancel-full" />
          <Label htmlFor="cancel-full">Vollständige Stornierung (alle Tage)</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="partial" id="cancel-partial" />
          <Label htmlFor="cancel-partial">Teilstornierung (einzelne Tage)</Label>
        </div>
      </RadioGroup>

      {cancellationType === "partial" && (
        <div className="pl-6 space-y-2">
          <Label>Welche Tage stornieren?</Label>
          {bookingDays.map((day) => (
            <div key={day} className="flex items-center space-x-2">
              <Checkbox
                id={`day-${day}`}
                checked={cancelledDays.includes(day)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onCancelledDaysChange([...cancelledDays, day]);
                  } else {
                    onCancelledDaysChange(cancelledDays.filter((d) => d !== day));
                  }
                }}
              />
              <Label htmlFor={`day-${day}`}>
                {format(new Date(day), "EEEE, dd.MM.yyyy", { locale: de })}
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
