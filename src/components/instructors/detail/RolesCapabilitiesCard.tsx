import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useUpdateInstructor } from "@/hooks/useUpdateInstructor";
import { CapabilitiesManager } from "./CapabilitiesManager";
import { Award, UserCog } from "lucide-react";

interface RolesCapabilitiesCardProps {
  instructorId: string;
  currentType: string | null;
}

const instructorTypeOptions = [
  { value: "teacher", label: "Lehrer (Gruppenleiter)" },
  { value: "assistant", label: "Assistent" },
];

export function RolesCapabilitiesCard({ instructorId, currentType }: RolesCapabilitiesCardProps) {
  const updateInstructor = useUpdateInstructor(instructorId);

  const handleTypeChange = (value: string) => {
    updateInstructor.mutate({ instructor_type: value as "teacher" | "assistant" });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserCog className="h-5 w-5" />
          Rollen & Qualifikationen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Instructor Type */}
        <div className="space-y-2">
          <Label htmlFor="instructor-type">Typ</Label>
          <Select
            value={currentType || "teacher"}
            onValueChange={handleTypeChange}
            disabled={updateInstructor.isPending}
          >
            <SelectTrigger id="instructor-type">
              <SelectValue placeholder="Typ auswählen" />
            </SelectTrigger>
            <SelectContent>
              {instructorTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Capabilities Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base">Qualifikationen</Label>
          </div>
          <CapabilitiesManager instructorId={instructorId} />
        </div>
      </CardContent>
    </Card>
  );
}
