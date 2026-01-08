import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface TomorrowPreviewProps {
  date: string;
  lessonCount: number;
  totalHours: number;
}

export function TomorrowPreview({ date, lessonCount, totalHours }: TomorrowPreviewProps) {
  const navigate = useNavigate();

  if (!date || lessonCount === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-muted-foreground">Morgen</p>
                <p className="text-sm text-muted-foreground">Keine Lektionen geplant</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formattedDate = format(parseISO(date), "EEEE, d. MMMM", { locale: de });

  return (
    <Card 
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => navigate("/instructor/schedule")}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wide mb-1">
              MORGEN
            </p>
            <p className="font-medium capitalize">{formattedDate}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {lessonCount} {lessonCount === 1 ? "Lektion" : "Lektionen"} · {totalHours} Stunden
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
