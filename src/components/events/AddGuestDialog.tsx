import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const guestSchema = z.object({
  source: z.enum(["private_course", "walkin"]),
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

  const createParticipant = useCreateEventParticipant();
  const createCategory = useCreateEventCategory();

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
    },
  });

  const selectedCategoryId = watch("category_id");

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
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
              onClick={() => onOpenChange(false)}
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
