import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUpdateEventParticipant, type EventCategory, type EventParticipant } from "@/hooks/useEvents";

interface CategoryAccordionProps {
  category: EventCategory;
  participants: EventParticipant[];
  eventId: string;
}

export function CategoryAccordion({
  category,
  participants,
  eventId,
}: CategoryAccordionProps) {
  const updateParticipant = useUpdateEventParticipant();

  const activeCount = participants.filter((p) => !p.opted_out).length;
  const totalCount = participants.length;

  const handleToggleOptOut = (participant: EventParticipant) => {
    updateParticipant.mutate({
      id: participant.id,
      event_id: eventId,
      opted_out: !participant.opted_out,
    });
  };

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={category.id} className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Badge
                style={{
                  backgroundColor: category.color || undefined,
                  color: category.color ? "#fff" : undefined,
                }}
              >
                {category.name}
              </Badge>
              {category.start_number_from && category.start_number_to && (
                <span className="text-sm text-muted-foreground">
                  Startnummern {category.start_number_from}-
                  {category.start_number_to}
                </span>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {activeCount}/{totalCount} Teilnehmer
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {participants.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Tage</TableHead>
                  <TableHead>Lehrer</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((p) => (
                  <TableRow
                    key={p.id}
                    className={p.opted_out ? "opacity-50" : ""}
                  >
                    <TableCell className="font-mono">
                      {p.start_number || "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.participant?.first_name || p.guest_first_name}{" "}
                      {p.participant?.last_name || p.guest_last_name}
                    </TableCell>
                    <TableCell>{p.days_attended}/5</TableCell>
                    <TableCell>
                      {p.instructor?.first_name || "-"}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleOptOut(p)}
                        className="text-left"
                      >
                        {p.opted_out ? (
                          <Badge variant="secondary">
                            Abgemeldet{p.opt_out_reason ? `: ${p.opt_out_reason}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="bg-green-600">
                            Nimmt teil
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              Keine Teilnehmer in dieser Kategorie
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
