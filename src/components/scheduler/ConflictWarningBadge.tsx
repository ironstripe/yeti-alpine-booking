import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, Clock, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConflictingBooking } from "@/hooks/useAbsenceConflicts";

interface ConflictWarningBadgeProps {
  conflicts: ConflictingBooking[];
}

export function ConflictWarningBadge({ conflicts }: ConflictWarningBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (conflicts.length === 0) return null;

  const formatTime = (start: string | null, end: string | null) => {
    if (!start) return "";
    return end ? `${start} - ${end}` : start;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge 
          variant="outline" 
          className="bg-amber-100 text-amber-800 border-amber-400 cursor-pointer hover:bg-amber-200 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
        >
          <AlertTriangle className="h-3 w-3 mr-1" />
          {conflicts.length} bestehende Buchung{conflicts.length !== 1 ? "en" : ""} gefunden
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="font-medium flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Buchungskonflikte
          </div>
          <p className="text-xs text-muted-foreground">
            Diese Buchungen müssen vor der Genehmigung umgeplant oder einem anderen Lehrer zugewiesen werden.
          </p>
          <ScrollArea className="max-h-48">
            <div className="space-y-2">
              {conflicts.map((booking) => (
                <div 
                  key={booking.id}
                  className="p-2 rounded-md bg-muted/50 text-sm space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {booking.customerName}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {booking.productType === "group" ? "Gruppe" : "Privat"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{format(new Date(booking.date), "d. MMM yyyy", { locale: de })}</span>
                    {booking.timeStart && (
                      <>
                        <Clock className="h-3 w-3" />
                        <span>{formatTime(booking.timeStart, booking.timeEnd)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
