import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatIBAN, validateIBAN, validatePaymentProfile, type PaymentProfile } from "@/lib/payments";
import { useSavePaymentProfile, type PaymentProfileInput } from "@/hooks/usePaymentProfiles";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: PaymentProfile | null;
  /** Prefilled values when migrating the old single bank account. */
  initial?: Partial<PaymentProfileInput> | null;
}

const empty: PaymentProfileInput = {
  id: undefined,
  name: "",
  bank_name: "",
  iban: "",
  bic_swift: "",
  account_holder: "",
  account_holder_street: "",
  account_holder_house_number: "",
  account_holder_zip: "",
  account_holder_city: "",
  account_holder_country: "LI",
  currency: "CHF",
  country_scope: "CH_LI",
  reference_type: "QRR",
  presentation_type: "swiss_qr",
  is_default: false,
  is_active: false,
  is_archived: false,
  validation_status: "draft",
  valid_from: null,
  valid_until: null,
} as unknown as PaymentProfileInput;

/** The presentation follows from scope, currency and account type — never chosen by hand. */
function derivePresentation(values: PaymentProfileInput): PaymentProfileInput["presentation_type"] {
  if (values.country_scope === "SEPA") return "sepa_transfer";
  if (values.country_scope === "INTERNATIONAL") return "international_transfer";
  return values.currency === "CHF" ? "swiss_qr" : "international_transfer";
}

export function PaymentProfileDialog({ open, onOpenChange, profile, initial }: Props) {
  const [values, setValues] = useState<PaymentProfileInput>(empty);
  const save = useSavePaymentProfile();

  useEffect(() => {
    if (!open) return;
    if (profile) setValues({ ...(profile as unknown as PaymentProfileInput) });
    else setValues({ ...empty, ...(initial ?? {}) });
  }, [open, profile, initial]);

  const set = <K extends keyof PaymentProfileInput>(key: K, value: PaymentProfileInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const ibanCheck = values.iban ? validateIBAN(values.iban) : null;
  const check = validatePaymentProfile({
    ...(values as unknown as PaymentProfile),
    id: values.id ?? "new",
    presentation_type: derivePresentation(values),
  });

  const handleSave = async () => {
    await save.mutateAsync({ ...values, presentation_type: derivePresentation(values) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{profile ? "Zahlungsprofil bearbeiten" : "Neues Zahlungsprofil"}</DialogTitle>
          <DialogDescription>
            Jede Änderung setzt das Profil zurück auf Entwurf. Erst nach erfolgreicher Prüfung
            kann es aktiviert werden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Bezeichnung</Label>
              <Input
                value={values.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                placeholder="z. B. LLB Hauptkonto CHF"
              />
            </div>
            <div>
              <Label>Bank</Label>
              <Input value={values.bank_name ?? ""} onChange={(e) => set("bank_name", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>IBAN</Label>
              <Input
                value={values.iban ?? ""}
                onChange={(e) => set("iban", e.target.value)}
                placeholder="LI21 0881 0000 0000 0000 0"
              />
              {ibanCheck && (
                <p className="text-xs mt-1 text-muted-foreground">
                  {ibanCheck.valid
                    ? `${formatIBAN(ibanCheck.normalized)} · ${ibanCheck.accountType === "qr_iban" ? "QR-IBAN erkannt" : "Normale IBAN"}`
                    : ibanCheck.error}
                </p>
              )}
            </div>
            <div>
              <Label>BIC / SWIFT</Label>
              <Input value={values.bic_swift ?? ""} onChange={(e) => set("bic_swift", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Kontoinhaber</Label>
            <Input
              value={values.account_holder ?? ""}
              onChange={(e) => set("account_holder", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Label>Strasse</Label>
              <Input
                value={values.account_holder_street ?? ""}
                onChange={(e) => set("account_holder_street", e.target.value)}
              />
            </div>
            <div>
              <Label>Hausnummer</Label>
              <Input
                value={values.account_holder_house_number ?? ""}
                onChange={(e) => set("account_holder_house_number", e.target.value)}
              />
            </div>
            <div>
              <Label>Land</Label>
              <Input
                value={values.account_holder_country ?? ""}
                onChange={(e) => set("account_holder_country", e.target.value.toUpperCase())}
                maxLength={2}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>PLZ</Label>
              <Input
                value={values.account_holder_zip ?? ""}
                onChange={(e) => set("account_holder_zip", e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <Label>Ort</Label>
              <Input
                value={values.account_holder_city ?? ""}
                onChange={(e) => set("account_holder_city", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Währung</Label>
              <Select value={values.currency} onValueChange={(v) => set("currency", v as PaymentProfileInput["currency"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHF">CHF</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Länderbereich</Label>
              <Select
                value={values.country_scope}
                onValueChange={(v) => set("country_scope", v as PaymentProfileInput["country_scope"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CH_LI">Schweiz / Liechtenstein</SelectItem>
                  <SelectItem value="SEPA">SEPA-Raum</SelectItem>
                  <SelectItem value="INTERNATIONAL">International</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referenzart</Label>
              <Select
                value={values.reference_type}
                onValueChange={(v) => set("reference_type", v as PaymentProfileInput["reference_type"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QRR">QR-Referenz (nur mit QR-IBAN)</SelectItem>
                  <SelectItem value="SCOR">Creditor Reference</SelectItem>
                  <SelectItem value="NON">Ohne Referenz</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Gültig ab (optional)</Label>
              <Input
                type="date"
                value={values.valid_from ?? ""}
                onChange={(e) => set("valid_from", e.target.value || null)}
              />
            </div>
            <div>
              <Label>Gültig bis (optional)</Label>
              <Input
                type="date"
                value={values.valid_until ?? ""}
                onChange={(e) => set("valid_until", e.target.value || null)}
              />
            </div>
          </div>

          {check.valid ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Angaben sind vollständig und stimmig.</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {check.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={save.isPending || !check.valid}>
            Als Entwurf speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
