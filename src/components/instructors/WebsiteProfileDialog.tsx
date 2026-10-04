import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { publicInstructorTitle } from "../../../supabase/functions/_shared/publicInstructorTitle";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { WEBSITE_TEASER_MAX } from "@/lib/website-profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WebsiteProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Tables<"instructors">;
}

type PrivatePhoto = { id: string; url: string };

export function WebsiteProfileDialog({ open, onOpenChange, instructor }: WebsiteProfileDialogProps) {
  const queryClient = useQueryClient();
  const [teaser, setTeaser] = useState("");
  const [websiteTitle, setWebsiteTitle] = useState("");
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [photoChoice, setPhotoChoice] = useState<"public" | "private">("private");
  const [privatePhoto, setPrivatePhoto] = useState<PrivatePhoto | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"publish" | "hide" | null>(null);
  const [saving, setSaving] = useState(false);
  const isPublic = instructor.show_on_website && instructor.status === "active" &&
    !!instructor.avatar_url && !!instructor.website_teaser?.trim();

  useEffect(() => {
    if (!open) return;
    let active = true;
    setTeaser(instructor.website_teaser ?? "");
    setWebsiteTitle("");
    setTitleError(false);
    setLoadingTitle(true);
    void Promise.resolve(supabase.from("instructors").select("website_role_title").eq("id", instructor.id).maybeSingle())
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) { setTitleError(true); return; }
        setWebsiteTitle(data.website_role_title ?? "");
      })
      .catch(() => { if (active) setTitleError(true); })
      .finally(() => { if (active) setLoadingTitle(false); });
    setPhotoChoice(instructor.avatar_url ? "public" : "private");
    setPrivatePhoto(null);
    setLoadingPhoto(true);
    void supabase.functions.invoke("instructor-photo-url", { body: { instructor_id: instructor.id } })
      .then(({ data, error }) => {
        if (active && !error && data?.private && data.photo_id && data.url) {
          setPrivatePhoto({ id: data.photo_id, url: data.url });
        }
      })
      .catch((error) => console.error("Private portrait unavailable:", error))
      .finally(() => { if (active) setLoadingPhoto(false); });
    return () => { active = false; };
  }, [open, instructor.id, instructor.avatar_url, instructor.website_teaser]);

  const trimmedTeaser = teaser.trim();
  const trimmedTitle = websiteTitle.trim();
  const automaticTitle = publicInstructorTitle({
    specialization: instructor.specialization,
    roles: instructor.roles,
    gender: instructor.gender,
    website_role_title: null,
  });
  const effectiveTitle = trimmedTitle || automaticTitle;
  const chosenPhotoUrl = photoChoice === "private" ? privatePhoto?.url : instructor.avatar_url;
  const canPublish = instructor.status === "active" && !loadingPhoto && !loadingTitle && !titleError &&
    trimmedTitle.length <= 80 && !!chosenPhotoUrl && trimmedTeaser.length > 0 && trimmedTeaser.length <= WEBSITE_TEASER_MAX;

  const handleConfirm = async () => {
    if (!confirmAction || saving || (confirmAction === "publish" && !canPublish)) return;
    setSaving(true);
    try {
      const publishing = confirmAction === "publish";
      const { data, error } = await supabase.functions.invoke("instructor-website-publish", {
        body: {
          instructor_id: instructor.id,
          show_on_website: publishing,
          website_teaser: trimmedTeaser,
          ...(publishing ? { website_role_title: trimmedTitle || null } : {}),
          ...(publishing && photoChoice === "private" && privatePhoto
            ? { source_photo_id: privatePhoto.id } : {}),
        },
      });
      if (error || !data?.ok) throw error ?? new Error(data?.error || "website_publish_failed");
      await queryClient.invalidateQueries({ queryKey: ["instructor", instructor.id] });
      await queryClient.invalidateQueries({ queryKey: ["instructors"] });
      toast.success(publishing ? "Websiteprofil veröffentlicht" : "Websiteprofil ausgeblendet");
      setConfirmAction(null);
      onOpenChange(false);
    } catch (error) {
      console.error("Website profile release failed:", error);
      toast.error("Websiteprofil konnte nicht geändert werden. Bitte erneut prüfen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
        <SheetContent
          side="right"
          overlayClassName="bg-foreground/35"
          closeButtonClassName="icon-action"
          closeLabel="Websiteprofil schliessen"
          className="flex h-full w-full flex-col gap-0 p-0 sm:w-[520px] sm:max-w-[520px]"
        >
          <SheetHeader className="shrink-0 border-b py-5 pl-5 pr-16 sm:pl-6">
            <SheetTitle className="flex items-center gap-2 break-words"><Globe className="h-4 w-4 shrink-0" />Websiteprofil</SheetTitle>
            <SheetDescription>
              {isPublic ? "Derzeit öffentlich sichtbar." : "Derzeit nur intern sichtbar."}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="space-y-2">
              <Label htmlFor="website-role-title">Titel auf der Website</Label>
              <Input id="website-role-title" maxLength={80} value={websiteTitle}
                onChange={(event) => setWebsiteTitle(event.target.value)} disabled={loadingTitle || titleError || saving}
                placeholder="Automatisch aus Unterrichtsart und Geschlecht" />
              <p className="text-xs text-muted-foreground">Leer lassen für «{automaticTitle}». Nur die Website-Anzeige wird geändert.</p>
              {titleError && <p className="text-xs text-destructive">Titel konnte nicht geladen werden. Bitte Dialog erneut öffnen.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="website-teaser">Kurzbeschreibung</Label>
              <Textarea id="website-teaser" rows={3} maxLength={WEBSITE_TEASER_MAX}
                value={teaser} onChange={(event) => setTeaser(event.target.value)} />
              <p className="text-xs text-muted-foreground text-right">{teaser.length}/{WEBSITE_TEASER_MAX}</p>
            </div>
            {loadingPhoto ? <p className="text-sm text-muted-foreground">Foto wird geladen…</p> : (
              <div className="space-y-2">
                <Label>Foto für die Website</Label>
                {instructor.avatar_url && privatePhoto ? (
                  <RadioGroup value={photoChoice} onValueChange={(value) => setPhotoChoice(value as "public" | "private")}
                    className="grid grid-cols-2 gap-3">
                    <Label htmlFor="website-photo-public" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center">
                      <RadioGroupItem id="website-photo-public" value="public" />
                      <Avatar className="h-16 w-16"><AvatarImage src={instructor.avatar_url} alt="Bisheriges Website-Foto" /><AvatarFallback>–</AvatarFallback></Avatar>
                      <span className="text-sm">Bisheriges Foto</span>
                    </Label>
                    <Label htmlFor="website-photo-private" className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-center">
                      <RadioGroupItem id="website-photo-private" value="private" />
                      <Avatar className="h-16 w-16"><AvatarImage src={privatePhoto.url} alt="Aktuelles internes Foto" /><AvatarFallback>–</AvatarFallback></Avatar>
                      <span className="text-sm">Neues internes Foto</span>
                    </Label>
                  </RadioGroup>
                ) : chosenPhotoUrl ? (
                  <Avatar className="h-20 w-20"><AvatarImage src={chosenPhotoUrl} alt="Vorgesehenes Website-Foto" /><AvatarFallback>–</AvatarFallback></Avatar>
                ) : (
                  <p className="text-sm text-muted-foreground">Bitte zuerst unter «Profil bearbeiten» ein Foto hochladen.</p>
                )}
              </div>
            )}
            {instructor.status !== "active" && (
              <p className="text-sm text-destructive">Nur aktive Profile können veröffentlicht werden.</p>
            )}
          </div>
          <SheetFooter className="shrink-0 gap-2 border-t bg-background px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            {instructor.show_on_website && <Button type="button" variant="outline" disabled={saving}
              onClick={() => setConfirmAction("hide")}>Von Website nehmen</Button>}
            <Button type="button" disabled={!canPublish || saving}
              onClick={() => setConfirmAction("publish")}>
              {isPublic ? "Änderungen veröffentlichen" : "Auf Website veröffentlichen"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={!!confirmAction} onOpenChange={(next) => { if (!next && !saving) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction === "hide" ? "Profil von der Website nehmen?" : "Dieses Profil veröffentlichen?"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {confirmAction === "hide" ? (
                  <p>Das Profil verschwindet aus der Teamliste. Das bisherige Website-Foto bleibt gespeichert.</p>
                ) : (
                  <>
                    <p>Folgendes wird öffentlich sichtbar: Name, dieser Titel, dieses Foto und die Kurzbeschreibung. Private Personaldaten bleiben intern.</p>
                    <p className="font-medium text-foreground">{instructor.first_name} {instructor.last_name}</p>
                    <p className="text-foreground">{effectiveTitle}</p>
                    <Avatar className="h-20 w-20"><AvatarImage src={chosenPhotoUrl ?? undefined} alt="Foto für Website" /><AvatarFallback>–</AvatarFallback></Avatar>
                    <p className="whitespace-pre-wrap text-foreground">{trimmedTeaser}</p>
                    {photoChoice === "private" && <p>Das bisher private Foto wird als Kopie öffentlich zugänglich.</p>}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void handleConfirm(); }}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Bitte warten…</> :
                confirmAction === "hide" ? "Von Website nehmen" : "Jetzt veröffentlichen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
