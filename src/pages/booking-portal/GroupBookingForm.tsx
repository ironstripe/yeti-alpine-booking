import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookingPortalLayout } from "@/components/booking-portal/BookingPortalLayout";
import { BookingStepIndicator } from "@/components/booking-portal/BookingStepIndicator";
import { ParticipantFormFields, type ParticipantData } from "@/components/booking-portal/ParticipantFormFields";
import { useBookingRequest, type BookingRequestData } from "@/hooks/useBookingRequest";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Users, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { format, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Mock available courses - in real app, fetch from API
const mockCourses = [
  {
    id: "course-1",
    name: "Kinderkurs Anfänger",
    days: 5,
    schedule: "Mo-Fr · 10:00-12:00",
    ageRange: "4-6 Jahre",
    spotsAvailable: 3,
    totalSpots: 8,
    price: 295,
    sport: "ski" as const,
  },
  {
    id: "course-2",
    name: "Kinderkurs Anfänger",
    days: 5,
    schedule: "Mo-Fr · 14:00-16:00",
    ageRange: "4-6 Jahre",
    spotsAvailable: 5,
    totalSpots: 8,
    price: 295,
    sport: "ski" as const,
  },
  {
    id: "course-3",
    name: "Kinderkurs Fortgeschritten",
    days: 5,
    schedule: "Mo-Fr · 10:00-12:00",
    ageRange: "6-10 Jahre",
    spotsAvailable: 1,
    totalSpots: 8,
    price: 295,
    sport: "ski" as const,
  },
  {
    id: "course-4",
    name: "Erwachsenenkurs Anfänger",
    days: 3,
    schedule: "Mo, Mi, Fr · 09:00-12:00",
    ageRange: "ab 16 Jahre",
    spotsAvailable: 0,
    totalSpots: 8,
    price: 245,
    sport: "ski" as const,
  },
];

const emptyParticipant: ParticipantData = {
  firstName: "",
  lastName: "",
  birthDate: "",
  experienceLevel: "",
  needsRental: false,
};

export default function GroupBookingForm() {
  const navigate = useNavigate();
  const { createRequest, isSubmitting } = useBookingRequest();
  
  const [step, setStep] = useState(1);
  const [sport, setSport] = useState<"ski" | "snowboard">("ski");
  const [startDate, setStartDate] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<typeof mockCourses[0] | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [participants, setParticipants] = useState<ParticipantData[]>([{ ...emptyParticipant }]);
  const [includeLunch, setIncludeLunch] = useState(false);
  const [lunchDays, setLunchDays] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  
  // Contact info
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [notes, setNotes] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const filteredCourses = mockCourses.filter(c => c.sport === sport);
  
  // Calculate price
  const coursePrice = selectedCourse?.price || 0;
  const rentalPrice = participants.filter(p => p.needsRental).length * 25 * (selectedCourse?.days || 5);
  const lunchPrice = includeLunch ? lunchDays.length * 25 * participantCount : 0;
  const totalPrice = (coursePrice * participantCount) + rentalPrice + lunchPrice;

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

  const canProceedStep1 = sport && selectedCourse;
  const canProceedStep2 = participants.every(p => p.firstName && p.lastName && p.birthDate);
  const canSubmit = firstName && lastName && email && phone && acceptTerms;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedCourse) return;

    const requestData: BookingRequestData = {
      type: "group",
      sport,
      requestedDate: startDate || format(new Date(), "yyyy-MM-dd"),
      requestedTimeSlot: "morning",
      durationHours: selectedCourse.days * 2,
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
      estimatedPrice: totalPrice,
      notes: notes + (allergies ? `\n\nAllergien: ${allergies}` : ""),
      productId: selectedCourse.id,
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

      <h1 className="text-xl font-bold mb-4">Gruppenkurs buchen</h1>
      
      <BookingStepIndicator
        currentStep={step}
        totalSteps={3}
        labels={["Kurs wählen", "Teilnehmer", "Kontakt & Absenden"]}
      />

      {/* Step 1: Course Selection */}
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

          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="startDate">Startdatum</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              min={minDate}
            />
          </div>

          {/* Course List */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Verfügbare Kurse</Label>
            
            {filteredCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => course.spotsAvailable > 0 && setSelectedCourse(course)}
                disabled={course.spotsAvailable === 0}
                className={cn(
                  "w-full p-4 rounded-lg border-2 text-left transition-colors",
                  selectedCourse?.id === course.id
                    ? "border-primary bg-primary/5"
                    : course.spotsAvailable === 0
                    ? "border-muted bg-muted/30 opacity-60"
                    : "border-muted hover:border-muted-foreground/30"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium">{course.name}</div>
                  <div className="font-bold">CHF {course.price}.-</div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    {course.days} Tage · {course.schedule}
                  </div>
                  <div>Alter: {course.ageRange}</div>
                </div>
                <div className="mt-2">
                  {course.spotsAvailable === 0 ? (
                    <span className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Ausgebucht
                    </span>
                  ) : course.spotsAvailable <= 2 ? (
                    <span className="text-sm text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Nur noch {course.spotsAvailable} {course.spotsAvailable === 1 ? "Platz" : "Plätze"}!
                    </span>
                  ) : (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {course.spotsAvailable} Plätze frei
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

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
          {/* Selected Course Summary */}
          {selectedCourse && (
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="font-medium">{selectedCourse.name}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedCourse.schedule} · CHF {selectedCourse.price}.-
                </div>
              </CardContent>
            </Card>
          )}

          {/* Participant Count */}
          <div className="space-y-3">
            <Label className="text-base font-medium">
              Wie viele Kinder möchten Sie anmelden?
            </Label>
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
              <span className="text-lg font-medium w-20 text-center">
                {participantCount} {participantCount === 1 ? "Kind" : "Kinder"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleParticipantCountChange(participantCount + 1)}
                disabled={participantCount >= Math.min(4, selectedCourse?.spotsAvailable || 4)}
              >
                +
              </Button>
            </div>
          </div>

          {/* Participant Forms */}
          {participants.map((participant, index) => (
            <ParticipantFormFields
              key={index}
              index={index}
              data={participant}
              onChange={(data) => updateParticipant(index, data)}
            />
          ))}

          {/* Lunch Option */}
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="lunch"
                checked={includeLunch}
                onCheckedChange={(checked) => {
                  setIncludeLunch(checked === true);
                  if (checked) {
                    setLunchDays(["Mo", "Di", "Mi", "Do", "Fr"]);
                  } else {
                    setLunchDays([]);
                  }
                }}
              />
              <div>
                <Label htmlFor="lunch" className="cursor-pointer">
                  Mittagsbetreuung buchen
                </Label>
                <p className="text-sm text-muted-foreground">
                  inkl. Mittagessen · + CHF 25.- / Tag
                </p>
              </div>
            </div>

            {includeLunch && (
              <>
                <div className="flex flex-wrap gap-2 pl-6">
                  {["Mo", "Di", "Mi", "Do", "Fr"].map((day) => (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={lunchDays.includes(day) ? "default" : "outline"}
                      onClick={() => {
                        if (lunchDays.includes(day)) {
                          setLunchDays(lunchDays.filter(d => d !== day));
                        } else {
                          setLunchDays([...lunchDays, day]);
                        }
                      }}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2 pl-6">
                  <Label htmlFor="allergies">Allergien/Unverträglichkeiten</Label>
                  <Textarea
                    id="allergies"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="z.B. Laktoseintoleranz"
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>

          {/* Price Summary */}
          <Card className="bg-muted/50">
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Gruppenkurs {selectedCourse?.days} Tage × {participantCount}:</span>
                <span>CHF {coursePrice * participantCount}.00</span>
              </div>
              {rentalPrice > 0 && (
                <div className="flex justify-between">
                  <span>Leihausrüstung:</span>
                  <span>CHF {rentalPrice}.00</span>
                </div>
              )}
              {lunchPrice > 0 && (
                <div className="flex justify-between">
                  <span>Mittagsbetreuung:</span>
                  <span>CHF {lunchPrice}.00</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 border-t">
                <span>Total:</span>
                <span>CHF {totalPrice}.00</span>
              </div>
            </CardContent>
          </Card>

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

            <div className="space-y-2">
              <Label htmlFor="accommodation">Unterkunft (optional)</Label>
              <Input
                id="accommodation"
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
                placeholder="Hotel/Ferienwohnung"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Zusätzliche Wünsche</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ihre Nachricht..."
                rows={3}
              />
            </div>
          </div>

          {/* Terms */}
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

          {/* Summary */}
          <Card className="bg-muted/50">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-medium">Ihre Buchung</h4>
              {selectedCourse && (
                <div className="space-y-2 text-sm">
                  <div className="font-medium">{selectedCourse.name}</div>
                  <div className="text-muted-foreground">{selectedCourse.schedule}</div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {participantCount} {participantCount === 1 ? "Teilnehmer" : "Teilnehmer"}
                  </div>
                  <div className="pt-2 border-t flex justify-between font-bold">
                    <span>Total:</span>
                    <span>CHF {totalPrice}.00</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Wird gesendet..." : "Verbindlich buchen"}
          </Button>
        </div>
      )}
    </BookingPortalLayout>
  );
}
