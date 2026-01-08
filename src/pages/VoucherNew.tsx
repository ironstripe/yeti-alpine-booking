import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, CalendarIcon, Banknote, CreditCard, Smartphone, FileText } from "lucide-react";
import { format, addYears } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useCreateVoucher } from "@/hooks/useVouchers";

const PRESET_VALUES = [50, 100, 150, 200];

const paymentMethods = [
  { value: "bar", label: "Bar", icon: Banknote },
  { value: "karte", label: "Karte", icon: CreditCard },
  { value: "twint", label: "TWINT", icon: Smartphone },
  { value: "rechnung", label: "Rechnung", icon: FileText },
];

export default function VoucherNew() {
  const navigate = useNavigate();
  const createVoucher = useCreateVoucher();

  // Form state
  const [value, setValue] = useState<number>(150);
  const [customValue, setCustomValue] = useState("");
  const [expiryDate, setExpiryDate] = useState<Date>(addYears(new Date(), 2));
  const [buyerType, setBuyerType] = useState<"existing" | "new">("new");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [isGift, setIsGift] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientMessage, setRecipientMessage] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bar");
  const [isPaid, setIsPaid] = useState(true);
  const [internalNote, setInternalNote] = useState("");

  const actualValue = customValue ? parseFloat(customValue) : value;

  const handleSubmit = (shouldPrint: boolean = false) => {
    if (actualValue < 10 || actualValue > 500) return;

    createVoucher.mutate(
      {
        original_value: actualValue,
        remaining_balance: actualValue,
        expiry_date: format(expiryDate, "yyyy-MM-dd"),
        status: "active",
        buyer_customer_id: buyerType === "existing" ? selectedCustomerId : null,
        buyer_name: buyerType === "new" ? buyerName : null,
        buyer_email: buyerType === "new" ? buyerEmail : null,
        buyer_phone: buyerType === "new" ? buyerPhone : null,
        recipient_name: isGift ? recipientName : null,
        recipient_message: isGift ? recipientMessage : null,
        payment_method: paymentMethod,
        is_paid: isPaid,
        internal_note: internalNote || null,
      },
      {
        onSuccess: (data) => {
          if (shouldPrint) {
            navigate(`/vouchers/${data.id}?print=true`);
          } else {
            navigate("/vouchers");
          }
        },
      }
    );
  };

  return (
    <>
      <PageHeader
        title="Neuer Gutschein"
        description="Gutschein erstellen und ausgeben"
        actions={
          <Button variant="ghost" onClick={() => navigate("/vouchers")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        }
      />

      <div className="max-w-2xl space-y-6">
        {/* Voucher Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gutscheindetails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Wert</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_VALUES.map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant={value === v && !customValue ? "default" : "outline"}
                    onClick={() => {
                      setValue(v);
                      setCustomValue("");
                    }}
                  >
                    CHF {v}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={customValue ? "default" : "outline"}
                  onClick={() => setCustomValue(value.toString())}
                >
                  Andere
                </Button>
              </div>
              {customValue !== "" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">CHF</span>
                  <Input
                    type="number"
                    min="10"
                    max="500"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    className="w-32"
                    placeholder="10-500"
                  />
                </div>
              )}
              {(actualValue < 10 || actualValue > 500) && customValue && (
                <p className="text-sm text-destructive">Wert muss zwischen CHF 10 und CHF 500 liegen</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Gültig bis</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(expiryDate, "dd. MMMM yyyy", { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={expiryDate}
                    onSelect={(date) => date && setExpiryDate(date)}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">Standard: 2 Jahre ab heute</p>
            </div>
          </CardContent>
        </Card>

        {/* Buyer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Käufer (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={buyerType} onValueChange={(v) => setBuyerType(v as "existing" | "new")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing" id="existing" />
                <Label htmlFor="existing" className="font-normal">Bestehender Kunde</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new" />
                <Label htmlFor="new" className="font-normal">Neuer Käufer / Walk-in</Label>
              </div>
            </RadioGroup>

            {buyerType === "existing" ? (
              <div className="space-y-2">
                <Label>Kunde suchen</Label>
                <Input placeholder="Kundensuche (in zukünftiger Version)" disabled />
                <p className="text-xs text-muted-foreground">Kundenverknüpfung wird in einer zukünftigen Version verfügbar sein.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Maria Müller"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-Mail (optional)</Label>
                  <Input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="maria@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefon (optional)</Label>
                  <Input
                    type="tel"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="+41 79 123 45 67"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recipient */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Empfänger (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isGift"
                checked={isGift}
                onCheckedChange={(checked) => setIsGift(checked === true)}
              />
              <Label htmlFor="isGift" className="font-normal">
                Gutschein ist ein Geschenk
              </Label>
            </div>

            {isGift && (
              <>
                <div className="space-y-2">
                  <Label>Empfänger-Name</Label>
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Name des Beschenkten"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Persönliche Nachricht</Label>
                  <Textarea
                    value={recipientMessage}
                    onChange={(e) => setRecipientMessage(e.target.value)}
                    placeholder="Frohe Weihnachten! Viel Spass beim Skifahren!"
                    rows={3}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zahlung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Zahlungsart</Label>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <Button
                      key={method.value}
                      type="button"
                      variant={paymentMethod === method.value ? "default" : "outline"}
                      onClick={() => setPaymentMethod(method.value)}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      {method.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPaid"
                checked={isPaid}
                onCheckedChange={(checked) => setIsPaid(checked === true)}
              />
              <Label htmlFor="isPaid" className="font-normal">
                Bereits bezahlt
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Internal Note */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interne Notiz</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="z.B. Firmengeschenk, Kulanz, etc."
              rows={2}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            onClick={() => handleSubmit(false)}
            disabled={createVoucher.isPending || actualValue < 10 || actualValue > 500}
          >
            Gutschein erstellen
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSubmit(true)}
            disabled={createVoucher.isPending || actualValue < 10 || actualValue > 500}
          >
            Erstellen & Drucken
          </Button>
        </div>
      </div>
    </>
  );
}
