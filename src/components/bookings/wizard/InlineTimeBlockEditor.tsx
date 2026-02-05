import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Plus, Trash2, Clock, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useBookingWizard, type TimeBlock } from "@/contexts/BookingWizardContext";

// Available time slots (15-minute intervals)
const TIME_OPTIONS = [
  "08:00", "08:15", "08:30", "08:45",
  "09:00", "09:15", "09:30", "09:45",
  "10:00", "10:15", "10:30", "10:45",
  "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45",
  "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45",
  "15:00", "15:15", "15:30", "15:45",
  "16:00", "16:15", "16:30", "16:45",
  "17:00", "17:15", "17:30", "17:45",
  "18:00",
];

interface InlineTimeBlockEditorProps {
  dateStr: string;
  baseStartTime: string;
  baseEndTime: string;
  duration: number | null;
}

export function InlineTimeBlockEditor({
  dateStr,
  baseStartTime,
  baseEndTime,
  duration,
}: InlineTimeBlockEditorProps) {
  const { state, addTimeBlock, removeTimeBlock, updateTimeBlock } = useBookingWizard();
  const [isAdding, setIsAdding] = useState(false);
  const [newStartTime, setNewStartTime] = useState("14:00");
  const [newEndTime, setNewEndTime] = useState("16:00");

  const dayBlocks = state.dayTimeOverrides[dateStr] || [];
  const hasOverrides = dayBlocks.length > 0;

  // If no overrides, show base time as the single block
  const blocksToShow: TimeBlock[] = hasOverrides
    ? dayBlocks
    : [{ id: "base", startTime: baseStartTime, endTime: baseEndTime }];

  // Check if a block differs from base time
  const isBlockOverride = (block: TimeBlock) => {
    if (block.id === "base") return false;
    return block.startTime !== baseStartTime || block.endTime !== baseEndTime;
  };

  const handleAddBlock = () => {
    // If this is the first override, we need to first add the base block
    if (!hasOverrides) {
      // Add the base as the first block, then add the new one
      addTimeBlock(dateStr, baseStartTime, baseEndTime, state.instructorId);
    }
    addTimeBlock(dateStr, newStartTime, newEndTime, state.instructorId);
    setIsAdding(false);
    setNewStartTime("14:00");
    setNewEndTime("16:00");
  };

  const handleRemoveBlock = (blockId: string) => {
    // Don't allow removing the last block
    if (dayBlocks.length <= 1 && blockId !== "base") {
      return;
    }
    removeTimeBlock(dateStr, blockId);
  };

  const handleUpdateTime = (blockId: string, field: "startTime" | "endTime", value: string) => {
    const block = dayBlocks.find((b) => b.id === blockId);
    if (!block) return;

    const newStart = field === "startTime" ? value : block.startTime;
    const newEnd = field === "endTime" ? value : block.endTime;
    updateTimeBlock(dateStr, blockId, newStart, newEnd, block.instructorId);
  };

  return (
    <div className="space-y-2">
      {blocksToShow.map((block, index) => (
        <div
          key={block.id}
          className={`flex items-center gap-2 text-sm ${
            index > 0 ? "ml-6" : ""
          }`}
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          
          {/* Editable time selects for override blocks */}
          {block.id !== "base" ? (
            <>
              <Select
                value={block.startTime}
                onValueChange={(v) => handleUpdateTime(block.id, "startTime", v)}
              >
                <SelectTrigger className="h-7 w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">-</span>
              <Select
                value={block.endTime}
                onValueChange={(v) => handleUpdateTime(block.id, "endTime", v)}
              >
                <SelectTrigger className="h-7 w-[80px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <span className="text-muted-foreground">
              {block.startTime} - {block.endTime}
            </span>
          )}

          {/* Override badges */}
          {isBlockOverride(block) && (
            <Badge variant="outline" className="text-xs border-warning/50 bg-warning/10 text-warning-foreground">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Angepasst
            </Badge>
          )}
          {index > 0 && (
            <Badge variant="outline" className="text-xs border-primary/50 bg-primary/10 text-primary">
              +Block
            </Badge>
          )}

          {/* Remove button for non-base blocks */}
          {block.id !== "base" && dayBlocks.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemoveBlock(block.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {/* Add block form */}
      {isAdding ? (
        <div className="ml-6 flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-dashed">
          <Select value={newStartTime} onValueChange={setNewStartTime}>
            <SelectTrigger className="h-8 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-sm">bis</span>
          <Select value={newEndTime} onValueChange={setNewEndTime}>
            <SelectTrigger className="h-8 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs" onClick={handleAddBlock}>
            Hinzufügen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setIsAdding(false)}
          >
            Abbrechen
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="ml-6 h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Zeitblock hinzufügen
        </Button>
      )}
    </div>
  );
}
