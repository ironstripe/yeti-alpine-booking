import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Users,
  Calendar,
  Clock,
  User,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Link2,
  CheckCircle,
  AlertTriangle,
  Search,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { calculateSharedLessonSplit, formatShareAmount } from "@/lib/pricing/shared-lesson-pricing";
import { useCreateSharedLesson } from "@/hooks/useSharedLesson";
import { useHighSeasonPeriods } from "@/hooks/usePrivateLessonRates";
import { usePrivateLessonRates } from "@/hooks/usePrivateLessonRates";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface SharedLessonWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
}

export function SharedLessonWizard({ open, onOpenChange, ticketId }: SharedLessonWizardProps) {
  const [step, setStep] = useState(1);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const createSharedLesson = useCreateSharedLesson();
  const { data: rates = [] } = usePrivateLessonRates();
  const { data: highSeasonPeriods = [] } = useHighSeasonPeriods();

  // Fetch original ticket with items
  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ["shared-wizard-ticket", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          *,
          customer:customers(id, first_name, last_name, email),
          items:ticket_items(
            *,
            participant:customer_participants(id, first_name, last_name),
            instructor:instructors(id, first_name, last_name),
            product:products(id, name)
          )
        `)
        .eq("id", ticketId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!ticketId,
  });

  // Fetch existing shared parties if master_booking exists
  const { data: existingParties = [] } = useQuery({
    queryKey: ["shared-wizard-parties", ticket?.master_booking_id],
    queryFn: async () => {
      if (!ticket?.master_booking_id) return [];
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, ticket_number, total_amount, is_initiator, share_participant_count, status,
          customer:customers(id, first_name, last_name),
          items:ticket_items(participant:customer_participants(id, first_name, last_name))
        `)
        .eq("master_booking_id", ticket.master_booking_id)
        .neq("status", "cancelled");
      if (error) return [];
      return data || [];
    },
    enabled: !!ticket?.master_booking_id,
  });

  // Customer search
  const { data: searchResults = [] } = useQuery({
    queryKey: ["customer-search-shared", customerSearch],
    queryFn: async () => {
      if (customerSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email")
        .or(`last_name.ilike.%${customerSearch}%,first_name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%`)
        .limit(10);
      if (error) return [];
      return data || [];
    },
    enabled: customerSearch.length >= 2,
  });

  // Fetch participants for selected customer
  const { data: customerParticipants = [] } = useQuery({
    queryKey: ["customer-participants-shared", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      const { data, error } = await supabase
        .from("customer_participants")
        .select("id, first_name, last_name, birth_date")
        .eq("customer_id", selectedCustomerId);
      if (error) return [];
      return data || [];
    },
    enabled: !!selectedCustomerId,
  });

  // Derived values
  const lessonInfo = useMemo(() => {
    if (!ticket?.items?.length) return null;
    const firstItem = ticket.items[0] as any;
    return {
      date: firstItem.date,
      timeStart: firstItem.time_start,
      timeEnd: firstItem.time_end,
      instructorId: firstItem.instructor_id,
      instructorName: firstItem.instructor
        ? `${firstItem.instructor.first_name} ${firstItem.instructor.last_name}`
        : "Nicht zugewiesen",
      meetingPoint: firstItem.meeting_point,
      productId: firstItem.product_id,
      productName: firstItem.product?.name || "Privatstunde",
    };
  }, [ticket]);

  const currentParticipantCount = useMemo(() => {
    if (existingParties.length > 0) {
      return existingParties.reduce((sum: number, p: any) => sum + (p.share_participant_count || p.items?.length || 0), 0);
    }
    return ticket?.items?.length || 0;
  }, [ticket, existingParties]);

  const remainingCapacity = 5 - currentParticipantCount;

  // Exclude existing customer IDs
  const existingCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    if (ticket?.customer?.id) ids.add(ticket.customer.id);
    existingParties.forEach((p: any) => {
      if (p.customer?.id) ids.add(p.customer.id);
    });
    return ids;
  }, [ticket, existingParties]);

  const filteredSearchResults = searchResults.filter(
    (c: any) => !existingCustomerIds.has(c.id)
  );

  const selectedCustomer = searchResults.find((c: any) => c.id === selectedCustomerId) 
    || customerParticipants.length > 0 ? { id: selectedCustomerId } : null;

  // Price split calculation
  const splitResult = useMemo(() => {
    if (!lessonInfo || selectedParticipantIds.length === 0) return null;

    const newTotalParticipants = currentParticipantCount + selectedParticipantIds.length;

    // Build parties array
    const parties: Array<{ ticketId: string; participantCount: number; isInitiator: boolean; customerName?: string }> = [];

    if (existingParties.length > 0) {
      existingParties.forEach((p: any) => {
        parties.push({
          ticketId: p.id,
          participantCount: p.share_participant_count || p.items?.length || 0,
          isInitiator: p.is_initiator,
          customerName: p.customer ? `${p.customer.first_name} ${p.customer.last_name}` : undefined,
        });
      });
    } else {
      // Original ticket is the only existing party
      parties.push({
        ticketId: ticketId,
        participantCount: ticket?.items?.length || 0,
        isInitiator: true,
        customerName: ticket?.customer ? `${ticket.customer.first_name} ${ticket.customer.last_name}` : undefined,
      });
    }

    // Add new party
    const newCustomerData = searchResults.find((c: any) => c.id === selectedCustomerId);
    parties.push({
      ticketId: "new",
      participantCount: selectedParticipantIds.length,
      isInitiator: false,
      customerName: newCustomerData ? `${newCustomerData.first_name} ${newCustomerData.last_name}` : "Neue Partei",
    });

    return calculateSharedLessonSplit(
      newTotalParticipants,
      parties,
      new Date(lessonInfo.date),
      lessonInfo.timeStart,
      lessonInfo.timeEnd,
      rates,
      highSeasonPeriods
    );
  }, [lessonInfo, selectedParticipantIds, currentParticipantCount, existingParties, ticket, ticketId, selectedCustomerId, searchResults, rates, highSeasonPeriods]);

  const handleConfirm = async () => {
    if (!lessonInfo || !selectedCustomerId || !splitResult) return;

    const initiatorParty = splitResult.parties.find(p => p.isInitiator);
    const newParty = splitResult.parties.find(p => p.ticketId === "new");

    if (!initiatorParty || !newParty) return;

    await createSharedLesson.mutateAsync({
      originalTicketId: ticketId,
      instructorId: lessonInfo.instructorId,
      date: lessonInfo.date,
      startTime: lessonInfo.timeStart,
      endTime: lessonInfo.timeEnd,
      newCustomerId: selectedCustomerId,
      newParticipantIds: selectedParticipantIds,
      productId: lessonInfo.productId,
      meetingPoint: lessonInfo.meetingPoint,
      initiatorNewAmount: initiatorParty.share,
      newPartyAmount: newParty.share,
      totalParticipants: splitResult.totalParticipants,
      initiatorParticipantCount: initiatorParty.participantCount,
      newPartyParticipantCount: newParty.participantCount,
    });

    onOpenChange(false);
    resetState();
  };

  const resetState = () => {
    setStep(1);
    setCustomerSearch("");
    setSelectedCustomerId(null);
    setSelectedParticipantIds([]);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetState();
  };

  if (ticketLoading || !ticket || !lessonInfo) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Teilen & Rechnung splitten
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={step === 1 ? "default" : "outline"} className="text-xs">1. Übersicht</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 2 ? "default" : "outline"} className="text-xs">2. Neue Partei</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 3 ? "default" : "outline"} className="text-xs">3. Aufteilung</Badge>
        </div>

        <Separator />

        {/* Step 1: Lesson Context */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Lektion</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {format(new Date(lessonInfo.date), "EEEE, d. MMMM yyyy", { locale: de })}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  {lessonInfo.timeStart?.slice(0, 5)} – {lessonInfo.timeEnd?.slice(0, 5)} Uhr
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {lessonInfo.instructorName}
                </div>
                {lessonInfo.meetingPoint && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {lessonInfo.meetingPoint}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Aktuelle Teilnehmer</h4>
              {existingParties.length > 0 ? (
                existingParties.map((party: any) => (
                  <div key={party.id} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {party.customer?.first_name} {party.customer?.last_name}
                        {party.is_initiator && <Badge variant="outline" className="ml-2 text-xs">Initiator</Badge>}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {party.share_participant_count || party.items?.length || 0} TN
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {ticket.customer?.first_name} {ticket.customer?.last_name}
                      <Badge variant="outline" className="ml-2 text-xs">Initiator</Badge>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {ticket.items?.length || 0} TN
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/10">
              <span className="text-sm font-medium">Verfügbare Plätze</span>
              <Badge variant={remainingCapacity > 0 ? "default" : "destructive"}>
                {remainingCapacity} von 5 frei
              </Badge>
            </div>

            {remainingCapacity <= 0 ? (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Maximale Kapazität erreicht (5 Teilnehmer)
              </p>
            ) : (
              <Button className="w-full" onClick={() => setStep(2)}>
                Neue Partei hinzufügen
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        )}

        {/* Step 2: Add New Party */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Customer Search */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Kunde suchen</h4>
              {!selectedCustomerId ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Name oder E-Mail..."
                      className="pl-9"
                    />
                  </div>
                  {filteredSearchResults.length > 0 && (
                    <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                      {filteredSearchResults.map((c: any) => (
                        <button
                          key={c.id}
                          className="w-full px-3 py-2 text-left hover:bg-muted/50 text-sm"
                          onClick={() => setSelectedCustomerId(c.id)}
                        >
                          <span className="font-medium">{c.first_name} {c.last_name}</span>
                          <span className="text-muted-foreground ml-2">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3 bg-muted/50 rounded-lg flex items-center justify-between">
                  <span className="font-medium text-sm">
                    {searchResults.find((c: any) => c.id === selectedCustomerId)?.first_name}{" "}
                    {searchResults.find((c: any) => c.id === selectedCustomerId)?.last_name}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedCustomerId(null); setSelectedParticipantIds([]); }}>
                    Ändern
                  </Button>
                </div>
              )}
            </div>

            {/* Participant Selection */}
            {selectedCustomerId && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Teilnehmer auswählen (max. {remainingCapacity})</h4>
                {customerParticipants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Teilnehmer gefunden</p>
                ) : (
                  <div className="space-y-2">
                    {customerParticipants.map((p: any) => {
                      const isSelected = selectedParticipantIds.includes(p.id);
                      const isDisabled = !isSelected && selectedParticipantIds.length >= remainingCapacity;
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                            isSelected ? "border-primary bg-primary/5" : "border-border"
                          } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={isDisabled}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedParticipantIds(prev => [...prev, p.id]);
                              } else {
                                setSelectedParticipantIds(prev => prev.filter(id => id !== p.id));
                              }
                            }}
                          />
                          <span className="text-sm font-medium">{p.first_name} {p.last_name || ""}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!selectedCustomerId || selectedParticipantIds.length === 0}
                className="flex-1"
              >
                Weiter
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Summary & Price Split */}
        {step === 3 && splitResult && (
          <div className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Preisaufteilung</h4>
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <div className="flex justify-between mb-1">
                  <span>Gesamtkosten ({splitResult.totalParticipants} TN)</span>
                  <span className="font-semibold">{formatShareAmount(splitResult.totalCost)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Pro Teilnehmer: {formatShareAmount(splitResult.perParticipantRate)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {splitResult.parties.map((party) => (
                <div
                  key={party.ticketId}
                  className={`p-3 rounded-lg border ${
                    party.ticketId === "new" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{party.customerName}</span>
                      {party.isInitiator && <Badge variant="outline" className="ml-2 text-xs">Initiator</Badge>}
                      {party.ticketId === "new" && <Badge className="ml-2 text-xs">Neu</Badge>}
                    </div>
                    <span className="font-semibold text-sm">{formatShareAmount(party.share)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {party.participantCount} Teilnehmer × {formatShareAmount(splitResult.perParticipantRate)}
                    {party.isInitiator && splitResult.roundingRemainder > 0 && (
                      <span className="ml-1">(+ {formatShareAmount(splitResult.roundingRemainder)} Rundung)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Verification */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle className="h-4 w-4" />
                Summe: {formatShareAmount(splitResult.parties.reduce((s, p) => s + p.share, 0))} = Gesamtkosten {formatShareAmount(splitResult.totalCost)}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={createSharedLesson.isPending}
                className="flex-1"
              >
                {createSharedLesson.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Bestätigen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
