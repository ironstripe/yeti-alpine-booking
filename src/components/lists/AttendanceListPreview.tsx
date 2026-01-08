import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useReactToPrint } from "react-to-print";
import { getLevelLabel } from "@/lib/level-utils";
import type { GroupData } from "@/hooks/useListsData";

interface AttendanceListPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  groups: GroupData[];
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
}

export function AttendanceListPreview({
  open,
  onOpenChange,
  date,
  groups,
  selectedGroupId,
  setSelectedGroupId,
}: AttendanceListPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Anwesenheitsliste-${format(date, "yyyy-MM-dd")}`,
  });

  const dateDisplay = format(date, "EEEE, d. MMMM yyyy", { locale: de });
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Anwesenheitsliste · {format(date, "d. MMMM yyyy", { locale: de })}
          </DialogTitle>
        </DialogHeader>

        {/* Group Selection */}
        <div className="space-y-3 border-b pb-4">
          <p className="text-sm font-medium">Gruppe auswählen:</p>
          <Select
            value={selectedGroupId || ""}
            onValueChange={(val) => setSelectedGroupId(val || null)}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Gruppe auswählen..." />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}: {getLevelLabel(group.level)} ({group.instructorName || "Kein Lehrer"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Preview */}
        <div className="border rounded-lg p-6 bg-white" ref={printRef}>
          <div className="print-content">
            {!selectedGroup ? (
              <p className="text-center text-muted-foreground py-8">
                Bitte wählen Sie eine Gruppe aus
              </p>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h1 className="text-xl font-bold">ANWESENHEITSLISTE</h1>
                  <h2 className="text-lg">
                    {selectedGroup.name}: {getLevelLabel(selectedGroup.level)} ·{" "}
                    {selectedGroup.instructorName || "Kein Lehrer"}
                  </h2>
                  <p className="text-muted-foreground">{dateDisplay}</p>
                </div>

                {selectedGroup.participants.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Keine Teilnehmer in dieser Gruppe
                  </p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2">
                        <th className="text-left py-2 px-2 w-10">Nr</th>
                        <th className="text-left py-2 px-2">Name</th>
                        <th className="text-center py-2 px-2 w-20">VM ☐</th>
                        <th className="text-center py-2 px-2 w-20">MB ☐</th>
                        <th className="text-center py-2 px-2 w-20">NM ☐</th>
                        <th className="text-left py-2 px-2">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.participants.map((participant, index) => (
                        <tr key={participant.id} className="border-b">
                          <td className="py-3 px-2">{index + 1}</td>
                          <td className="py-3 px-2 font-medium">
                            {participant.firstName} {participant.lastName || ""}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="inline-block w-5 h-5 border-2 rounded" />
                          </td>
                          <td className="py-3 px-2 text-center">
                            {participant.hasLunch ? (
                              <span className="inline-block w-5 h-5 border-2 rounded" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="inline-block w-5 h-5 border-2 rounded" />
                          </td>
                          <td className="py-3 px-2">
                            <div className="border-b border-dashed min-w-[100px]">&nbsp;</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="mt-6 text-sm text-muted-foreground">
                  <p>VM = Vormittag · MB = Mittagsbetreuung · NM = Nachmittag</p>
                  <p>— = nicht gebucht</p>
                </div>

                <div className="mt-8 pt-4 border-t">
                  <p className="text-sm">Unterschrift Skilehrer: ________________________________</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => handlePrint()}
            disabled={!selectedGroup}
          >
            <Printer className="h-4 w-4 mr-2" />
            Drucken
          </Button>
          <Button
            variant="outline"
            onClick={() => handlePrint()}
            disabled={!selectedGroup}
          >
            <Download className="h-4 w-4 mr-2" />
            Als PDF speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
