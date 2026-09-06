import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, ShieldCheck, Archive, Star, Wand2, Loader2 } from "lucide-react";
import { maskIBAN, validateIBAN, type PaymentProfile } from "@/lib/payments";
import {
  usePaymentProfiles,
  useUpdatePaymentProfileState,
  useValidatePaymentProfile,
} from "@/hooks/usePaymentProfiles";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { PaymentProfileDialog } from "./PaymentProfileDialog";

const SCOPE_LABEL: Record<string, string> = {
  CH_LI: "Schweiz / Liechtenstein",
  SEPA: "SEPA-Raum",
  INTERNATIONAL: "International",
};

const PRESENTATION_LABEL: Record<string, string> = {
  swiss_qr: "Swiss QR-Rechnung",
  sepa_transfer: "SEPA-Überweisung",
  international_transfer: "Internationale Überweisung",
};

function StatusBadge({ profile }: { profile: PaymentProfile }) {
  if (profile.is_archived) return <Badge variant="outline">Archiviert</Badge>;
  if (profile.validation_status === "invalid") return <Badge variant="destructive">Ungültig</Badge>;
  if (profile.validation_status === "draft") return <Badge variant="secondary">Entwurf</Badge>;
  if (profile.is_active) return <Badge>Aktiv</Badge>;
  return <Badge variant="outline">Geprüft, inaktiv</Badge>;
}

export function PaymentProfilesSection() {
  const { data: profiles = [], isLoading } = usePaymentProfiles(true);
  const { data: school } = useSchoolSettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentProfile | null>(null);
  const [prefill, setPrefill] = useState<Record<string, unknown> | null>(null);
  const [archiving, setArchiving] = useState<PaymentProfile | null>(null);

  const validate = useValidatePaymentProfile();
  const updateState = useUpdatePaymentProfileState();

  const showMigration = useMemo(
    () => !isLoading && profiles.length === 0 && !!school?.iban,
    [isLoading, profiles.length, school?.iban],
  );

  const startMigration = () => {
    if (!school) return;
    const iban = validateIBAN(school.iban ?? "");
    const isQr = iban.accountType === "qr_iban";
    setEditing(null);
    setPrefill({
      name: `${school.bank_name || "Bankkonto"} CHF`,
      bank_name: school.bank_name ?? "",
      iban: iban.normalized,
      bic_swift: school.bic ?? "",
      account_holder: school.account_holder || school.name || "",
      account_holder_street: school.street ?? "",
      account_holder_house_number: (school as { house_number?: string }).house_number ?? "",
      account_holder_zip: school.zip ?? "",
      account_holder_city: school.city ?? "",
      account_holder_country: school.country || "LI",
      currency: "CHF",
      country_scope: "CH_LI",
      reference_type: isQr ? "QRR" : "SCOR",
    });
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Rechnungen &amp; Bankkonten</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Diese Konten bestimmen, welche Zahlungsangaben auf einer Rechnung gedruckt werden.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setEditing(null);
            setPrefill(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Konto hinzufügen
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird geladen…
          </div>
        )}

        {showMigration && (
          <Alert>
            <Wand2 className="h-4 w-4" />
            <AlertTitle>Bestehende Bankverbindung übernehmen</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Ihre bisherige Bankverbindung kann als erstes Konto übernommen werden. Sie prüfen
                die Angaben, bevor etwas aktiv wird.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={startMigration}>
                Angaben übernehmen
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && profiles.length === 0 && !showMigration && (
          <p className="text-sm text-muted-foreground">
            Noch kein Konto hinterlegt. Ohne Konto können keine Rechnungen ausgestellt werden.
          </p>
        )}

        {profiles.map((profile) => (
          <div key={profile.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{profile.name}</span>
                  {profile.is_default && (
                    <Badge variant="secondary" className="gap-1">
                      <Star className="h-3 w-3" /> Standard
                    </Badge>
                  )}
                  <StatusBadge profile={profile} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {profile.bank_name || "—"} · {maskIBAN(profile.iban)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Kontoart</p>
                <p>{profile.account_type === "qr_iban" ? "QR-IBAN" : "IBAN"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Währung</p>
                <p>{profile.currency}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Gültig für</p>
                <p>{SCOPE_LABEL[profile.country_scope] ?? profile.country_scope}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Darstellung</p>
                <p>{PRESENTATION_LABEL[profile.presentation_type] ?? profile.presentation_type}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Referenz</p>
                <p>{profile.reference_type}</p>
              </div>
              {(profile.valid_from || profile.valid_until) && (
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Gültigkeit</p>
                  <p>
                    {profile.valid_from ?? "—"} bis {profile.valid_until ?? "unbefristet"}
                  </p>
                </div>
              )}
            </div>

            {!profile.is_archived && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(profile);
                    setPrefill(null);
                    setDialogOpen(true);
                  }}
                >
                  Bearbeiten
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => validate.mutate(profile)}
                  disabled={validate.isPending}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Prüfen
                </Button>
                {profile.validation_status === "valid" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateState.mutate({ profile, changes: { is_active: !profile.is_active } })
                    }
                  >
                    {profile.is_active ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                )}
                {profile.is_active && !profile.is_default && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => updateState.mutate({ profile, changes: { is_default: true } })}
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Als Standard
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setArchiving(profile)}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archivieren
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <PaymentProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        profile={editing}
        initial={prefill as never}
      />

      <AlertDialog open={!!archiving} onOpenChange={(open) => !open && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konto archivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Konto wird nicht gelöscht. Bereits gestellte Rechnungen behalten ihre
              Zahlungsangaben, neue Rechnungen verwenden dieses Konto nicht mehr.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiving) updateState.mutate({ profile: archiving, changes: { is_archived: true } });
                setArchiving(null);
              }}
            >
              Archivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
