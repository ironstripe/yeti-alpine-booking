import { useState } from "react";
import { Clock, Download, UserPlus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryAccordion } from "./CategoryAccordion";
import { AddGuestDialog } from "./AddGuestDialog";
import { ImportFromCoursesDialog } from "./ImportFromCoursesDialog";
import {
  useUpdateEventParticipant,
  useDeleteEventParticipant,
  type Event,
  type EventCategory,
  type EventParticipant,
} from "@/hooks/useEvents";

interface EventParticipantsTabProps {
  event: Event;
  participants: EventParticipant[];
  categories: EventCategory[];
}

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    not_applicable: { label: "-", variant: "secondary" },
    pending: { label: "Offen", variant: "outline" },
    paid: { label: "Bezahlt", variant: "default" },
    waived: { label: "Erlassen", variant: "secondary" },
  };
  const { label, variant } = config[status] || { label: status, variant: "secondary" as const };
  return <Badge variant={variant}>{label}</Badge>;
}

export function EventParticipantsTab({
  event,
  participants,
  categories,
}: EventParticipantsTabProps) {
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showGuestDialog, setShowGuestDialog] = useState(false);

  const updateParticipant = useUpdateEventParticipant();
  const deleteParticipant = useDeleteEventParticipant();

  const courseCategories = categories.filter((c) => c.category_type === "course");
  const guestCategories = categories.filter((c) => c.category_type === "guest");

  const courseParticipants = participants.filter((p) => p.source === "group_course");
  const guestParticipants = participants.filter((p) => p.source !== "group_course");

  const handleMarkAsPaid = (participantId: string) => {
    updateParticipant.mutate({
      id: participantId,
      event_id: event.id,
      payment_status: "paid",
    });
  };

  const handleRemoveParticipant = (participantId: string) => {
    deleteParticipant.mutate({
      id: participantId,
      event_id: event.id,
    });
  };

  return (
    <div className="space-y-8">
      {/* Course Race Section */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Kursrennen ({event.course_race_time || "10:00"})
            </h2>
            <p className="text-sm text-muted-foreground">
              Teilnehmer aus Gruppenkursen mit 3+ Tagen
            </p>
          </div>
          <Button onClick={() => setShowImportDialog(true)}>
            <Download className="mr-2 h-4 w-4" />
            Aus Kursen importieren
          </Button>
        </div>

        {courseCategories.length > 0 ? (
          <div className="space-y-2">
            {courseCategories.map((category) => (
              <CategoryAccordion
                key={category.id}
                category={category}
                participants={courseParticipants.filter(
                  (p) => p.category_id === category.id
                )}
                eventId={event.id}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Noch keine Kategorien erstellt. Importiere Teilnehmer aus Kursen.
          </p>
        )}
      </section>

      <Separator />

      {/* Guest Race Section */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Gästerennen ({event.guest_race_time || "11:30"})
            </h2>
            <p className="text-sm text-muted-foreground">
              Privatkurs-Gäste und Walk-ins · CHF {event.guest_fee}
            </p>
          </div>
          <Button onClick={() => setShowGuestDialog(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Gast anmelden
          </Button>
        </div>

        {guestParticipants.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead>Bezahlt</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guestParticipants.map((participant, index) => (
                  <TableRow key={participant.id}>
                    <TableCell className="font-mono">
                      G-{String(index + 1).padStart(3, "0")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {participant.participant?.first_name ||
                        participant.guest_first_name}{" "}
                      {participant.participant?.last_name ||
                        participant.guest_last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {participant.category?.name || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {participant.source === "private_course"
                        ? "Privatkurs"
                        : "Walk-in"}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={participant.payment_status} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {participant.payment_status !== "paid" && (
                            <DropdownMenuItem
                              onClick={() => handleMarkAsPaid(participant.id)}
                            >
                              Als bezahlt markieren
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleRemoveParticipant(participant.id)}
                            className="text-destructive"
                          >
                            Entfernen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Noch keine Gäste angemeldet
          </p>
        )}
      </section>

      {/* Dialogs */}
      <ImportFromCoursesDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        event={event}
      />
      <AddGuestDialog
        open={showGuestDialog}
        onOpenChange={setShowGuestDialog}
        event={event}
        categories={guestCategories}
      />
    </div>
  );
}
