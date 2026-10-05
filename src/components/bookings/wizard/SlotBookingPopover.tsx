import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, ShoppingCart, MapPin, Clock, Users } from "lucide-react";
import { format, differenceInYears, parseISO } from "date-fns";
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { MEETING_POINTS } from "@/lib/meeting-point-utils";
import { getLevelOptionsForAge, getLevelLabel } from "@/lib/level-utils";
import type { Tables } from "@/integrations/supabase/types";

export interface SlotBookingData {
  /** null = "Später zuweisen" (assignLater); never a placeholder instructor */
  instructorId: string | null;
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
  /** null when the lesson is booked with "Später zuweisen" */
  instructorId: string | null;
  instructorName: string | null;
  date: string;
  /** All selected lesson dates (display only); defaults to [date] */
  allDates?: string[];
  /**
   * Exact intervals chosen in the teacher list. When set, every interval is shown
   * read-only and the duration control is hidden: this dialog then only links
   * participants and the meeting point, it never changes the planned times.
   */
  plannedIntervals?: { date: string; startTime: string; endTime: string }[];
  startTime: string;
  endTime: string;
  preselectedCustomerId: string | null;
  sport: "ski" | "snowboard" | null;
  defaultMeetingPoint: string;
  onAddToCart: (data: SlotBookingData) => void;
  /** Participants already linked to the active item (pre-checked on reopen). */
  initialParticipantIds?: string[];
  /** Scoped title override; other usages keep "Slot konfigurieren". */
  title?: string;
  /**
   * Participant-entry mode (wizard step 1): primary action reads "Teilnehmer übernehmen",
   * an explicit "Abbrechen" exists, and closing with unapplied changes asks
   * Übernehmen / Verwerfen / Weiter bearbeiten. Other callers keep their behaviour.
   */
  participantEntry?: boolean;
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
  allDates,
  plannedIntervals,
  startTime,
  endTime,
  preselectedCustomerId,
  sport,
  defaultMeetingPoint,
  onAddToCart,
  initialParticipantIds,
  title,
  participantEntry = false,
}: SlotBookingPopoverProps) {
  const queryClient = useQueryClient();
  const { state, addLocalParticipant, removeLocalParticipant, setSelectedParticipants } = useBookingWizard();
  // Locals created in THIS dialog session; removed again when the session is discarded.
  const [createdLocalIds, setCreatedLocalIds] = useState<string[]>([]);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>(() => initialParticipantIds ?? []);
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

  const lockedDuration = useMemo(() => {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return (eh * 60 + (em || 0) - (sh * 60 + (sm || 0))) / 60;
  }, [startTime, endTime]);

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
        .is("merged_into_id", null) // merged duplicates stay out of pickers
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
          birth_date: form.birth_date || null,
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
    const id = `local-${crypto.randomUUID()}`;
    addLocalParticipant({
      id,
      first_name: newParticipant.first_name,
      last_name: newParticipant.last_name || null,
      birth_date: newParticipant.birth_date || null,
      skill_level: newParticipant.skill_level || null,
      sport: (sport || "ski") as "ski" | "snowboard",
    });
    setSelectedParticipantIds((prev) => [...prev, id]);
    // Discard/orphan tracking only for the participant-entry dialog; other callers keep prior behaviour.
    if (participantEntry) setCreatedLocalIds((prev) => [...prev, id]);
    resetNewParticipantForm();
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleAddToCart = () => {
    const selectedExistingParticipants = dbParticipants.filter((participant) =>
      selectedParticipantIds.includes(participant.id)
    );
    if (selectedExistingParticipants.length > 0) {
      const existingIds = new Set(state.selectedParticipants.map((participant) => participant.id));
      setSelectedParticipants([
        ...state.selectedParticipants,
        ...selectedExistingParticipants.filter((participant) => !existingIds.has(participant.id)),
      ]);
    }

    onAddToCart({
      instructorId,
      instructorName: instructorName ?? "",
      date,
      startTime,
      // Planned (list) mode keeps the exact passed interval; no duration edits.
      endTime: plannedIntervals ? endTime : actualEndTime,
      participantIds: selectedParticipantIds,
      duration: plannedIntervals ? lockedDuration : duration,
      meetingPoint,
      sport,
    });
    // Locals created but NOT selected are not kept in the pool (no orphan persisted later).
    if (participantEntry) {
      for (const id of createdLocalIds) if (!selectedParticipantIds.includes(id)) removeLocalParticipant(id);
      setCreatedLocalIds([]);
    }
    setSelectedParticipantIds([]);
    onClose();
  };

  const canAdd = selectedParticipantIds.length > 0;

  const initialKey = [...(initialParticipantIds ?? [])].sort().join(",");
  const isDirty =
    [...selectedParticipantIds].sort().join(",") !== initialKey ||
    createdLocalIds.length > 0 ||
    meetingPoint !== defaultMeetingPoint ||
    showNewParticipant;

  const discardAndClose = () => {
    for (const id of createdLocalIds) removeLocalParticipant(id);
    setCreatedLocalIds([]);
    setConfirmCloseOpen(false);
    onClose();
  };

  const requestClose = () => {
    if (participantEntry && isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose();
  };

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
    <Sheet open={open} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{title ?? "Slot konfigurieren"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Slot Info */}
          {plannedIntervals ? (
            <div className="space-y-2" data-testid="planned-intervals">
              <Badge variant="outline">{instructorId ? instructorName : "Lehrperson später zuweisen"}</Badge>
              <ul className="divide-y rounded-md border text-sm">
                {plannedIntervals.map((iv) => (
                  <li key={`${iv.date}-${iv.startTime}`} className="flex items-center gap-2 px-3 py-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{format(parseISO(iv.date), "EEE d. MMM", { locale: de })}</span>
                    <span className="text-muted-foreground">{iv.startTime} – {iv.endTime}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {startTime} – {actualEndTime}
            </Badge>
            <Badge variant="outline">{instructorId ? instructorName : "Lehrperson später zuweisen"}</Badge>
            {(allDates && allDates.length > 1 ? [...allDates].sort() : [date]).map((d) => (
              <Badge key={d} variant="secondary">
                {format(new Date(d), "EEE d. MMM", { locale: de })}
              </Badge>
            ))}
          </div>
          )}

          <Separator />

          {/* Duration (hidden in planned mode: times come from the plan) */}
          {!plannedIntervals && (
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
          )}

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
            <Label className="flex items-center gap-1 text-sm font-semibold text-foreground">
              <Users className="h-3 w-3" />
              Wer nimmt am Unterricht teil?
            </Label>
            {!hasCustomer && (
              <p className="text-sm text-muted-foreground">
                Erfasse hier die Personen, die Unterricht erhalten. Den zahlungspflichtigen Kunden wählst du im nächsten Schritt. Bereits erfasste Teilnehmer werden nach der Kundenauswahl verfügbar.
              </p>
            )}

            {allParticipants.length === 0 && !showNewParticipant ? (
              <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3 text-center">
                Noch keine Teilnehmer ausgewählt.
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
                          Neu erfasst
                        </Badge>
                      )}
                      {p.level_current_season && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          {getLevelLabel(p.level_current_season)}
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
                    {getLevelOptionsForAge(newParticipant.birth_date || null, sport || "ski").map((l) => (
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
                    disabled={!newParticipant.first_name || createParticipantMutation.isPending}
                    onClick={() => {
                      if (hasCustomer && !state.customer) {
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

          {/* Add to cart / apply participants */}
          {participantEntry && !canAdd && (
            <p className="text-xs text-muted-foreground" role="status">
              Mindestens einen Teilnehmer auswählen oder erstellen.
            </p>
          )}
          <Button
            className="w-full"
            disabled={!canAdd}
            onClick={handleAddToCart}
          >
            {participantEntry ? <Users className="h-4 w-4 mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            {participantEntry ? "Teilnehmer übernehmen" : "In den Warenkorb"}
            {selectedParticipantIds.length > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary-foreground/20">
                {selectedParticipantIds.length} TN
              </Badge>
            )}
          </Button>
          {participantEntry && (
            <Button variant="outline" className="w-full" onClick={requestClose}>
              Abbrechen
            </Button>
          )}
        </div>
      </SheetContent>

      {participantEntry && (
        <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Änderungen übernehmen?</AlertDialogTitle>
              <AlertDialogDescription>
                Die Teilnehmerauswahl ist noch nicht übernommen. Ohne Übernehmen wird sie nicht für diesen Unterricht gezählt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setConfirmCloseOpen(false)}>
                Weiter bearbeiten
              </Button>
              <Button variant="outline" onClick={discardAndClose}>
                Verwerfen
              </Button>
              <Button
                disabled={!canAdd || showNewParticipant}
                onClick={() => {
                  setConfirmCloseOpen(false);
                  handleAddToCart();
                }}
              >
                Übernehmen
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Sheet>
  );
}
