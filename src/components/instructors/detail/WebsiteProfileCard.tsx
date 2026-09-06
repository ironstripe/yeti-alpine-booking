import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_TEASER,
  useInstructorPublicProfile,
  useSaveInstructorPublicProfile,
  uploadPortrait,
  removeStoredPortrait,
  validatePortraitFile,
  type InstructorPublicProfile,
} from "@/hooks/useInstructorPublicProfile";

interface Props {
  instructorId: string;
  firstName: string;
  lastName: string;
  specialization: string | null;
  avatarUrl?: string | null;
}

function suggestRoleLabel(specialization: string | null) {
  switch (specialization) {
    case "ski":
      return "Skilehrperson";
    case "snowboard":
      return "Snowboardlehrperson";
    default:
      return "Ski- und Snowboardlehrperson";
  }
}

const statusMeta: Record<string, { label: string; variant: "secondary" | "default" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  published: { label: "Veröffentlicht", variant: "default" },
  hidden: { label: "Versteckt", variant: "outline" },
};

export function WebsiteProfileCard({ instructorId, firstName, lastName, specialization, avatarUrl }: Props) {
  // Regular profile picture as fallback when no dedicated website portrait exists.
  const fallbackPortrait = avatarUrl ? avatarUrl.split("?")[0] : null;
  const { data: profile, isLoading } = useInstructorPublicProfile(instructorId);
  const save = useSaveInstructorPublicProfile(instructorId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [teaser, setTeaser] = useState(DEFAULT_TEASER);
  const [sortOrder, setSortOrder] = useState(0);
  const [consent, setConsent] = useState(false);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitPath, setPortraitPath] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.public_display_name ?? "");
    setRoleLabel(profile.public_role_label ?? "");
    setTeaser(profile.teaser_draft ?? DEFAULT_TEASER);
    setSortOrder(profile.sort_order ?? 0);
    setConsent(!!profile.photo_consent_confirmed_at);
    setPortraitUrl(profile.portrait_url);
    setPortraitPath(profile.portrait_storage_path);
  }, [profile]);

  const createDraft = () => {
    save.mutate(
      {
        public_display_name: `${firstName} ${lastName?.charAt(0) ?? ""}.`.trim(),
        public_role_label: suggestRoleLabel(specialization),
        teaser_draft: DEFAULT_TEASER,
        status: "draft",
      },
      { onSuccess: () => toast.success("Website-Profil als Entwurf erstellt") },
    );
  };

  const saveDraft = () => {
    save.mutate(
      {
        public_display_name: displayName.trim() || null,
        public_role_label: roleLabel.trim() || null,
        teaser_draft: teaser,
        sort_order: sortOrder,
        photo_consent_confirmed_at: consent
          ? profile?.photo_consent_confirmed_at ?? new Date().toISOString()
          : null,
      },
      { onSuccess: () => toast.success("Entwurf gespeichert") },
    );
  };

  const publish = () => {
    const missing: string[] = [];
    if (!displayName.trim()) missing.push("Anzeigename");
    if (!roleLabel.trim()) missing.push("Rollenbezeichnung");
    if (!teaser.trim()) missing.push("Teaser-Text");
    if (!portraitUrl && !fallbackPortrait) missing.push("Portraitbild");
    if (!consent) missing.push("Einwilligung zur Veröffentlichung");
    if (missing.length > 0) {
      toast.error("Veröffentlichen nicht möglich", {
        description: `Es fehlt noch: ${missing.join(", ")}.`,
      });
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      save.mutate(
        {
          public_display_name: displayName.trim(),
          public_role_label: roleLabel.trim(),
          teaser_draft: teaser,
          teaser_published: teaser,
          sort_order: sortOrder,
          photo_consent_confirmed_at:
            profile?.photo_consent_confirmed_at ?? new Date().toISOString(),
          published_at: new Date().toISOString(),
          published_by: data.user?.id ?? null,
          status: "published",
        },
        { onSuccess: () => toast.success("Profil auf der Website veröffentlicht") },
      );
    });
  };

  const unpublish = () => {
    save.mutate(
      { status: "hidden" },
      { onSuccess: () => toast.success("Profil von der Website entfernt") },
    );
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validatePortraitFile(file);
    if (err) {
      toast.error(err);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setLocalPreview(URL.createObjectURL(file));
    setIsUploading(true);
    try {
      const oldPath = portraitPath;
      const { path, url } = await uploadPortrait(instructorId, file);
      await save.mutateAsync({ portrait_url: url, portrait_storage_path: path });
      setPortraitUrl(url);
      setPortraitPath(path);
      if (oldPath && oldPath !== path) await removeStoredPortrait(oldPath);
      toast.success("Portrait gespeichert");
    } catch (uploadErr) {
      console.error("Portrait upload error:", uploadErr);
      toast.error("Fehler beim Hochladen des Portraits");
    } finally {
      setIsUploading(false);
      setLocalPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePortrait = async () => {
    const oldPath = portraitPath;
    await save.mutateAsync({ portrait_url: null, portrait_storage_path: null, status: profile?.status === "published" ? "hidden" : profile?.status });
    if (oldPath) await removeStoredPortrait(oldPath);
    setPortraitUrl(null);
    setPortraitPath(null);
    toast.success("Portrait entfernt");
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!profile) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Website-Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Hier steuerst du, was von dieser Person auf der öffentlichen Website erscheinen darf.
            Nichts wird sichtbar, bevor du es ausdrücklich veröffentlichst.
          </p>
          <Button onClick={createDraft} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Website-Profil erstellen
          </Button>
        </CardContent>
      </Card>
    );
  }

  const meta = statusMeta[profile.status] ?? statusMeta.draft;
  const previewImage = localPreview ?? portraitUrl ?? fallbackPortrait;

  const checklist = [
    { label: "Anzeigename", ok: !!displayName.trim() },
    { label: "Rollenbezeichnung", ok: !!roleLabel.trim() },
    { label: "Website-Text", ok: !!teaser.trim() },
    { label: "Bild (Porträt oder Profilbild)", ok: !!(portraitUrl || fallbackPortrait) },
    { label: "Einwilligung zur Veröffentlichung", ok: consent },
  ];
  const readyToPublish = checklist.every((c) => c.ok);
  const isLive = profile.status === "published";

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Website-Profil
        </CardTitle>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wp-name">Öffentlicher Anzeigename</Label>
          <Input id="wp-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <p className="text-xs text-muted-foreground">So erscheint der Name auf der Website.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wp-role">Öffentliche Rollenbezeichnung</Label>
          <Input id="wp-role" value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wp-teaser">Website-Text</Label>
          <Textarea
            id="wp-teaser"
            rows={4}
            maxLength={280}
            value={teaser}
            onChange={(e) => setTeaser(e.target.value.slice(0, 280))}
          />
          <p className="text-xs text-muted-foreground text-right">{teaser.length}/280</p>
        </div>

        <div className="space-y-2">
          <Label>Website-Portrait</Label>
          <div className="flex items-start gap-4">
            <div className="w-24 aspect-[4/5] rounded-md bg-muted overflow-hidden shrink-0">
              {previewImage && (
                <img src={previewImage} alt="Portrait-Vorschau" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFile}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {portraitUrl ? "Ersetzen" : "Hochladen"}
                </Button>
                {portraitUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={removePortrait}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Entfernen
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Empfohlen: hochformatiges, gut beleuchtetes Portrait. JPG, PNG oder WebP, max. 5 MB.
              </p>
              {!portraitUrl && (
                <p className="text-xs text-muted-foreground">
                  {fallbackPortrait
                    ? "Kein eigenes Porträt hochgeladen – das Profilbild wird verwendet."
                    : "Kein Profilbild vorhanden – bitte Porträt hochladen."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="wp-consent"
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
          />
          <Label htmlFor="wp-consent" className="text-sm font-normal leading-snug cursor-pointer">
            Die Person hat der Veröffentlichung von Portrait und Text auf der Website zugestimmt.
          </Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wp-order">Reihenfolge</Label>
          <Input
            id="wp-order"
            type="number"
            className="w-28"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">Kleinere Zahlen erscheinen zuerst.</p>
        </div>

        <Separator />

        {/* Preview */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            {profile.teaser_published ? "Website-Vorschau" : "Vorschau (Entwurf, noch nicht veröffentlicht)"}
          </p>
          <div className="border rounded-lg p-4 flex gap-4">
            <div className="w-20 aspect-[4/5] rounded-md bg-muted overflow-hidden shrink-0">
              {previewImage && <img src={previewImage} alt="" className="w-full h-full object-cover" />}
            </div>
            <div>
              <p className="font-semibold">{displayName || "—"}</p>
              <p className="text-sm text-muted-foreground">{roleLabel || "—"}</p>
              <p className="text-sm mt-2">{profile.teaser_published ?? teaser}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveDraft} disabled={save.isPending}>
            Draft speichern
          </Button>
          <Button onClick={publish} disabled={save.isPending}>
            Profil veröffentlichen
          </Button>
          {profile.status === "published" && (
            <Button variant="destructive" onClick={unpublish} disabled={save.isPending}>
              Von Website entfernen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export type { InstructorPublicProfile };
