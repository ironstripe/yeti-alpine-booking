import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useIsMobileScheduler } from "@/hooks/use-touch-device";

/** Visible alternative to Ctrl/Cmd+Click for picking several lesson slots. */
export function MultiSelectToggle() {
  const { multiSelectMode, setMultiSelectMode, state } = useSchedulerSelection();
  const isMobileScheduler = useIsMobileScheduler();
  if (isMobileScheduler) return null;

  return (
    <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs">
      <Switch
        id="multi-select-mode"
        checked={multiSelectMode}
        onCheckedChange={setMultiSelectMode}
        aria-label="Mehrere Termine auswählen"
      />
      <Label htmlFor="multi-select-mode" className="text-xs font-medium cursor-pointer">
        Mehrere Termine auswählen
      </Label>
      <span className="text-muted-foreground">
        oder Strg/⌘ + Klick
        {state.selections.length > 0 && ` · ${state.selections.length} ausgewählt`}
      </span>
    </div>
  );
}
