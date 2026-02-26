import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus, ShoppingCart, MapPin, Clock, Users } from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { de } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { MEETING_POINTS } from "@/lib/meeting-point-utils";
import { LEVEL_OPTIONS } from "@/lib/level-utils";
import type { Tables } from "@/integrations/supabase/types";

export interface SlotBookingData {
  instructorId: string;
  instructorName: string;
  date: string;
  startTime: string;
  endTime: string;
  participantIds: string[];
  duration: number;
  meetingPoint: string;
  sport: "ski" | "snowboard" | null;
}

interface SlotBookingPopoverProps {
  open: boolean;
  onClose: () => void;
  instructorId: string;
  instructorName: string;
  date: string;
  startTime: string;
  endTime: string;
  preselectedCustomerId: string | null;
  sport: "ski" | "snowboard" | null;
  defaultMeetingPoint: string;
  onAddToCart: (data: SlotBookingData) => void;
}

interface NewParticipantForm {
  first_name: string;
  last_name: string;
  birth_date: string;
  skill_level: string;
}

export function SlotBookingPopover({
  open,
  onClose,
  instructorId,
  instructorName,
  date,
  startTime,
  endTime,
  preselectedCustomerId,
  sport,
  defaultMeetingPoint,
  onAddToCart,
}: SlotBookingPopoverProps) {
  const queryClient = useQueryClient();
  const { state, addLocalParticipant } = useBookingWizard();
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [duration, setDuration] = useState<number>(() => {
    const s = parseInt(startTime.split(":")[0]);
    const e = parseInt(endTime.split(":")[0]);
    return e - s;
  });
  const [meetingPoint, setMeetingPoint] = useState(defaultMeetingPoint);
  const [showNewParticipant, setShowNewParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState<NewParticipantForm>({
    first_name: "",
    last_name: "",
    birth_date: "",
    skill_level: "",
  });

  // Calculate actual end time from duration
  const actualEndTime = useMemo(() => {
    const s = parseInt(startTime.split(":")[0]);
    const end = Math.min(s + duration, 16);
    return `${end.toString().padStart(2, "0")}:00`;
  }, [startTime, duration]);

  // Fetch DB participants for pre-selected customer
  const { data: dbParticipants = [] } = useQuery({
    queryKey: ["customer-participants", preselectedCustomerId],
    queryFn: async () => {
      if (!preselectedCustomerId) return [];
      const { data, error } = await supabase
        .from("customer_participants")
        .select("*")
        .eq("customer_id", preselectedCustomerId)
        .order("first_name");
      if (error) throw error;
      return data as Tables<"customer_participants">[];
    },
    enabled: !!preselectedCustomerId,
  });

  // Create DB participant mutation (only when customer is pre-selected)
  const createParticipantMutation = useMutation({
    mutationFn: async (form: NewParticipantForm) => {
      if (!preselectedCustomerId) throw new Error("Kein Kunde ausgewählt");
      const { data, error } = await supabase
        .from("customer_participants")
        .insert({
          customer_id: preselectedCustomerId,
          first_name: form.first_name,
          last_name: form.last_name || null,
          birth_date: form.birth_date || "2015-01-01",
          level_current_season: form.skill_level || null,
          sport: sport || "ski",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (newP) => {
      queryClient.invalidateQueries({ queryKey: ["customer-participants", preselectedCustomerId] });
      setSelectedParticipantIds((prev) => [...prev, newP.id]);
      resetNewParticipantForm();
    },
  });

  const resetNewParticipantForm = () => {
    setShowNewParticipant(false);
    setNewParticipant({ first_name: "", last_name: "", birth_date: "", skill_level: "" });
  };

  // Create local participant (no DB write)
  const handleCreateLocalParticipant = () => {
    const localP = {
      first_name: newParticipant.first_name,
      last_name: newParticipant.last_name || null,
      birth_date: newParticipant.birth_date || "2015-01-01",
      skill_level: newParticipant.skill_level || null,
      sport: (sport || "ski") as "ski" | "snowboard",
    };
    addLocalParticipant(localP);
    // The ID is generated inside addLocalParticipant, so we need to find it after state update
    // We'll use a slight workaround: generate the ID here to pre-select it
    // Actually, since addLocalParticipant uses crypto.randomUUID(), we can't predict it.
    // Instead, we just reset the form. The user will see the new participant in the list and select it.
    resetNewParticipantForm();
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleAddToCart = () => {
    onAddToCart({
      instructorId,
      instructorName,
      date,
      startTime,
      endTime: actualEndTime,
      participantIds: selectedParticipantIds,
      duration,
      meetingPoint,
      sport,
    });
    setSelectedParticipantIds([]);
    onClose();
  };

  const canAdd = selectedParticipantIds.length > 0;

  // Combine local participants + DB participants for display
  const localParticipants = state.localParticipants;
  const allParticipants = [
    ...localParticipants.map((lp) => ({
      id: lp.id,
      first_name: lp.first_name,
      last_name: lp.last_name,
      birth_date: lp.birth_date,
      level_current_season: lp.skill_level,
      isLocal: true,
    })),
    ...dbParticipants.map((dp) => ({
      id: dp.id,
      first_name: dp.first_name,
      last_name: dp.last_name,
      birth_date: dp.birth_date,
      level_current_season: dp.level_current_season,
      isLocal: false,
    })),
  ];

  const hasCustomer = !!preselectedCustomerId;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Slot konfigurieren</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Slot Info */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {startTime} – {actualEndTime}
            </Badge>
            <Badge variant="outline">{instructorName}</Badge>
            <Badge variant="secondary">
              {format(new Date(date), "EEE d. MMM", { locale: de })}
            </Badge>
          </div>

          <Separator />

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Dauer
            </Label>
            <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((h) => {
                  const s = parseInt(startTime.split(":")[0]);
                  if (s + h > 16) return null;
                  return (
                    <SelectItem key={h} value={h.toString()}>
                      {h}h ({startTime} – {`${(s + h).toString().padStart(2, "0")}:00`})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Meeting Point */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Treffpunkt
            </Label>
            <Select value={meetingPoint} onValueChange={setMeetingPoint}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEETING_POINTS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Participants */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Users className="h-3 w-3" />
              Teilnehmer
            </Label>

            {allParticipants.length === 0 && !showNewParticipant ? (
              <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3 text-center">
                Noch keine Teilnehmer.
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowNewParticipant(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Neuen Teilnehmer erstellen
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {allParticipants.map((p) => {
                  const isSelected = selectedParticipantIds.includes(p.id);
                  const age = p.birth_date
                    ? differenceInYears(new Date(), new Date(p.birth_date))
                    : null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleParticipant(p.id)}
                      className={`w-full flex items-center gap-2 rounded-md border p-2 text-left text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">
                          {p.first_name} {p.last_name || ""}
                        </span>
                        {age !== null && (
                          <span className="text-muted-foreground ml-1">({age}J)</span>
                        )}
                      </div>
                      {p.isLocal && (
                        <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                          Lokal
                        </Badge>
                      )}
                      {p.level_current_season && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          {p.level_current_season}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* New participant form */}
            {showNewParticipant ? (
              <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                <p className="text-xs font-semibold">Neuer Teilnehmer</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Vorname *"
                    value={newParticipant.first_name}
                    onChange={(e) =>
                      setNewParticipant((p) => ({ ...p, first_name: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Nachname"
                    value={newParticipant.last_name}
                    onChange={(e) =>
                      setNewParticipant((p) => ({ ...p, last_name: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <Input
                  type="date"
                  placeholder="Geburtsdatum"
                  value={newParticipant.birth_date}
                  onChange={(e) =>
                    setNewParticipant((p) => ({ ...p, birth_date: e.target.value }))
                  }
                  className="h-8 text-sm"
                />
                <Select
                  value={newParticipant.skill_level}
                  onValueChange={(v) => setNewParticipant((p) => ({ ...p, skill_level: v }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Niveau wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!newParticipant.first_name || (hasCustomer && createParticipantMutation.isPending)}
                    onClick={() => {
                      if (hasCustomer) {
                        createParticipantMutation.mutate(newParticipant);
                      } else {
                        handleCreateLocalParticipant();
                      }
                    }}
                  >
                    {hasCustomer && createParticipantMutation.isPending ? "Speichern..." : "Erstellen"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowNewParticipant(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => setShowNewParticipant(true)}
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Neuen Teilnehmer erstellen
              </Button>
            )}
          </div>

          <Separator />

          {/* Add to cart */}
          <Button
            className="w-full"
            disabled={!canAdd}
            onClick={handleAddToCart}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            In den Warenkorb
            {selectedParticipantIds.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary-foreground/20">
                {selectedParticipantIds.length} TN
              </Badge>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
