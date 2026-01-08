import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useReactToPrint } from "react-to-print";
import type { LunchChild } from "@/hooks/useListsData";

interface LunchListPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  children: LunchChild[];
  showAllergies: boolean;
  setShowAllergies: (show: boolean) => void;
  showEmergencyContact: boolean;
  setShowEmergencyContact: (show: boolean) => void;
  showGroup: boolean;
  setShowGroup: (show: boolean) => void;
}

export function LunchListPreview({
  open,
  onOpenChange,
  date,
  children,
  showAllergies,
  setShowAllergies,
  showEmergencyContact,
  setShowEmergencyContact,
  showGroup,
  setShowGroup,
}: LunchListPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Mittagsliste-${format(date, "yyyy-MM-dd")}`,
  });

  const dateDisplay = format(date, "EEEE, d. MMMM yyyy", { locale: de });
  const childrenWithAllergies = children.filter((c) => c.allergies && c.allergies.trim() !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mittagsliste · {format(date, "d. MMMM yyyy", { locale: de })}</DialogTitle>
        </DialogHeader>

        {/* Options */}
        <div className="space-y-3 border-b pb-4">
          <p className="text-sm font-medium">Optionen:</p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="showAllergies"
                checked={showAllergies}
                onCheckedChange={(checked) => setShowAllergies(checked === true)}
              />
              <Label htmlFor="showAllergies" className="text-sm">
                Allergien/Unverträglichkeiten anzeigen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showEmergency"
                checked={showEmergencyContact}
                onCheckedChange={(checked) => setShowEmergencyContact(checked === true)}
              />
              <Label htmlFor="showEmergency" className="text-sm">
                Notfallkontakt anzeigen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showGroup"
                checked={showGroup}
                onCheckedChange={(checked) => setShowGroup(checked === true)}
              />
              <Label htmlFor="showGroup" className="text-sm">
                Gruppenzuordnung anzeigen
              </Label>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="border rounded-lg p-6 bg-white" ref={printRef}>
          <div className="print-content">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold">SCHNEESPORTSCHULE MALBUN</h1>
              <h2 className="text-lg font-semibold">MITTAGSLISTE</h2>
              <p className="text-muted-foreground">{dateDisplay}</p>
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2">
                  <th className="text-left py-2 px-2 w-10">Nr</th>
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-center py-2 px-2 w-16">Alter</th>
                  {showAllergies && <th className="text-left py-2 px-2">Allergien</th>}
                  {showEmergencyContact && <th className="text-left py-2 px-2">Notfall</th>}
                  {showGroup && <th className="text-left py-2 px-2">Gruppe</th>}
                </tr>
              </thead>
              <tbody>
                {children.map((child, index) => (
                  <tr key={child.id} className="border-b">
                    <td className="py-2 px-2">{index + 1}</td>
                    <td className="py-2 px-2 font-medium">
                      {child.firstName} {child.lastName || ""}
                    </td>
                    <td className="py-2 px-2 text-center">{child.age}</td>
                    {showAllergies && (
                      <td className="py-2 px-2">
                        {child.allergies ? (
                          <span className="text-destructive font-medium">{child.allergies}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {showEmergencyContact && (
                      <td className="py-2 px-2 font-mono text-xs">
                        {child.emergencyContact || "—"}
                      </td>
                    )}
                    {showGroup && (
                      <td className="py-2 px-2">{child.groupName || "—"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 pt-4 border-t text-sm text-muted-foreground">
              <p>Total: {children.length} Kinder</p>
              {showAllergies && childrenWithAllergies.length > 0 && (
                <p>Allergien: {childrenWithAllergies.length} Kinder (siehe Markierung)</p>
              )}
              <p className="mt-2">
                Erstellt: {format(new Date(), "dd.MM.yyyy, HH:mm", { locale: de })} Uhr
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            Drucken
          </Button>
          <Button variant="outline" onClick={() => handlePrint()}>
            <Download className="h-4 w-4 mr-2" />
            Als PDF speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
