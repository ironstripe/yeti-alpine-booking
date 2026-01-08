import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookingPortalLayout } from "@/components/booking-portal/BookingPortalLayout";
import { BookingStepIndicator } from "@/components/booking-portal/BookingStepIndicator";
import { ParticipantFormFields, type ParticipantData } from "@/components/booking-portal/ParticipantFormFields";
import { useBookingRequest, type BookingRequestData } from "@/hooks/useBookingRequest";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, AlertCircle, Calendar, Clock, Users } from "lucide-react";
import { format, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const durationOptions = [
  { value: 1, label: "1 Stunde", price: 95 },
  { value: 2, label: "2 Stunden", price: 180 },
  { value: 4, label: "Halbtag", price: 340 },
  { value: 6, label: "Ganztag", price: 480 },
];

const emptyParticipant: ParticipantData = {
  firstName: "",
  lastName: "",
  birthDate: "",
  experienceLevel: "",
  needsRental: false,
};

export default function PrivateBookingForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialVoucher = searchParams.get("voucher") || "";
  
  const { createRequest, isSubmitting } = useBookingRequest();
  
  const [step, setStep] = useState(1);
  const [sport, setSport] = useState<"ski" | "snowboard">("ski");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState<"morning" | "afternoon" | "flexible">("morning");
  const [duration, setDuration] = useState(2);
  const [participantCount, setParticipantCount] = useState(1);
  const [participants, setParticipants] = useState<ParticipantData[]>([{ ...emptyParticipant }]);
  
  // Contact info
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [voucherCode, setVoucherCode] = useState(initialVoucher);
  const [notes, setNotes] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [newsletter, setNewsletter] = useState(false);

  const selectedDuration = durationOptions.find(d => d.value === duration);
  const estimatedPrice = selectedDuration?.price || 180;

  // Update participants array when count changes
  const handleParticipantCountChange = (newCount: number) => {
    const count = Math.max(1, Math.min(4, newCount));
    setParticipantCount(count);
    
    if (count > participants.length) {
      const newParticipants = [...participants];
      while (newParticipants.length < count) {
        newParticipants.push({ ...emptyParticipant });
      }
      setParticipants(newParticipants);
    } else if (count < participants.length) {
      setParticipants(participants.slice(0, count));
    }
  };

  const updateParticipant = (index: number, data: ParticipantData) => {
    const newParticipants = [...participants];
    newParticipants[index] = data;
    setParticipants(newParticipants);
  };

  const canProceedStep1 = sport && date && timeSlot && duration;
  const canProceedStep2 = participants.every(p => p.firstName && p.lastName && p.birthDate && p.experienceLevel);
  const canSubmit = firstName && lastName && email && phone && acceptTerms;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const requestData: BookingRequestData = {
      type: "private",
      sport,
      requestedDate: date,
      requestedTimeSlot: timeSlot,
      durationHours: duration,
      participantCount,
      participants,
      customer: {
        salutation,
        firstName,
        lastName,
        email,
        phone,
        accommodation,
      },
      voucherCode: voucherCode || undefined,
      estimatedPrice,
      notes,
    };

    try {
      const result = await createRequest.mutateAsync(requestData);
      navigate(`/book/request/${result.magicToken}`);
    } catch (error) {
      toast.error("Fehler beim Senden der Anfrage. Bitte versuchen Sie es erneut.");
    }
  };

  const minDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

  return (
    <BookingPortalLayout>
      {/* Back Button */}
      <button
        onClick={() => step > 1 ? setStep(step - 1) : navigate("/book")}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        {step > 1 ? "Zurück" : "Abbrechen"}
      </button>

      <h1 className="text-xl font-bold mb-4">Privatstunde anfragen</h1>
      
      <BookingStepIndicator
        currentStep={step}
        totalSteps={3}
        labels={["Unterricht", "Teilnehmer", "Kontakt & Absenden"]}
      />

      {/* Step 1: Lesson Details */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Sport Selection */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Sportart</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={sport === "ski" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setSport("ski")}
              >
                🎿 Ski
              </Button>
              <Button
                type="button"
                variant={sport === "snowboard" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setSport("snowboard")}
              >
                🏂 Snowboard
              </Button>
            </div>
          </div>

          {/* Date Selection */}
          <div className="space-y-3">
            <Label htmlFor="date" className="text-base font-medium">
              Wann möchten Sie Unterricht?
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={minDate}
              className="w-full"
            />
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-amber-800">
                <strong>Hochsaison: 21.12. - 05.01.</strong>
                <br />
                Frühzeitige Buchung empfohlen!
              </div>
            </div>
          </div>

          {/* Time Slot */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Gewünschte Uhrzeit</Label>
            <RadioGroup value={timeSlot} onValueChange={(v) => setTimeSlot(v as typeof timeSlot)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="morning" id="morning" />
                <Label htmlFor="morning" className="font-normal cursor-pointer">
                  Vormittag (09:00 - 12:00)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="afternoon" id="afternoon" />
                <Label htmlFor="afternoon" className="font-normal cursor-pointer">
                  Nachmittag (13:00 - 16:00)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="flexible" id="flexible" />
                <Label htmlFor="flexible" className="font-normal cursor-pointer">
                  Flexibel
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Duration */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Dauer</Label>
            <div className="grid grid-cols-2 gap-3">
              {durationOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDuration(option.value)}
                  className={cn(
                    "p-4 rounded-lg border-2 text-left transition-colors",
                    duration === option.value
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-muted-foreground">CHF {option.price}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Participant Count */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Anzahl Teilnehmer</Label>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleParticipantCountChange(participantCount - 1)}
                disabled={participantCount <= 1}
              >
                −
              </Button>
              <span className="text-lg font-medium w-24 text-center">
                {participantCount} {participantCount === 1 ? "Person" : "Personen"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleParticipantCountChange(participantCount + 1)}
                disabled={participantCount >= 4}
              >
                +
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              ℹ️ Max. 4 Personen pro Privatstunde. Bei mehr Personen empfehlen wir einen Gruppenkurs.
            </p>
          </div>

          {/* Summary Bar */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  {sport === "ski" ? "Ski" : "Snowboard"} · {duration}h · 
                  {timeSlot === "morning" ? " Vormittag" : timeSlot === "afternoon" ? " Nachmittag" : " Flexibel"} · 
                  {participantCount} {participantCount === 1 ? "Person" : "Personen"}
                </div>
                <div className="font-medium">ab CHF {estimatedPrice}.-</div>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            className="w-full"
          >
            Weiter zu Teilnehmer
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Step 2: Participants */}
      {step === 2 && (
        <div className="space-y-6">
          {participants.map((participant, index) => (
            <ParticipantFormFields
              key={index}
              index={index}
              data={participant}
              onChange={(data) => updateParticipant(index, data)}
            />
          ))}

          <Button
            onClick={() => setStep(3)}
            disabled={!canProceedStep2}
            className="w-full"
          >
            Weiter zu Kontaktdaten
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Step 3: Contact & Submit */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Contact Details */}
          <div className="space-y-4">
            <h3 className="font-medium">Ihre Kontaktdaten</h3>
            
            <div className="space-y-2">
              <Label htmlFor="salutation">Anrede</Label>
              <Select value={salutation} onValueChange={setSalutation}>
                <SelectTrigger id="salutation">
                  <SelectValue placeholder="Bitte wählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Herr">Herr</SelectItem>
                  <SelectItem value="Frau">Frau</SelectItem>
                  <SelectItem value="Divers">Divers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Vorname *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nachname *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-Mail *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefon *</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+41 79 123 45 67"
                required
              />
            </div>
          </div>

          {/* Accommodation */}
          <div className="space-y-2">
            <Label htmlFor="accommodation">Unterkunft (optional)</Label>
            <Input
              id="accommodation"
              value={accommodation}
              onChange={(e) => setAccommodation(e.target.value)}
              placeholder="Hotel/Ferienwohnung"
            />
          </div>

          {/* Voucher */}
          <div className="space-y-2">
            <Label htmlFor="voucher">Gutscheincode</Label>
            <Input
              id="voucher"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              placeholder="z.B. GS-2025-0042"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Zusätzliche Wünsche</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z.B. deutschsprachiger Lehrer gewünscht..."
              rows={3}
            />
          </div>

          {/* Terms */}
          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="terms"
                checked={acceptTerms}
                onCheckedChange={(checked) => setAcceptTerms(checked === true)}
              />
              <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
                Ich akzeptiere die <a href="#" className="underline">AGB</a> und{" "}
                <a href="#" className="underline">Stornierungsbedingungen</a> *
              </Label>
            </div>
            <div className="flex items-start space-x-2">
              <Checkbox
                id="newsletter"
                checked={newsletter}
                onCheckedChange={(checked) => setNewsletter(checked === true)}
              />
              <Label htmlFor="newsletter" className="text-sm font-normal cursor-pointer">
                Ich möchte den Newsletter erhalten
              </Label>
            </div>
          </div>

          {/* Summary */}
          <Card className="bg-muted/50">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-medium">Ihre Anfrage</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span>Privatstunde {sport === "ski" ? "Ski" : "Snowboard"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {date ? format(new Date(date), "dd.MM.yyyy", { locale: de }) : "—"} · 
                  {timeSlot === "morning" ? " Vormittag" : timeSlot === "afternoon" ? " Nachmittag" : " Flexibel"}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {duration} Stunden
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {participantCount} {participantCount === 1 ? "Teilnehmer" : "Teilnehmer"}
                </div>
                <div className="pt-2 border-t">
                  <div className="font-medium">Teilnehmer:</div>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {participants.map((p, i) => (
                      <li key={i}>
                        {p.firstName} {p.lastName} ({p.birthDate ? new Date().getFullYear() - new Date(p.birthDate).getFullYear() : "?"})
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2 border-t flex justify-between">
                  <span>Geschätzter Preis:</span>
                  <span className="font-bold">CHF {estimatedPrice}.-</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                ℹ️ Der finale Preis wird nach Prüfung der Verfügbarkeit bestätigt.
              </p>
            </CardContent>
          </Card>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Wird gesendet..." : "Unverbindlich anfragen"}
          </Button>
        </div>
      )}
    </BookingPortalLayout>
  );
}
