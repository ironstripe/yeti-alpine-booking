import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X, Search } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInventoryItems } from "@/hooks/useInventory";
import { useCreateRental } from "@/hooks/useRentals";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedInstructorId?: string;
}

export function NewRentalDialog({ open, onOpenChange, preselectedInstructorId }: Props) {
  const { user } = useAuth();
  const { data: instructors } = useQuery({
    queryKey: ["instructors-list-rentals"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("instructors").select("id, first_name, last_name") as any).eq("is_active", true).order("last_name");
      if (error) throw error;
      return data as { id: string; first_name: string; last_name: string }[];
    },
  });
  const { data: items } = useInventoryItems();
  const createRental = useCreateRental();

  const [instructorId, setInstructorId] = useState(preselectedInstructorId || "");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const availableItems = items?.filter((i) => i.status === "Verfügbar") || [];
  const filteredItems = availableItems.filter(
    (i) => !selectedItemIds.includes(i.id) && (
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.inventory_number?.toLowerCase().includes(search.toLowerCase()) ||
      (i.category as any)?.name?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const handleSubmit = () => {
    if (!instructorId || !startDate || selectedItemIds.length === 0 || !user) return;
    createRental.mutate({
      instructor_id: instructorId,
      office_user_id: user.id,
      rental_period_start: format(startDate, "yyyy-MM-dd"),
      rental_period_end: endDate ? format(endDate, "yyyy-MM-dd") : null,
      item_ids: selectedItemIds,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setInstructorId(preselectedInstructorId || ""); setSelectedItemIds([]); setSearch(""); setStartDate(new Date()); setEndDate(undefined);
      },
    });
  };

  const selectedItems = items?.filter((i) => selectedItemIds.includes(i.id)) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Ausleihe</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Lehrer *</label>
            <Select value={instructorId} onValueChange={setInstructorId} disabled={!!preselectedInstructorId}>
              <SelectTrigger><SelectValue placeholder="Lehrer auswählen..." /></SelectTrigger>
              <SelectContent>
                {instructors?.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.first_name} {inst.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Startdatum *</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd.MM.yyyy", { locale: de }) : "Wählen..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium">Enddatum</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd.MM.yyyy", { locale: de }) : "Optional"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Artikel hinzufügen</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Artikel suchen..."
                className="pl-9"
              />
            </div>
            {search && filteredItems.length > 0 && (
              <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                {filteredItems.slice(0, 10).map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between items-center"
                    onClick={() => { setSelectedItemIds((prev) => [...prev, item.id]); setSearch(""); }}
                  >
                    <span>{item.name} {item.size && `(${item.size})`}</span>
                    <span className="text-muted-foreground text-xs">{item.inventory_number || (item.category as any)?.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Ausgewählte Artikel ({selectedItems.length})</label>
              {selectedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                  <span className="text-sm">
                    {item.name} {item.size && <Badge variant="outline" className="ml-1 text-xs">{item.size}</Badge>}
                  </span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedItemIds((prev) => prev.filter((id) => id !== item.id))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={handleSubmit}
            disabled={!instructorId || !startDate || selectedItemIds.length === 0 || createRental.isPending}
          >
            Zur Quittierung senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
