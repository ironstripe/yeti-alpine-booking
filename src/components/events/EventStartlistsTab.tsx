import { useRef } from "react";
import { Hash, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useBulkUpdateStartNumbers,
  type Event,
  type EventCategory,
  type EventParticipant,
} from "@/hooks/useEvents";

interface EventStartlistsTabProps {
  event: Event;
  participants: EventParticipant[];
  categories: EventCategory[];
}

export function EventStartlistsTab({
  event,
  participants,
  categories,
}: EventStartlistsTabProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const bulkUpdate = useBulkUpdateStartNumbers();

  // Sort categories by sort_order
  const sortedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  const handleAssignStartNumbers = () => {
    const updates: { id: string; start_number: number }[] = [];
    let currentNumber = 1;

    for (const category of sortedCategories) {
      const categoryParticipants = participants
        .filter((p) => p.category_id === category.id && !p.opted_out)
        .sort((a, b) => {
          const nameA = `${a.participant?.last_name || a.guest_last_name || ""}`;
          const nameB = `${b.participant?.last_name || b.guest_last_name || ""}`;
          return nameA.localeCompare(nameB, "de");
        });

      for (const participant of categoryParticipants) {
        updates.push({
          id: participant.id,
          start_number: currentNumber++,
        });
      }

      // Reserve number between categories
      currentNumber++;
    }

    bulkUpdate.mutate(
      { event_id: event.id, updates },
      {
        onSuccess: () => {
          toast.success(`${updates.length} Startnummern zugewiesen`);
        },
      }
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const getParticipantsForCategory = (categoryId: string) =>
    participants
      .filter((p) => p.category_id === categoryId && !p.opted_out)
      .sort((a, b) => (a.start_number || 999) - (b.start_number || 999));

  const getBirthYear = (participant: EventParticipant) => {
    if (participant.guest_birth_year) {
      return participant.guest_birth_year;
    }
    if (participant.participant?.birth_date) {
      return new Date(participant.participant.birth_date).getFullYear();
    }
    return "-";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-semibold">Startlisten</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleAssignStartNumbers}
            disabled={bulkUpdate.isPending}
          >
            <Hash className="mr-2 h-4 w-4" />
            Startnummern zuweisen
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Drucken
          </Button>
        </div>
      </div>

      {/* Startlist Preview */}
      <div ref={printRef} className="space-y-6 print:space-y-8">
        {sortedCategories.length > 0 ? (
          sortedCategories.map((category) => {
            const categoryParticipants = getParticipantsForCategory(category.id);
            if (categoryParticipants.length === 0) return null;

            return (
              <Card key={category.id} className="print:shadow-none print:border-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Badge
                      style={{
                        backgroundColor: category.color || undefined,
                        color: category.color ? "#fff" : undefined,
                      }}
                    >
                      {category.name}
                    </Badge>
                    <span className="text-muted-foreground font-normal">
                      ({categoryParticipants.length} Teilnehmer)
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Startnr.</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-24">Jahrgang</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryParticipants.map((participant) => (
                        <TableRow key={participant.id}>
                          <TableCell className="font-mono font-bold">
                            {participant.start_number || "-"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {participant.participant?.first_name ||
                              participant.guest_first_name}{" "}
                            {participant.participant?.last_name ||
                              participant.guest_last_name}
                          </TableCell>
                          <TableCell>{getBirthYear(participant)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Keine Kategorien vorhanden. Importiere zuerst Teilnehmer.
          </p>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:space-y-8, .print\\:space-y-8 * {
            visibility: visible;
          }
          .print\\:space-y-8 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
