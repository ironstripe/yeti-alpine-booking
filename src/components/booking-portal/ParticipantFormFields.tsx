import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { differenceInYears } from "date-fns";

export interface ParticipantData {
  firstName: string;
  lastName: string;
  birthDate: string;
  experienceLevel: string;
  needsRental: boolean;
  rentalHeightCm?: number;
  rentalShoeSize?: number;
  notes?: string;
}

interface ParticipantFormFieldsProps {
  index: number;
  data: ParticipantData;
  onChange: (data: ParticipantData) => void;
}

const experienceLevels = [
  { value: "never", label: "Anfänger - noch nie auf Ski/Snowboard" },
  { value: "beginner", label: "Anfänger - erste Versuche gemacht" },
  { value: "intermediate", label: "Fortgeschritten - fährt blaue Pisten" },
  { value: "advanced", label: "Geübt - fährt rote Pisten" },
  { value: "expert", label: "Experte - fährt schwarze Pisten" },
];

export function ParticipantFormFields({ index, data, onChange }: ParticipantFormFieldsProps) {
  const age = data.birthDate 
    ? differenceInYears(new Date(), new Date(data.birthDate))
    : null;

  const updateField = <K extends keyof ParticipantData>(field: K, value: ParticipantData[K]) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
      <h4 className="font-medium">Teilnehmer {index + 1}</h4>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`firstName-${index}`}>Vorname *</Label>
          <Input
            id={`firstName-${index}`}
            value={data.firstName}
            onChange={(e) => updateField("firstName", e.target.value)}
            placeholder="Vorname"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`lastName-${index}`}>Nachname *</Label>
          <Input
            id={`lastName-${index}`}
            value={data.lastName}
            onChange={(e) => updateField("lastName", e.target.value)}
            placeholder="Nachname"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`birthDate-${index}`}>Geburtsdatum *</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`birthDate-${index}`}
            type="date"
            value={data.birthDate}
            onChange={(e) => updateField("birthDate", e.target.value)}
            required
            className="flex-1"
          />
          {age !== null && (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              ({age} Jahre)
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`experience-${index}`}>Erfahrungsstufe *</Label>
        <Select
          value={data.experienceLevel}
          onValueChange={(value) => updateField("experienceLevel", value)}
        >
          <SelectTrigger id={`experience-${index}`}>
            <SelectValue placeholder="Bitte wählen..." />
          </SelectTrigger>
          <SelectContent>
            {experienceLevels.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Ausrüstung</Label>
        <RadioGroup
          value={data.needsRental ? "rental" : "own"}
          onValueChange={(value) => updateField("needsRental", value === "rental")}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="own" id={`own-${index}`} />
            <Label htmlFor={`own-${index}`} className="font-normal cursor-pointer">
              Eigene Ausrüstung
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="rental" id={`rental-${index}`} />
            <Label htmlFor={`rental-${index}`} className="font-normal cursor-pointer">
              Leihausrüstung benötigt
            </Label>
          </div>
        </RadioGroup>
      </div>

      {data.needsRental && (
        <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
          <div className="space-y-2">
            <Label htmlFor={`height-${index}`}>Körpergrösse (cm)</Label>
            <Input
              id={`height-${index}`}
              type="number"
              value={data.rentalHeightCm || ""}
              onChange={(e) => updateField("rentalHeightCm", parseInt(e.target.value) || undefined)}
              placeholder="z.B. 125"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`shoe-${index}`}>Schuhgrösse</Label>
            <Input
              id={`shoe-${index}`}
              type="number"
              value={data.rentalShoeSize || ""}
              onChange={(e) => updateField("rentalShoeSize", parseInt(e.target.value) || undefined)}
              placeholder="z.B. 33"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`notes-${index}`}>Besondere Hinweise</Label>
        <Textarea
          id={`notes-${index}`}
          value={data.notes || ""}
          onChange={(e) => updateField("notes", e.target.value)}
          placeholder="z.B. Allergien, Einschränkungen..."
          rows={2}
        />
      </div>
    </div>
  );
}
