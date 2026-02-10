import { useMemo } from "react";
import { Users, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { InstructorSelection } from "./InstructorSelection";
import type { ParticipantGroup } from "@/lib/private-lesson-grouping";
import { getResolvedLevelLabel } from "@/lib/private-lesson-grouping";
import {
  calculateMultiGroupPrice,
  formatCHF,
  ADDITIONAL_PERSON_RATE,
  type TimeSlotRate,
  type HighSeasonPeriod,
} from "@/lib/pricing/private-lesson-pricing";

const START_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
const END_TIMES = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

interface PrivateGroupProposalProps {
  algorithmGroups: ParticipantGroup[];
  algorithmWarnings: string[];
  rates: TimeSlotRate[];
  highSeasonPeriods: HighSeasonPeriod[];
}

export function PrivateGroupProposal({
  algorithmGroups,
  algorithmWarnings,
  rates,
  highSeasonPeriods,
}: PrivateGroupProposalProps) {
  const { state, setGroupInstructor, setGroupTime } = useBookingWizard();

  const proposal = state.privateGroupProposal;

  // Calculate per-group prices
  const pricing = useMemo(() => {
    if (!proposal) return null;

    const firstDate = state.selectedDates[0] ? new Date(state.selectedDates[0]) : null;
    const daysCount = state.selectedDates.length || 1;

    const groups = proposal.groups.map((g) => ({
      id: g.id,
      participantCount: g.participantIds.length,
    }));

    // Use per-group time or fall back to base time
    const results = proposal.groups.map((g) => {
      const startTime = g.startTime || state.timeSlot?.split(" - ")[0] || "10:00";
      const endTime = g.endTime || state.timeSlot?.split(" - ")[1] || "12:00";

      const multiResult = calculateMultiGroupPrice(
        [{ id: g.id, participantCount: g.participantIds.length }],
        firstDate,
        startTime,
        endTime,
        daysCount,
        rates,
        highSeasonPeriods
      );

      return multiResult.perGroupPrices[0];
    });

    const grandTotal = results.reduce((sum, r) => sum + (r?.totalPrice || 0), 0);
    const grandTotalForAllDays = results.reduce((sum, r) => sum + (r?.totalForAllDays || 0), 0);

    return { perGroup: results, grandTotal, grandTotalForAllDays, daysCount };
  }, [proposal, state.selectedDates, state.timeSlot, rates, highSeasonPeriods]);

  // Map participant IDs to algorithm group data for level info
  const algorithmGroupMap = useMemo(() => {
    const map = new Map<string, ParticipantGroup>();
    for (const ag of algorithmGroups) {
      map.set(ag.id, ag);
    }
    return map;
  }, [algorithmGroups]);

  if (!proposal || proposal.groups.length <= 1) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Gruppenvorschlag</h3>
        <Badge variant="secondary">
          {proposal.groups.length} Gruppen erforderlich
        </Badge>
      </div>

      {/* Group Cards */}
      {proposal.groups.map((group, index) => {
        const groupParticipants = state.selectedParticipants.filter((p) =>
          group.participantIds.includes(p.id)
        );
        const algGroup = algorithmGroupMap.get(group.id);
        const groupPrice = pricing?.perGroup[index];

        const groupStartTime = group.startTime || state.timeSlot?.split(" - ")[0] || "10:00";
        const groupEndTime = group.endTime || state.timeSlot?.split(" - ")[1] || "12:00";

        const availableEndTimes = END_TIMES.filter(
          (t) => parseInt(t.split(":")[0]) > parseInt(groupStartTime.split(":")[0])
        );

        return (
          <Card key={group.id} className="border-l-4 border-l-primary/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>
                  Gruppe {index + 1} ({groupParticipants.length}{" "}
                  {groupParticipants.length === 1 ? "Person" : "Personen"})
                </span>
                {groupPrice && (
                  <span className="text-base font-bold">
                    {formatCHF(groupPrice.totalPrice)}/Tag
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Participants with level badges */}
              <div className="flex flex-wrap gap-2">
                {groupParticipants.map((p) => (
                  <Badge key={p.id} variant="outline" className="text-xs">
                    {p.first_name} ({getResolvedLevelLabel(p)})
                  </Badge>
                ))}
              </div>

              {/* Group warning */}
              {algGroup?.warning && (
                <Alert className="bg-amber-50 border-amber-200 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-800">
                    {algGroup.warning}
                  </AlertDescription>
                </Alert>
              )}

              {/* Time selection per group */}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={groupStartTime}
                  onValueChange={(val) => setGroupTime(group.id, val, groupEndTime)}
                >
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {START_TIMES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Select
                  value={groupEndTime}
                  onValueChange={(val) => setGroupTime(group.id, groupStartTime, val)}
                >
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEndTimes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Instructor selection per group */}
              <InstructorSelection
                selectedInstructor={group.instructor}
                assignLater={false}
                onSelect={(instructor) => setGroupInstructor(group.id, instructor)}
                onAssignLaterChange={() => setGroupInstructor(group.id, null)}
                selectedDates={state.selectedDates}
                sport={state.sport}
              />

              {/* Price breakdown */}
              {groupPrice && (
                <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Grundpreis</span>
                    <span>{formatCHF(groupPrice.basePrice)}</span>
                  </div>
                  {groupPrice.additionalPersonsPrice > 0 && (
                    <div className="flex justify-between">
                      <span>
                        +{groupParticipants.length - 1} Person(en) × {formatCHF(ADDITIONAL_PERSON_RATE)}/h
                      </span>
                      <span>{formatCHF(groupPrice.additionalPersonsPrice)}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Global warnings */}
      {algorithmWarnings.map((w, i) => (
        <Alert key={i} className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">{w}</AlertDescription>
        </Alert>
      ))}

      {/* Total */}
      {pricing && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex justify-between text-lg font-bold">
              <span>
                Gesamtpreis{pricing.daysCount > 1 ? ` (${pricing.daysCount} Tage)` : ""}:
              </span>
              <span>
                {formatCHF(pricing.daysCount > 1 ? pricing.grandTotalForAllDays : pricing.grandTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
