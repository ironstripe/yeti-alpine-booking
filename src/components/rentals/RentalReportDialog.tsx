import { useRef, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReactToPrint } from "react-to-print";
import { useRentals, RentalWithDetails, RentalItemWithDetails } from "@/hooks/useRentals";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Printer } from "lucide-react";

interface RentalReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface GroupedItem {
  item: RentalItemWithDetails;
  rentalStart: string;
}

export function RentalReportDialog({ open, onOpenChange }: RentalReportDialogProps) {
  const { data: rentals } = useRentals();
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedInstructor, setSelectedInstructor] = useState<string>("all");

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Ausleihformular",
  });

  // Filter to only active rentals with status "Ausgeliehen"
  const activeRentals = useMemo(() => {
    if (!rentals) return [];
    return rentals.filter((r) => r.status === "Ausgeliehen");
  }, [rentals]);

  // Get unique instructors with active rentals
  const instructors = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    activeRentals.forEach((r) => {
      if (r.instructor && !map.has(r.instructor_id)) {
        map.set(r.instructor_id, {
          id: r.instructor_id,
          name: `${r.instructor.last_name} ${r.instructor.first_name}`,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeRentals]);

  // Group items by instructor then by category
  const reportData = useMemo(() => {
    const filteredRentals =
      selectedInstructor === "all"
        ? activeRentals
        : activeRentals.filter((r) => r.instructor_id === selectedInstructor);

    const byInstructor = new Map<
      string,
      { name: string; categories: Map<string, GroupedItem[]> }
    >();

    filteredRentals.forEach((rental) => {
      const instrId = rental.instructor_id;
      const instrName = rental.instructor
        ? `${rental.instructor.last_name} ${rental.instructor.first_name}`
        : "Unbekannt";

      if (!byInstructor.has(instrId)) {
        byInstructor.set(instrId, { name: instrName, categories: new Map() });
      }
      const instrData = byInstructor.get(instrId)!;

      rental.items?.forEach((item) => {
        if (item.status !== "Ausgeliehen") return;
        const category = item.item?.category?.name || "Sonstiges";
        if (!instrData.categories.has(category)) {
          instrData.categories.set(category, []);
        }
        instrData.categories.get(category)!.push({
          item,
          rentalStart: rental.rental_period_start,
        });
      });
    });

    return Array.from(byInstructor.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeRentals, selectedInstructor]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ausleihformular drucken</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Lehrer</label>
            <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Lehrer</SelectItem>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => handlePrint()}
            disabled={reportData.length === 0}
            className="w-full"
          >
            <Printer className="h-4 w-4 mr-2" />
            Report erstellen & Drucken
          </Button>

          {reportData.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Keine ausgeliehenen Artikel gefunden.
            </p>
          )}
        </div>

        {/* Hidden print area */}
        <div className="hidden">
          <div ref={printRef}>
            <style>{`
              @media print {
                body * { visibility: hidden; }
                .print-area, .print-area * { visibility: visible; }
                .print-area { position: absolute; left: 0; top: 0; width: 100%; }
              }
              .report-section { page-break-after: always; }
              .report-section:last-child { page-break-after: auto; }
              .report-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
              .report-table th, .report-table td { border: 1px solid #333; padding: 4px 6px; text-align: left; }
              .report-table th { background: #f0f0f0; font-weight: 600; }
              .report-header { font-size: 18px; font-weight: bold; margin-bottom: 4px; }
              .report-subheader { font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
              .report-title { font-size: 14px; text-align: center; margin-bottom: 16px; font-weight: bold; text-transform: uppercase; }
            `}</style>
            <div className="print-area">
              {reportData.map((instructor, idx) => (
                <div key={instructor.id} className="report-section" style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
                  <div className="report-title">Ausleihformular Schneesportlehrer</div>
                  <div className="report-header">
                    {instructor.name}
                  </div>
                  <div style={{ fontSize: "11px", marginBottom: "16px", color: "#666" }}>
                    Stand: {format(new Date(), "dd.MM.yyyy", { locale: de })}
                  </div>

                  {Array.from(instructor.categories.entries()).map(([category, items]) => (
                    <div key={category}>
                      <div className="report-subheader">{category}</div>
                      <table className="report-table">
                        <thead>
                          <tr>
                            <th style={{ width: "20%" }}>Artikel</th>
                            <th style={{ width: "12%" }}>Nr. / Detail</th>
                            <th style={{ width: "12%" }}>Grösse / Farbe</th>
                            <th style={{ width: "6%" }}>Anzahl</th>
                            <th style={{ width: "12%" }}>Datum Ausleihe</th>
                            <th style={{ width: "10%" }}>Visum</th>
                            <th style={{ width: "12%" }}>Datum Rückgabe</th>
                            <th style={{ width: "10%" }}>Visum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((gi, i) => (
                            <tr key={i}>
                              <td>{gi.item.item?.name || "–"}</td>
                              <td>{gi.item.item?.inventory_number || "–"}</td>
                              <td>
                                {[gi.item.item?.size, gi.item.item?.color]
                                  .filter(Boolean)
                                  .join(" / ") || "–"}
                              </td>
                              <td>1</td>
                              <td>
                                {format(new Date(gi.rentalStart), "dd.MM.yyyy", { locale: de })}
                              </td>
                              <td></td>
                              <td></td>
                              <td></td>
                            </tr>
                          ))}
                          {/* Empty rows for manual entries */}
                          {[...Array(3)].map((_, i) => (
                            <tr key={`empty-${i}`}>
                              <td>&nbsp;</td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
