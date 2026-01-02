import { Hotel, Mountain, Ticket, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MeetingPointSelectionProps {
  selectedPoint: string | null;
  onChange: (point: string) => void;
}

const MEETING_POINTS = [
  {
    id: "hotel_gorfion",
    name: "Hotel Gorfion",
    icon: Hotel,
    description: "Vor dem Haupteingang",
    location: "47.1234, 9.5678",
  },
  {
    id: "malbipark",
    name: "Malbipark",
    icon: Mountain,
    description: "Beim Zauberteppich",
    location: "47.1256, 9.5701",
  },
  {
    id: "kasse_taeli",
    name: "Kasse Täli",
    icon: Ticket,
    description: "Talstation Sesselbahn",
    location: "47.1189, 9.5623",
  },
];

export function MeetingPointSelection({
  selectedPoint,
  onChange,
}: MeetingPointSelectionProps) {
  const selectedMeetingPoint = MEETING_POINTS.find((p) => p.id === selectedPoint);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Treffpunkt
        </h3>
        <p className="text-sm text-muted-foreground">
          Wo sollen sich Teilnehmer und Skilehrer treffen?
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {MEETING_POINTS.map((point) => {
          const Icon = point.icon;
          const isSelected = selectedPoint === point.id;

          return (
            <Card
              key={point.id}
              className={cn(
                "cursor-pointer transition-all",
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:border-primary/50"
              )}
              onClick={() => onChange(point.id)}
            >
              <CardContent className="flex flex-col items-center p-4 text-center">
                <div
                  className={cn(
                    "mb-2 rounded-full p-3",
                    isSelected ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                <span className={cn("font-medium", isSelected && "text-primary")}>
                  {point.name}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Location details */}
      {selectedMeetingPoint && (
        <Card className="bg-muted/50">
          <CardContent className="flex items-start gap-3 p-4">
            <MapPin className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{selectedMeetingPoint.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedMeetingPoint.description}
              </p>
              <a
                href={`https://www.google.com/maps?q=${selectedMeetingPoint.location}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Auf Karte anzeigen
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}