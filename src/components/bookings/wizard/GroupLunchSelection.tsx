import type { ComponentProps } from "react";
import { groupLunchEligible } from "@/lib/groupLunch";
import { Button } from "@/components/ui/button";
import { LunchSupervisionAddon } from "./LunchSupervisionAddon";

type Props = Omit<ComponentProps<typeof LunchSupervisionAddon>, "lunchPricePerDay"> & {
  plan: Parameters<typeof groupLunchEligible>[0];
  lunchPricePerDay: number | null;
  isLoading?: boolean;
};

/** Keep rejected selections removable; never silently drop an office choice. */
export function GroupLunchSelection({ plan, lunchPricePerDay, isLoading, ...props }: Props) {
  const eligible = groupLunchEligible(plan, props.selectedDates);
  const hasSelections = props.participants.some(p => (props.lunchSelections[p.id]?.length ?? 0) > 0);
  if (eligible && lunchPricePerDay !== null) {
    return <LunchSupervisionAddon {...props} lunchPricePerDay={lunchPricePerDay} />;
  }
  if (!hasSelections && (!eligible || isLoading)) return null;
  return (
    <div className="space-y-2 border-l-2 border-warning pl-3" role="alert">
      <p className="text-sm text-muted-foreground">
        {eligible
          ? "Mittagessen und Betreuung: ein aktives Produkt zu CHF 30 pro Person und Tag fehlt."
          : "Mittagsauswahl noch vorhanden – Mittagessen und Betreuung sind nur bei einem Ganztages-Gruppenkurs möglich."}
      </p>
      {hasSelections && (
        <Button type="button" variant="outline" size="sm" onClick={() => {
          props.participants.forEach(p => props.onLunchDaysChange(p.id, []));
        }}>
          Mittagsauswahl entfernen
        </Button>
      )}
    </div>
  );
}