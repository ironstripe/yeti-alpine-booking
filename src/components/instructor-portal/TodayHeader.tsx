import { Card, CardContent } from "@/components/ui/card";
import { Sun, Cloud, Snowflake, Clock, Users } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface TodayHeaderProps {
  instructorName?: string;
  lessonCount: number;
  totalHours: number;
  participantCount: number;
}

export function TodayHeader({ 
  instructorName, 
  lessonCount, 
  totalHours, 
  participantCount 
}: TodayHeaderProps) {
  const today = new Date();
  const hour = today.getHours();
  
  const getGreeting = () => {
    if (hour < 12) return "Guten Morgen";
    if (hour < 17) return "Guten Tag";
    return "Guten Abend";
  };

  const getWeatherIcon = () => {
    // In a real app, this would come from a weather API
    // For now, use snowflake as default (ski school!)
    return <Snowflake className="h-5 w-5 text-sky-400" />;
  };

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {getGreeting()}{instructorName ? `, ${instructorName}!` : "!"} 
          </h1>
          <p className="text-muted-foreground capitalize">
            {format(today, "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
        </div>
        {getWeatherIcon()}
      </div>

      {/* Today's Summary Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">HEUTE</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{lessonCount}</p>
              <p className="text-xs text-muted-foreground">
                {lessonCount === 1 ? "Lektion" : "Lektionen"}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{Math.round(totalHours)}</p>
              <p className="text-xs text-muted-foreground">Stunden</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{participantCount}</p>
              <p className="text-xs text-muted-foreground">Teilnehmer</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
