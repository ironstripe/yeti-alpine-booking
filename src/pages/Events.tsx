import { Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EventCard } from "@/components/events/EventCard";
import { useEvents, useCreateNextFridayEvent } from "@/hooks/useEvents";

export default function Events() {
  const { data: events, isLoading } = useEvents();
  const createNextFriday = useCreateNextFridayEvent();

  const upcomingEvents =
    events?.filter(
      (e) => e.status !== "completed" && e.status !== "cancelled"
    ) || [];

  const pastEvents =
    events?.filter((e) => e.status === "completed").slice(0, 10) || [];

  const handleCreateNextRace = () => {
    createNextFriday.mutate();
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            Events
          </h1>
          <p className="text-muted-foreground">
            Skirennen und Veranstaltungen verwalten
          </p>
        </div>
        <Button onClick={handleCreateNextRace} disabled={createNextFriday.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Nächsten Freitag erstellen
        </Button>
      </div>

      {/* Upcoming Events */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Anstehend</h2>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : upcomingEvents.length > 0 ? (
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center">
            Keine anstehenden Events
          </p>
        )}
      </section>

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Vergangen</h2>
          <div className="space-y-3">
            {pastEvents.map((event) => (
              <EventCard key={event.id} event={event} variant="past" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
