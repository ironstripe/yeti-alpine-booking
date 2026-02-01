import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, X, Check, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useCreateEventParticipant,
  useCreateEventCategory,
  type Event,
  type EventCategory,
} from "@/hooks/useEvents";
import {
  useParticipantSearch,
  getBirthYearFromDate,
  type SearchableParticipant,
} from "@/hooks/useParticipantSearch";

const guestSchema = z.object({
  source: z.enum(["private_course", "walkin"]),
  participant_id: z.string().nullable().optional(),
  guest_first_name: z.string().min(1, "Vorname erforderlich"),
  guest_last_name: z.string().min(1, "Nachname erforderlich"),
  guest_birth_year: z.coerce.number().min(1900).max(new Date().getFullYear()),
  guest_phone: z.string().optional(),
  guest_email: z.string().email().optional().or(z.literal("")),
  category_id: z.string().min(1, "Kategorie erforderlich"),
  payment_status: z.enum(["pending", "paid"]),
});

type GuestFormData = z.infer<typeof guestSchema>;

interface AddGuestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  categories: EventCategory[];
}

export function AddGuestDialog({
  open,
  onOpenChange,
  event,
  categories,
}: AddGuestDialogProps) {
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<SearchableParticipant | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);

  const createParticipant = useCreateEventParticipant();
  const createCategory = useCreateEventCategory();
  const { data: searchResults, isLoading: isSearching } = useParticipantSearch(searchQuery);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<GuestFormData>({
    resolver: zodResolver(guestSchema),
    defaultValues: {
      source: "walkin",
      payment_status: "pending",
      guest_birth_year: 2010,
      participant_id: null,
    },
  });

  const selectedCategoryId = watch("category_id");
  const source = watch("source");

  // Reset participant selection when source changes
  useEffect(() => {
    if (source === "walkin") {
      setSelectedParticipant(null);
      setSearchQuery("");
      setIsManualEntry(false);
      setValue("participant_id", null);
    }
  }, [source, setValue]);

  // Auto-fill form when participant is selected
  const handleSelectParticipant = (participant: SearchableParticipant) => {
    setSelectedParticipant(participant);
    setSearchQuery("");
    setValue("participant_id", participant.id);
    setValue("guest_first_name", participant.first_name);
    setValue("guest_last_name", participant.last_name || "");
    setValue("guest_birth_year", getBirthYearFromDate(participant.birth_date));
    if (participant.customer?.phone) {
      setValue("guest_phone", participant.customer.phone);
    }
    if (participant.customer?.email) {
      setValue("guest_email", participant.customer.email);
    }
  };

  const handleClearParticipant = () => {
    setSelectedParticipant(null);
    setValue("participant_id", null);
    setValue("guest_first_name", "");
    setValue("guest_last_name", "");
    setValue("guest_birth_year", 2010);
    setValue("guest_phone", "");
    setValue("guest_email", "");
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;

    createCategory.mutate(
      {
        event_id: event.id,
        name: newCategoryName.trim(),
        category_type: "guest",
        sort_order: categories.length,
      },
      {
        onSuccess: (data) => {
          setValue("category_id", data.id);
          setNewCategoryName("");
          setIsCreatingCategory(false);
        },
      }
    );
  };

  const onSubmit = (data: GuestFormData) => {
    createParticipant.mutate(
      {
        event_id: event.id,
        category_id: data.category_id,
        source: data.source,
        participant_id: data.participant_id || null,
        guest_first_name: data.guest_first_name,
        guest_last_name: data.guest_last_name,
        guest_birth_year: data.guest_birth_year,
        guest_phone: data.guest_phone || null,
        guest_email: data.guest_email || null,
        payment_status: data.payment_status,
        fee_amount: event.guest_fee,
      },
      {
        onSuccess: () => {
          reset();
          setSelectedParticipant(null);
          setSearchQuery("");
          setIsManualEntry(false);
          onOpenChange(false);
        },
      }
    );
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      reset();
      setSelectedParticipant(null);
      setSearchQuery("");
      setIsManualEntry(false);
    }
    onOpenChange(open);
  };

  const showSearchSection = source === "private_course" && !isManualEntry && !selectedParticipant;
  const showSelectedParticipant = source === "private_course" && selectedParticipant;
  const showManualForm = source === "walkin" || isManualEntry || selectedParticipant;

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gast anmelden</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Source */}
          <div className="space-y-2">
            <Label>Quelle</Label>
            <RadioGroup
              defaultValue="walkin"
              onValueChange={(v) => setValue("source", v as "private_course" | "walkin")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="walkin" id="walkin" />
                <Label htmlFor="walkin" className="font-normal">
                  Walk-in
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private_course" id="private_course" />
                <Label htmlFor="private_course" className="font-normal">
                  Privatkurs-Gast
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Participant Search - Only for private_course */}
          {showSearchSection && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Teilnehmer suchen</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsManualEntry(true)}
                >
                  Manuell eingeben
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name eingeben..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {/* Search Results */}
              {searchQuery.length >= 2 && (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      Suche...
                    </div>
                  ) : searchResults && searchResults.length > 0 ? (
                    <div className="divide-y">
                      {searchResults.map((participant) => (
                        <button
                          key={participant.id}
                          type="button"
                          className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                          onClick={() => handleSelectParticipant(participant)}
                        >
                          <div className="font-medium">
                            {participant.first_name} {participant.last_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Jahrgang {getBirthYearFromDate(participant.birth_date)}
                            {participant.customer?.email && (
                              <> · {participant.customer.email}</>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">
                      Keine Ergebnisse gefunden
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Selected Participant Display */}
          {showSelectedParticipant && (
            <div className="border rounded-md p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-primary/10 rounded-full">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">
                      {selectedParticipant.first_name} {selectedParticipant.last_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Jahrgang {getBirthYearFromDate(selectedParticipant.birth_date)}
                      {selectedParticipant.customer?.email && (
                        <> · {selectedParticipant.customer.email}</>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearParticipant}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Manual Entry Toggle for private_course */}
          {source === "private_course" && isManualEntry && !selectedParticipant && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Manuelle Eingabe
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsManualEntry(false)}
              >
                Zurück zur Suche
              </Button>
            </div>
          )}

          {/* Manual Entry Form - Show for walk-in OR manual entry mode OR when editing selected participant */}
          {showManualForm && (
            <>
              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="guest_first_name">Vorname</Label>
                  <Input id="guest_first_name" {...register("guest_first_name")} />
                  {errors.guest_first_name && (
                    <p className="text-sm text-destructive">
                      {errors.guest_first_name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest_last_name">Nachname</Label>
                  <Input id="guest_last_name" {...register("guest_last_name")} />
                  {errors.guest_last_name && (
                    <p className="text-sm text-destructive">
                      {errors.guest_last_name.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Birth Year */}
              <div className="space-y-2">
                <Label htmlFor="guest_birth_year">Jahrgang</Label>
                <Input
                  id="guest_birth_year"
                  type="number"
                  {...register("guest_birth_year")}
                />
                {errors.guest_birth_year && (
                  <p className="text-sm text-destructive">
                    {errors.guest_birth_year.message}
                  </p>
                )}
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="guest_phone">Telefon</Label>
                  <Input id="guest_phone" {...register("guest_phone")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest_email">E-Mail</Label>
                  <Input id="guest_email" type="email" {...register("guest_email")} />
                </div>
              </div>
            </>
          )}

          {/* Category */}
          <div className="space-y-2">
            <Label>Kategorie</Label>
            {isCreatingCategory ? (
              <div className="flex gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Kategoriename"
                />
                <Button type="button" onClick={handleCreateCategory} size="sm">
                  Erstellen
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreatingCategory(false)}
                >
                  Abbrechen
                </Button>
              </div>
            ) : (
              <Select
                value={selectedCategoryId}
                onValueChange={(v) => {
                  if (v === "new") {
                    setIsCreatingCategory(true);
                  } else {
                    setValue("category_id", v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">+ Neue Kategorie erstellen</SelectItem>
                </SelectContent>
              </Select>
            )}
            {errors.category_id && (
              <p className="text-sm text-destructive">
                {errors.category_id.message}
              </p>
            )}
          </div>

          {/* Payment Status */}
          <div className="space-y-2">
            <Label>Bezahlung (CHF {event.guest_fee})</Label>
            <RadioGroup
              defaultValue="pending"
              onValueChange={(v) => setValue("payment_status", v as "pending" | "paid")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pending" id="pending" />
                <Label htmlFor="pending" className="font-normal">
                  Noch offen
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="paid" id="paid" />
                <Label htmlFor="paid" className="font-normal">
                  Bereits bezahlt
                </Label>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogClose(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={createParticipant.isPending}>
              Anmelden
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
