import { Link } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Trophy, ChevronRight, Users, UserPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "./EventStatusBadge";
import type { Event } from "@/hooks/useEvents";

interface EventCardProps {
  event: Event;
  variant?: "upcoming" | "past";
}

export function EventCard({ event, variant = "upcoming" }: EventCardProps) {
  const courseParticipants = event.course_participant_count || 0;
  const guestParticipants = event.guest_participant_count || 0;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <Trophy className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate">{event.name}</h3>
              <p className="text-sm text-muted-foreground">
                {format(new Date(event.event_date), "EEEE, dd. MMMM yyyy", {
                  locale: de,
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{courseParticipants}</span>
              </div>
              <div className="flex items-center gap-1">
                <UserPlus className="h-4 w-4" />
                <span>{guestParticipants}</span>
              </div>
            </div>
            <EventStatusBadge status={event.status} />
            <Button variant="outline" size="sm" asChild>
              <Link to={`/events/${event.id}`}>
                {variant === "past" ? "Ergebnisse" : "Verwalten"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
