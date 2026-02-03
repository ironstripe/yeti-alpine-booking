import { useState, useMemo } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, X, Clock, Calendar, User, Repeat } from "lucide-react";
import {
  usePendingAbsences,
  useApproveAbsence,
  useRejectAbsence,
  type PendingAbsence,
} from "@/hooks/useAbsenceApproval";
import {
  usePendingRecurringBlocks,
  useApproveRecurringBlock,
  useRejectRecurringBlock,
  type PendingRecurringBlock,
} from "@/hooks/useRecurringBlocks";
import { useAbsenceConflicts } from "@/hooks/useAbsenceConflicts";
import { ConflictWarningBadge } from "./ConflictWarningBadge";

const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  organization: "Organisation",
  office_duty: "Bürodienst",
  other: "Sonstiges",
};

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function PendingAbsencesList() {
  const { data: pendingAbsences = [], isLoading: isLoadingAbsences } = usePendingAbsences();
  const { data: pendingBlocks = [], isLoading: isLoadingBlocks } = usePendingRecurringBlocks();
  const approveAbsence = useApproveAbsence();
  const rejectAbsence = useRejectAbsence();
  const approveBlock = useApproveRecurringBlock();
  const rejectBlock = useRejectRecurringBlock();

  const totalPending = pendingAbsences.length + pendingBlocks.length;

  // Prepare absence data for conflict check
  const absencesForConflictCheck = useMemo(() => 
    pendingAbsences.map(a => ({
      id: a.id,
      instructorId: a.instructorId,
      startDate: a.startDate,
      endDate: a.endDate,
    })),
    [pendingAbsences]
  );

  const { data: conflictMap = {} } = useAbsenceConflicts(absencesForConflictCheck);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedAbsence, setSelectedAbsence] = useState<PendingAbsence | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<PendingRecurringBlock | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleApproveAbsence = async (absence: PendingAbsence) => {
    await approveAbsence.mutateAsync(absence.id);
  };

  const handleRejectAbsenceClick = (absence: PendingAbsence) => {
    setSelectedAbsence(absence);
    setSelectedBlock(null);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleApproveBlock = async (block: PendingRecurringBlock) => {
    await approveBlock.mutateAsync(block.id);
  };

  const handleRejectBlockClick = (block: PendingRecurringBlock) => {
    setSelectedBlock(block);
    setSelectedAbsence(null);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectionReason.trim()) return;
    
    if (selectedAbsence) {
      await rejectAbsence.mutateAsync({
        absenceId: selectedAbsence.id,
        reason: rejectionReason.trim(),
      });
    } else if (selectedBlock) {
      await rejectBlock.mutateAsync({
        blockId: selectedBlock.id,
        reason: rejectionReason.trim(),
      });
    }
    
    setRejectDialogOpen(false);
    setSelectedAbsence(null);
    setSelectedBlock(null);
    setRejectionReason("");
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (start === end) {
      return format(startDate, "d. MMM yyyy", { locale: de });
    }
    return `${format(startDate, "d. MMM", { locale: de })} - ${format(endDate, "d. MMM yyyy", { locale: de })}`;
  };

  const formatWeekdays = (weekdays: number[]) => {
    return [...weekdays].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join(", ");
  };

  const isLoading = isLoadingAbsences || isLoadingBlocks;

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <Bell className="h-4 w-4 mr-2" />
            Anträge
            {totalPending > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {totalPending}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Ausstehende Anträge
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="absences" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="absences" className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Abwesenheiten
                {pendingAbsences.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {pendingAbsences.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="recurring" className="flex items-center gap-1">
                <Repeat className="h-3.5 w-3.5" />
                Wiederkehrend
                {pendingBlocks.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {pendingBlocks.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="absences" className="mt-4">
              <ScrollArea className="h-[calc(100vh-220px)] pr-4">
                {isLoadingAbsences ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="animate-pulse bg-muted rounded-lg p-4 h-24" />
                    ))}
                  </div>
                ) : pendingAbsences.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Check className="h-12 w-12 mb-4 opacity-50" />
                    <p>Keine ausstehenden Abwesenheitsanträge</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingAbsences.map((absence) => (
                      <div
                        key={absence.id}
                        className="border rounded-lg p-4 space-y-3"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{absence.instructorName}</span>
                          </div>
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                            {ABSENCE_LABELS[absence.type] || absence.type}
                          </Badge>
                        </div>

                        {/* Date Range */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDateRange(absence.startDate, absence.endDate)}</span>
                        </div>

                        {/* Conflict Warning */}
                        {conflictMap[absence.id] && conflictMap[absence.id].length > 0 && (
                          <ConflictWarningBadge conflicts={conflictMap[absence.id]} />
                        )}

                        {/* Reason */}
                        {absence.reason && (
                          <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                            "{absence.reason}"
                          </p>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => handleApproveAbsence(absence)}
                            disabled={approveAbsence.isPending}
                            className="flex-1"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Genehmigen
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRejectAbsenceClick(absence)}
                            disabled={rejectAbsence.isPending}
                            className="flex-1"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Ablehnen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="recurring" className="mt-4">
              <ScrollArea className="h-[calc(100vh-220px)] pr-4">
                {isLoadingBlocks ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="animate-pulse bg-muted rounded-lg p-4 h-24" />
                    ))}
                  </div>
                ) : pendingBlocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Check className="h-12 w-12 mb-4 opacity-50" />
                    <p>Keine ausstehenden wiederkehrenden Blöcke</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="border rounded-lg p-4 space-y-3"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{block.instructor_name}</span>
                          </div>
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                            <Repeat className="h-3 w-3 mr-1" />
                            Wiederkehrend
                          </Badge>
                        </div>

                        {/* Time and Days */}
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>{block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{formatWeekdays(block.weekdays)}</span>
                          </div>
                          <p>
                            Ab {format(new Date(block.valid_from), "d. MMM yyyy", { locale: de })}
                            {block.valid_until 
                              ? ` bis ${format(new Date(block.valid_until), "d. MMM yyyy", { locale: de })}`
                              : " (bis Saisonende)"}
                          </p>
                        </div>

                        {/* Reason */}
                        {block.reason && (
                          <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                            "{block.reason}"
                          </p>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => handleApproveBlock(block)}
                            disabled={approveBlock.isPending}
                            className="flex-1"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Genehmigen
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRejectBlockClick(block)}
                            disabled={rejectBlock.isPending}
                            className="flex-1"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Ablehnen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedAbsence ? "Abwesenheit ablehnen" : "Wiederkehrenden Block ablehnen"}
            </DialogTitle>
            <DialogDescription>
              Bitte gib einen Grund für die Ablehnung an. Diese Nachricht wird dem Lehrer mitgeteilt.
            </DialogDescription>
          </DialogHeader>

          {selectedAbsence && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium">{selectedAbsence.instructorName}</p>
                <p className="text-muted-foreground">
                  {ABSENCE_LABELS[selectedAbsence.type]}: {formatDateRange(selectedAbsence.startDate, selectedAbsence.endDate)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Ablehnungsgrund</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="z.B. Zu kurzfristig, bereits Buchungen vorhanden..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {selectedBlock && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium">{selectedBlock.instructor_name}</p>
                <p className="text-muted-foreground">
                  {selectedBlock.start_time.slice(0, 5)} - {selectedBlock.end_time.slice(0, 5)}, {formatWeekdays(selectedBlock.weekdays)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Ablehnungsgrund</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="z.B. Zeitraum nicht möglich, Konflikte mit Gruppenkursen..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectionReason.trim() || rejectAbsence.isPending || rejectBlock.isPending}
            >
              {(rejectAbsence.isPending || rejectBlock.isPending) ? "Ablehnen..." : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
