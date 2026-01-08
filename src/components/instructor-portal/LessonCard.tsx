import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Phone, 
  MessageCircle, 
  Users, 
  FileText,
  CheckCircle2,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInYears } from "date-fns";
import { de } from "date-fns/locale";
import type { PortalLesson } from "@/hooks/useInstructorPortalData";
import { getLevelLabel } from "@/lib/level-utils";
import { getMeetingPointById } from "@/lib/meeting-point-utils";

interface LessonCardProps {
  lesson: PortalLesson;
  onMarkAttendance?: () => void;
}

export function LessonCard({ lesson, onMarkAttendance }: LessonCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getAge = (birthDate: string) => {
    return differenceInYears(new Date(), new Date(birthDate));
  };

  const getDuration = () => {
    if (!lesson.timeStart || !lesson.timeEnd) return "";
    const [startH, startM] = lesson.timeStart.split(":").map(Number);
    const [endH, endM] = lesson.timeEnd.split(":").map(Number);
    const hours = (endH * 60 + endM - startH * 60 - startM) / 60;
    return `${hours}h`;
  };

  const getProductTypeLabel = () => {
    switch (lesson.productType) {
      case "private":
        return "Privatstunde";
      case "group_kids":
      case "group_adults":
        return "Gruppenkurs";
      case "lunch":
        return "Mittagsbetreuung";
      default:
        return "Lektion";
    }
  };

  const handleCall = () => {
    if (lesson.customer?.phone) {
      window.location.href = `tel:${lesson.customer.phone}`;
    }
  };

  const handleWhatsApp = () => {
    if (lesson.customer?.phone) {
      const phone = lesson.customer.phone.replace(/[^0-9]/g, "");
      window.open(`https://wa.me/${phone}`, "_blank");
    }
  };

  const isLunch = lesson.productType === "lunch";

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      isLunch && "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20"
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Time */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-lg">
                    {lesson.timeStart?.slice(0, 5)} - {lesson.timeEnd?.slice(0, 5)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {getDuration()}
                  </Badge>
                  {isLunch && (
                    <span className="text-lg">🍽️</span>
                  )}
                </div>

                {/* Product Type */}
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{getProductTypeLabel()}</Badge>
                  {lesson.instructorConfirmation === "confirmed" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                </div>

                {/* Customer & Participants */}
                {lesson.customer && (
                  <p className="font-medium text-sm truncate">
                    {lesson.customer.firstName} {lesson.customer.lastName}
                  </p>
                )}
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {lesson.participants.length} Teilnehmer
                    {lesson.participants.length === 1 
                      ? `: ${lesson.participants[0].firstName}`
                      : ""}
                  </span>
                </div>

                {/* Meeting Point */}
                {lesson.meetingPoint && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{getMeetingPointById(lesson.meetingPoint)?.label || lesson.meetingPoint}</span>
                  </div>
                )}
              </div>

              {/* Expand Icon */}
              <div className="flex-shrink-0 pt-1">
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4 border-t pt-4">
            {/* Contact Buttons */}
            {lesson.customer?.phone && (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={handleCall}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Anrufen
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={handleWhatsApp}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
              </div>
            )}

            {/* Participants */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Teilnehmer ({lesson.participants.length})
              </h4>
              <div className="space-y-2">
                {lesson.participants.map((participant, index) => (
                  <div 
                    key={participant.id} 
                    className="bg-muted/50 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {index + 1}. {participant.firstName} {participant.lastName || ""}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 space-y-0.5">
                      <p>{getAge(participant.birthDate)} Jahre · {getLevelLabel(participant.level) || "Level unbekannt"}</p>
                      {participant.notes && (
                        <p className="text-amber-600 dark:text-amber-400">
                          📝 {participant.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Internal Notes */}
            {(lesson.internalNotes || lesson.instructorNotes) && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notizen
                </h4>
                {lesson.internalNotes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    {lesson.internalNotes}
                  </p>
                )}
                {lesson.instructorNotes && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 mt-2">
                    🏫 {lesson.instructorNotes}
                  </p>
                )}
              </div>
            )}

            {/* Ticket Reference */}
            <div className="text-xs text-muted-foreground">
              Ticket: {lesson.ticketNumber}
            </div>

            {/* Attendance Button */}
            {onMarkAttendance && (
              <Button 
                className="w-full" 
                variant="outline"
                onClick={onMarkAttendance}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Anwesenheit bestätigen
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
