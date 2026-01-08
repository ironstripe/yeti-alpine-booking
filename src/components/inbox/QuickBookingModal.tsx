import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Users,
  Calendar,
  UtensilsCrossed,
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { useCustomerMatching, type CustomerMatch } from "@/hooks/useCustomerMatching";
import type { ExtractedData } from "@/hooks/useAIExtraction";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface QuickBookingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  extractedData: ExtractedData;
  onConvertToWizard?: () => void;
}

const skillLevelLabels: Record<string, string> = {
  beginner: "Anfänger",
  intermediate: "Fortgeschritten",
  advanced: "Experte",
  unknown: "Unbekannt",
};

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "EEE, dd.MM.", { locale: de });
  } catch {
    return dateStr;
  }
}

export function QuickBookingModal({
  open,
  onOpenChange,
  conversationId,
  extractedData,
  onConvertToWizard,
}: QuickBookingModalProps) {
  const navigate = useNavigate();
  const [selectedCustomerType, setSelectedCustomerType] = useState<"existing" | "new">("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [sendInvoice, setSendInvoice] = useState(true);
  const [replyToOriginal, setReplyToOriginal] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Get customer matches
  const { data: customerMatches, isLoading: isMatchingCustomers } = useCustomerMatching(
    extractedData.customer?.email,
    extractedData.customer?.phone,
    extractedData.customer?.name
  );

  // Initialize selected participants
  useEffect(() => {
    if (extractedData.participants) {
      setSelectedParticipants(extractedData.participants.map((_, i) => i.toString()));
    }
  }, [extractedData.participants]);

  // Initialize selected customer from matches
  useEffect(() => {
    if (customerMatches && customerMatches.length > 0) {
      setSelectedCustomerId(customerMatches[0].customer.id);
      setSelectedCustomerType("existing");
    } else {
      setSelectedCustomerType("new");
    }
  }, [customerMatches]);

  // Pre-fill internal notes from special requests
  useEffect(() => {
    if (extractedData.booking?.special_requests) {
      setInternalNotes(extractedData.booking.special_requests);
    }
  }, [extractedData.booking?.special_requests]);

  const handleToggleParticipant = (index: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  };

  const calculateEstimatedTotal = () => {
    // Simplified price calculation for preview
    const participantCount = selectedParticipants.length;
    const dayCount = extractedData.booking?.dates?.length || 1;
    const hasLunch = extractedData.booking?.lunch_supervision;
    
    // Rough estimates (would be calculated properly in real implementation)
    const pricePerDay = extractedData.booking?.product_type === "private" ? 250 : 95;
    const lunchPrice = 25;
    
    let total = participantCount * dayCount * pricePerDay;
    if (hasLunch) {
      total += participantCount * dayCount * lunchPrice;
    }
    
    return total;
  };

  const handleOpenInWizard = () => {
    onOpenChange(false);
    if (onConvertToWizard) {
      onConvertToWizard();
    } else {
      // Navigate to wizard with prefilled data
      navigate("/bookings/new", {
        state: {
          prefill: {
            customer: extractedData.customer,
            participants: extractedData.participants,
            booking: extractedData.booking,
          },
          conversation: conversationId,
        },
      });
    }
  };

  const handleQuickBook = async () => {
    if (selectedParticipants.length === 0) {
      toast.error("Bitte wählen Sie mindestens einen Teilnehmer aus");
      return;
    }

    setIsCreating(true);
    
    try {
      // For now, just navigate to wizard with prefilled data
      // In a full implementation, this would create the booking directly
      toast.info("Schnellbuchung wird vorbereitet...");
      
      navigate("/bookings/new", {
        state: {
          prefill: {
            customer: extractedData.customer,
            participants: extractedData.participants?.filter((_, i) => 
              selectedParticipants.includes(i.toString())
            ),
            booking: extractedData.booking,
          },
          conversation: conversationId,
          quickBookOptions: {
            customerId: selectedCustomerType === "existing" ? selectedCustomerId : null,
            sendConfirmation,
            sendInvoice,
            replyToOriginal,
            internalNotes,
          },
        },
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error("Quick booking error:", error);
      toast.error("Fehler beim Erstellen der Buchung");
    } finally {
      setIsCreating(false);
    }
  };

  const estimatedTotal = calculateEstimatedTotal();
  const hasParticipants = extractedData.participants && extractedData.participants.length > 0;
  const hasDates = extractedData.booking?.dates && extractedData.booking.dates.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schnellbuchung bestätigen</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>Die KI hat diese Anfrage mit hoher Sicherheit extrahiert.</span>
            <ConfidenceIndicator confidence={extractedData.confidence} size="sm" />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Customer Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Kunde
            </Label>
            
            {isMatchingCustomers ? (
              <Card>
                <CardContent className="py-4 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardContent>
              </Card>
            ) : (
              <RadioGroup
                value={selectedCustomerType}
                onValueChange={(v) => setSelectedCustomerType(v as "existing" | "new")}
              >
                {customerMatches && customerMatches.length > 0 && (
                  <Card className={selectedCustomerType === "existing" ? "border-primary" : ""}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="existing" id="existing" />
                        <Label htmlFor="existing" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="font-medium">Bestehender Kunde:</span>
                            <span>
                              {customerMatches[0].customer.first_name}{" "}
                              {customerMatches[0].customer.last_name}
                            </span>
                            {customerMatches[0].previousBookings > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {customerMatches[0].previousBookings} Buchungen
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {customerMatches[0].customer.email}
                          </p>
                        </Label>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className={selectedCustomerType === "new" ? "border-primary" : ""}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value="new" id="new" />
                      <Label htmlFor="new" className="flex-1 cursor-pointer">
                        <span className="font-medium">Neuen Kunden erstellen</span>
                        {extractedData.customer?.name && (
                          <span className="text-muted-foreground ml-2">
                            ({extractedData.customer.name})
                          </span>
                        )}
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              </RadioGroup>
            )}
          </div>

          <Separator />

          {/* Participants */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Teilnehmer & Produkte
            </Label>
            
            {hasParticipants ? (
              <div className="space-y-2">
                {extractedData.participants!.map((participant, index) => (
                  <Card 
                    key={index} 
                    className={selectedParticipants.includes(index.toString()) ? "border-primary/50" : "opacity-50"}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`participant-${index}`}
                          checked={selectedParticipants.includes(index.toString())}
                          onCheckedChange={() => handleToggleParticipant(index.toString())}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`participant-${index}`} className="font-medium cursor-pointer">
                              {participant.name}
                            </Label>
                            {participant.age && (
                              <Badge variant="outline" className="text-xs">
                                {participant.age}J
                              </Badge>
                            )}
                            {participant.skill_level && participant.skill_level !== "unknown" && (
                              <Badge variant="secondary" className="text-xs">
                                {skillLevelLabels[participant.skill_level] || participant.skill_level}
                              </Badge>
                            )}
                          </div>
                          
                          {hasDates && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {extractedData.booking!.dates!.map((d) => formatDate(d.date)).join(", ")}
                            </div>
                          )}
                          
                          {extractedData.booking?.lunch_supervision && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <UtensilsCrossed className="h-3 w-3" />
                              Mittagsbetreuung
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center">
                  <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Keine Teilnehmer extrahiert
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <Separator />

          {/* Price Summary */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Zusammenfassung</Label>
            <Card className="bg-muted/50">
              <CardContent className="py-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {selectedParticipants.length} Teilnehmer × {extractedData.booking?.dates?.length || 1} Tage
                  </span>
                  <span className="text-lg font-bold">
                    CHF {estimatedTotal.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Geschätzter Preis – Endpreis wird bei Buchungserstellung berechnet
                </p>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Post-booking options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Nach der Buchung</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="send-confirmation"
                  checked={sendConfirmation}
                  onCheckedChange={(checked) => setSendConfirmation(checked === true)}
                />
                <Label htmlFor="send-confirmation" className="text-sm cursor-pointer">
                  Buchungsbestätigung per E-Mail senden
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="send-invoice"
                  checked={sendInvoice}
                  onCheckedChange={(checked) => setSendInvoice(checked === true)}
                />
                <Label htmlFor="send-invoice" className="text-sm cursor-pointer">
                  Rechnung erstellen und mitsenden
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="reply-original"
                  checked={replyToOriginal}
                  onCheckedChange={(checked) => setReplyToOriginal(checked === true)}
                />
                <Label htmlFor="reply-original" className="text-sm cursor-pointer">
                  Antwort auf Original-Nachricht senden
                </Label>
              </div>
            </div>
          </div>

          {/* Internal Notes */}
          <div className="space-y-2">
            <Label htmlFor="internal-notes" className="text-sm font-medium">
              Interne Notiz (optional)
            </Label>
            <Textarea
              id="internal-notes"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="z.B. Tim braucht geduldigen Lehrer..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button variant="secondary" onClick={handleOpenInWizard}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Im Wizard bearbeiten
          </Button>
          <Button 
            onClick={handleQuickBook} 
            disabled={isCreating || selectedParticipants.length === 0}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird erstellt...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Buchen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
