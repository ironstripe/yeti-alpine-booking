import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { CircleHelp } from "lucide-react";

/** Visible alternative to Ctrl/Cmd+Click for picking several lesson slots. */
export function MultiSelectToggle() {
  const { multiSelectMode, setMultiSelectMode, state } = useSchedulerSelection();

  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-xs">
      <Switch
        id="multi-select-mode"
        checked={multiSelectMode}
        onCheckedChange={setMultiSelectMode}
        aria-label="Mehrere Termine auswählen"
      />
      <Label htmlFor="multi-select-mode" className="text-xs font-medium cursor-pointer">
        Mehrfachauswahl
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="icon-action text-muted-foreground"
            aria-label="Mehrfachauswahl: Strg oder Befehlstaste plus Klick oder rechte Maustaste"
          >
            <CircleHelp className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] px-3 py-2 text-xs" side="bottom">
          Strg/⌘ + Klick oder rechte Maustaste
        </PopoverContent>
      </Popover>
      {state.selections.length > 0 && (
        <span className="text-muted-foreground">{state.selections.length} ausgewählt</span>
      )}
    </div>
  );
}
