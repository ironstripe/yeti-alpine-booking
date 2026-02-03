import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useUpdateOfficeHourBlock, useDeleteOfficeHourBlock } from "@/hooks/useOfficeHourBlocks";
import { format, parse } from "date-fns";
import { de } from "date-fns/locale";
import { Building, Calendar as CalendarIcon, Clock, FileText, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface OfficeHoursDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: {
    id: string;
    date: string;
    timeStart: string;
    timeEnd: string;
    note: string | null;
  };
}

// Generate time options in 15-minute intervals
const generateTimeOptions = () => {
  const options: string[] = [];
  for (let hour = 9; hour <= 16; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === 16 && minute > 0) break;
      options.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

export function OfficeHoursDetailDialog({
  open,
  onOpenChange,
  block,
}: OfficeHoursDetailDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editTimeStart, setEditTimeStart] = useState(block.timeStart);
  const [editTimeEnd, setEditTimeEnd] = useState(block.timeEnd);
  const [editNote, setEditNote] = useState(block.note || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateBlock = useUpdateOfficeHourBlock();
  const deleteBlock = useDeleteOfficeHourBlock();

  // Reset state when block changes or dialog opens
  useEffect(() => {
    if (open) {
      setEditDate(parse(block.date, "yyyy-MM-dd", new Date()));
      setEditTimeStart(block.timeStart);
      setEditTimeEnd(block.timeEnd);
      setEditNote(block.note || "");
      setIsEditing(false);
    }
  }, [open, block]);

  const handleSave = async () => {
    if (!editDate) return;

    await updateBlock.mutateAsync({
      id: block.id,
      date: format(editDate, "yyyy-MM-dd"),
      timeStart: editTimeStart,
      timeEnd: editTimeEnd,
      note: editNote || null,
    });

    setIsEditing(false);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await deleteBlock.mutateAsync(block.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setEditDate(parse(block.date, "yyyy-MM-dd", new Date()));
    setEditTimeStart(block.timeStart);
    setEditTimeEnd(block.timeEnd);
    setEditNote(block.note || "");
    setIsEditing(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
      setIsEditing(false);
    }
    onOpenChange(isOpen);
  };

  const formattedDate = editDate
    ? format(editDate, "EEEE, d. MMMM yyyy", { locale: de })
    : block.date;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Bürodienst
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            {isEditing ? (
              <>
                {/* Edit Mode */}
                <div className="space-y-2">
                  <Label>Datum</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !editDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editDate ? format(editDate, "PPP", { locale: de }) : "Datum wählen"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editDate}
                        onSelect={setEditDate}
                        locale={de}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Von</Label>
                    <Select value={editTimeStart} onValueChange={setEditTimeStart}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bis</Label>
                    <Select value={editTimeEnd} onValueChange={setEditTimeEnd}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.filter((t) => t > editTimeStart).map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notiz (optional)</Label>
                  <Textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="z.B. Telefonbereitschaft"
                    rows={2}
                  />
                </div>
              </>
            ) : (
              <>
                {/* View Mode */}
                <div className="flex items-start gap-3">
                  <CalendarIcon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Datum</p>
                    <p className="text-sm text-muted-foreground">{formattedDate}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Uhrzeit</p>
                    <p className="text-sm text-muted-foreground">
                      {block.timeStart} - {block.timeEnd}
                    </p>
                  </div>
                </div>

                {block.note && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Notiz</p>
                      <p className="text-sm text-muted-foreground">{block.note}</p>
                    </div>
                  </div>
                )}

                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="text-muted-foreground">
                    Dieser Bürodienst blockiert den Zeitraum für Buchungen.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-row gap-2 sm:justify-between">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateBlock.isPending}
                >
                  {updateBlock.isPending ? "Speichern..." : "Speichern"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Löschen
                </Button>
                <Button variant="default" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Bearbeiten
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showDeleteConfirm && (
        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Bürodienst löschen"
          description="Möchtest du diesen Bürodienst wirklich löschen?"
          confirmLabel="Löschen"
          variant="destructive"
          onConfirm={handleDelete}
          isLoading={deleteBlock.isPending}
        />
      )}
    </>
  );
}
