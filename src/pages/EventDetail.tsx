import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Trophy,
  Users,
  UserPlus,
  CreditCard,
  Clock,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventStatusBadge } from "@/components/events/EventStatusBadge";
import { EventParticipantsTab } from "@/components/events/EventParticipantsTab";
import { EventStartlistsTab } from "@/components/events/EventStartlistsTab";
import { EventResultsTab } from "@/components/events/EventResultsTab";
import { EventSettingsTab } from "@/components/events/EventSettingsTab";
import {
  useEventWithStats,
  useEventCategories,
} from "@/hooks/useEvents";

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 bg-muted rounded-lg">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: event, isLoading, participants } = useEventWithStats(id);
  const { data: categories } = useEventCategories(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Event nicht gefunden</p>
        <Button variant="link" asChild className="mt-4">
          <Link to="/events">Zurück zu Events</Link>
        </Button>
      </div>
    );
  }

  const deadlineDate = event.instructor_deadline
    ? new Date(event.instructor_deadline)
    : null;
  const deadlineDisplay = deadlineDate
    ? format(deadlineDate, "EEE HH:mm", { locale: de })
    : "-";

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/events">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Trophy className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">{event.name}</h1>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="text-muted-foreground mt-1">
            {format(new Date(event.event_date), "EEEE, dd. MMMM yyyy", {
              locale: de,
            })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Kursteilnehmer"
          value={event.course_participant_count || 0}
          icon={Users}
        />
        <StatCard
          label="Gäste"
          value={event.guest_participant_count || 0}
          icon={UserPlus}
        />
        <StatCard
          label="Bezahlt"
          value={`CHF ${event.total_paid || 0}`}
          icon={CreditCard}
        />
        <StatCard label="Deadline" value={deadlineDisplay} icon={Clock} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="participants" className="space-y-4">
        <TabsList className="w-full sm:w-auto flex">
          <TabsTrigger value="participants" className="flex-1 sm:flex-none">
            Teilnehmer
          </TabsTrigger>
          <TabsTrigger value="startlists" className="flex-1 sm:flex-none">
            Startlisten
          </TabsTrigger>
          <TabsTrigger value="results" className="flex-1 sm:flex-none">
            Ergebnisse
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 sm:flex-none">
            Einstellungen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="participants">
          <EventParticipantsTab
            event={event}
            participants={participants || []}
            categories={categories || []}
          />
        </TabsContent>

        <TabsContent value="startlists">
          <EventStartlistsTab
            event={event}
            participants={participants || []}
            categories={categories || []}
          />
        </TabsContent>

        <TabsContent value="results">
          <EventResultsTab
            event={event}
            participants={participants || []}
            categories={categories || []}
          />
        </TabsContent>

        <TabsContent value="settings">
          <EventSettingsTab event={event} categories={categories || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
