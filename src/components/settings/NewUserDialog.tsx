import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useInviteInstructor } from "@/hooks/useInviteInstructor";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const formSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich"),
  last_name: z.string().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Gültige E-Mail-Adresse erforderlich"),
});

type FormValues = z.infer<typeof formSchema>;

interface NewUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewUserDialog({ open, onOpenChange }: NewUserDialogProps) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inviteInstructor = useInviteInstructor();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { first_name: "", last_name: "", email: "" },
  });

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (values: FormValues) => {
    if (selectedRoles.length === 0) {
      toast.error("Mindestens eine Rolle muss ausgewählt werden");
      return;
    }

    setIsSubmitting(true);
    try {
      // Map UI roles to instructor roles array
      const instructorRoles: string[] = [];
      if (selectedRoles.includes("teacher")) instructorRoles.push("ski");
      if (selectedRoles.includes("office")) instructorRoles.push("office");
      if (selectedRoles.includes("admin")) instructorRoles.push("admin");

      // Create instructor record
      const { data: instructor, error: insertError } = await supabase
        .from("instructors")
        .insert({
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: "",
          hourly_rate: 0,
          roles: instructorRoles,
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(`Benutzer konnte nicht erstellt werden: ${insertError.message}`);
      }

      // Immediately invite
      await inviteInstructor.mutateAsync(instructor.id);

      // Refresh lists
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });

      toast.success("Benutzer erstellt und eingeladen!");
      form.reset();
      setSelectedRoles([]);
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating user:", error);
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = [
    { id: "admin", label: "Admin" },
    { id: "office", label: "Büro" },
    { id: "teacher", label: "Lehrer" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Neuer Benutzer
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">Vorname</Label>
              <Input id="first_name" {...form.register("first_name")} />
              {form.formState.errors.first_name && (
                <p className="text-xs text-destructive">{form.formState.errors.first_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Nachname</Label>
              <Input id="last_name" {...form.register("last_name")} />
              {form.formState.errors.last_name && (
                <p className="text-xs text-destructive">{form.formState.errors.last_name.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Rollen</Label>
            <div className="flex flex-wrap gap-4">
              {roleOptions.map((role) => (
                <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedRoles.includes(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                  />
                  <span className="text-sm">{role.label}</span>
                </label>
              ))}
            </div>
            {selectedRoles.length === 0 && form.formState.isSubmitted && (
              <p className="text-xs text-destructive">Mindestens eine Rolle wählen</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Erstellen & Einladen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
