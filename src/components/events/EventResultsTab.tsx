import { useState } from "react";
import { Printer, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useBulkUpdateResults,
  type Event,
  type EventCategory,
  type EventParticipant,
} from "@/hooks/useEvents";

interface EventResultsTabProps {
  event: Event;
  participants: EventParticipant[];
  categories: EventCategory[];
}

interface ResultEntry {
  id: string;
  start_number: number | null;
  name: string;
  time: string;
  disqualified: boolean;
  rank: number | null;
}

// Parse time string "m:ss.ms" to milliseconds
function parseTime(timeStr: string): number | null {
  if (!timeStr || timeStr.trim() === "") return null;
  const match = timeStr.match(/^(\d+):(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [, min, sec, ms] = match;
  return parseInt(min) * 60000 + parseInt(sec) * 1000 + parseInt(ms) * 10;
}

// Format milliseconds to "m:ss.ms"
function formatTime(ms: number | null): string {
  if (ms === null) return "";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

export function EventResultsTab({
  event,
  participants,
  categories,
}: EventResultsTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [results, setResults] = useState<ResultEntry[]>([]);

  const bulkUpdate = useBulkUpdateResults();

  const sortedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);

    const categoryParticipants = participants
      .filter((p) => p.category_id === categoryId && !p.opted_out)
      .sort((a, b) => (a.start_number || 999) - (b.start_number || 999));

    setResults(
      categoryParticipants.map((p) => ({
        id: p.id,
        start_number: p.start_number,
        name: `${p.participant?.first_name || p.guest_first_name} ${p.participant?.last_name || p.guest_last_name}`,
        time: formatTime(p.finish_time_ms),
        disqualified: p.is_disqualified,
        rank: p.rank_in_category,
      }))
    );
  };

  const handleTimeChange = (id: string, time: string) => {
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, time } : r))
    );
  };

  const handleDisqualifiedChange = (id: string, disqualified: boolean) => {
    setResults((prev) =>
      prev.map((r) => (r.id === id ? { ...r, disqualified } : r))
    );
  };

  const calculateRanks = () => {
    const ranked = [...results]
      .filter((r) => r.time && !r.disqualified)
      .sort((a, b) => {
        const timeA = parseTime(a.time) || Infinity;
        const timeB = parseTime(b.time) || Infinity;
        return timeA - timeB;
      });

    setResults((prev) =>
      prev.map((r) => ({
        ...r,
        rank: r.disqualified
          ? null
          : ranked.findIndex((s) => s.id === r.id) + 1 || null,
      }))
    );
  };

  const handleSave = () => {
    if (!selectedCategory) return;

    const updates = results.map((r) => ({
      id: r.id,
      finish_time_ms: parseTime(r.time),
      rank_in_category: r.rank,
      is_disqualified: r.disqualified,
    }));

    bulkUpdate.mutate({ event_id: event.id, updates });
  };

  const handlePrintResults = () => {
    // TODO: Implement print view
    window.print();
  };

  const handlePrintCertificates = () => {
    // TODO: Implement certificate print view
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-semibold">Ergebnisse erfassen</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrintResults}>
            <Printer className="mr-2 h-4 w-4" />
            Rangliste drucken
          </Button>
          <Button variant="outline" onClick={handlePrintCertificates}>
            <Award className="mr-2 h-4 w-4" />
            Urkunden drucken
          </Button>
        </div>
      </div>

      {/* Category selector */}
      <Select
        value={selectedCategory || undefined}
        onValueChange={handleCategoryChange}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Kategorie wählen..." />
        </SelectTrigger>
        <SelectContent>
          {sortedCategories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Results entry table */}
      {selectedCategory && results.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32">Zeit (m:ss.ms)</TableHead>
                  <TableHead className="w-20">Rang</TableHead>
                  <TableHead className="w-20">DSQ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result) => (
                  <TableRow
                    key={result.id}
                    className={result.disqualified ? "opacity-50" : ""}
                  >
                    <TableCell className="font-mono">
                      {result.start_number || "-"}
                    </TableCell>
                    <TableCell className="font-medium">{result.name}</TableCell>
                    <TableCell>
                      <Input
                        value={result.time}
                        onChange={(e) =>
                          handleTimeChange(result.id, e.target.value)
                        }
                        placeholder="0:45.32"
                        className="font-mono w-28"
                        disabled={result.disqualified}
                      />
                    </TableCell>
                    <TableCell className="font-bold">
                      {result.rank ? `${result.rank}.` : "-"}
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={result.disqualified}
                        onCheckedChange={(checked) =>
                          handleDisqualifiedChange(result.id, checked as boolean)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="justify-end gap-2 pt-4">
            <Button variant="outline" onClick={calculateRanks}>
              Ränge berechnen
            </Button>
            <Button onClick={handleSave} disabled={bulkUpdate.isPending}>
              Speichern
            </Button>
          </CardFooter>
        </Card>
      ) : selectedCategory ? (
        <p className="text-muted-foreground text-center py-8">
          Keine Teilnehmer in dieser Kategorie
        </p>
      ) : (
        <p className="text-muted-foreground text-center py-8">
          Wähle eine Kategorie aus, um Ergebnisse zu erfassen
        </p>
      )}
    </div>
  );
}
