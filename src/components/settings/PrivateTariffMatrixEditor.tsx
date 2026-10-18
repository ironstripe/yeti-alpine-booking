import { useEffect, useMemo, useState, forwardRef, useImperativeHandle } from "react";
import { ChevronDown, ChevronUp, Info, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatPriceCHF } from "@/lib/pricing-utils";
import {
  TARIFF_DURATIONS_MINUTES, TARIFF_PERSONS,
  buildTariffSavePayload, cellKey, toCellMap, validateTariffPrice,
} from "@/lib/privateTariffMatrix";
import {
  useBcOriginalPrivateTariffs, usePrivateProductTariffs, useSavePrivateProductTariffs,
} from "@/hooks/usePrivateProductTariffs";

export interface PrivateTariffMatrixHandle {
  /** Saves changed cells if dirty. Returns true when nothing blocks closing. */
  saveIfDirty: () => Promise<boolean>;
  isDirty: () => boolean;
  isSaving: () => boolean;
}

interface Props {
  productId: string;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Editable effective-price matrix (duration x persons) for BC-linked private
 * products. BC originals are shown read-only as collapsible comparison and as
 * grey fallback values until an effective price is saved.
 */
export const PrivateTariffMatrixEditor = forwardRef<PrivateTariffMatrixHandle, Props>(
  function PrivateTariffMatrixEditor({ productId, onDirtyChange }, ref) {
    const effective = usePrivateProductTariffs(productId);
    const originals = useBcOriginalPrivateTariffs(productId);
    const save = useSavePrivateProductTariffs(productId);

    const [edited, setEdited] = useState<Map<string, number | null> | null>(null);
    const [showOriginals, setShowOriginals] = useState(false);

    const persisted = useMemo(() => toCellMap(effective.data ?? []), [effective.data]);
    const originalMap = useMemo(() => toCellMap(originals.data ?? []), [originals.data]);

    // Until the user types, the edited map mirrors the persisted effective prices.
    const current = edited ?? persisted;

    useEffect(() => {
      if (effective.data) setEdited(null);
    }, [effective.data]);

    const dirty = useMemo(() => buildTariffSavePayload(persisted, edited) !== null, [persisted, edited]);
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

    useImperativeHandle(ref, () => ({
      isDirty: () => dirty,
      isSaving: () => save.isPending,
      saveIfDirty: async () => {
        const payload = buildTariffSavePayload(persisted, edited);
        if (!payload) return true;
        try {
          await save.mutateAsync(payload);
          return true;
        } catch {
          return false;
        }
      },
    }), [dirty, persisted, edited, save]);

    const setCell = (duration: number, persons: number, raw: string) => {
      const value = raw.trim() === "" ? null : Number(raw);
      const next = new Map(edited);
      next.set(cellKey(duration, persons), value);
      setEdited(next);
    };

    if (effective.isPending || originals.isPending) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Tarife laden …
        </div>
      );
    }
    if (effective.error || originals.error) {
      return (
        <p role="alert" className="text-sm text-destructive">
          Tarife konnten nicht geladen werden. Bitte Berechtigung und Verbindung prüfen.
        </p>
      );
    }

    const hasEffective = persisted.size > 0;

    return (
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Effektive Verkaufspreise</strong> (CHF) pro Dauer und Personenzahl.
            Leere Felder nutzen vorerst den Booking-Corner-Quelltarif als Anzeige.
            Diese Preise steuern noch nicht die Buchungs- oder Rechnungslogik.
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dauer</TableHead>
                {TARIFF_PERSONS.map((n) => (
                  <TableHead key={n} className="whitespace-nowrap">
                    {n} {n === 1 ? "Person" : "Pers."}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {TARIFF_DURATIONS_MINUTES.map((minutes) => (
                <TableRow key={minutes}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {minutes / 60} {minutes === 60 ? "Stunde" : "Stunden"}
                  </TableCell>
                  {TARIFF_PERSONS.map((n) => {
                    const key = cellKey(minutes, n);
                    const value = edited.get(key);
                    const fallback = originalMap.get(key);
                    const errorMsg = validateTariffPrice(value ?? null);
                    return (
                      <TableCell key={n} className="p-1">
                        <Input
                          aria-label={`Preis ${minutes / 60}h ${n} ${n === 1 ? "Person" : "Personen"}`}
                          type="number"
                          min={0}
                          step={0.05}
                          className="h-8 w-24"
                          value={value ?? ""}
                          placeholder={fallback !== undefined ? fallback.toFixed(0) : "–"}
                          onChange={(e) => setCell(minutes, n, e.target.value)}
                        />
                        {errorMsg && value !== null && (
                          <p className="mt-1 text-xs text-destructive">{errorMsg}</p>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!hasEffective && (
          <p className="text-xs text-muted-foreground">
            Noch keine effektiven Preise gespeichert – graue Platzhalter zeigen die
            unveränderten Booking-Corner-Quelltarife.
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-0 text-muted-foreground"
          onClick={() => setShowOriginals((v) => !v)}
        >
          {showOriginals ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          Booking-Corner-Quelltarife (schreibgeschützt)
        </Button>
        {showOriginals && (
          <div className="overflow-x-auto rounded-md border bg-muted/30 p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dauer</TableHead>
                  {TARIFF_PERSONS.map((n) => (
                    <TableHead key={n} className="whitespace-nowrap">{n} Pers.</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {TARIFF_DURATIONS_MINUTES.map((minutes) => (
                  <TableRow key={minutes}>
                    <TableCell className="whitespace-nowrap font-medium">{minutes / 60} h</TableCell>
                    {TARIFF_PERSONS.map((n) => {
                      const orig = originalMap.get(cellKey(minutes, n));
                      return (
                        <TableCell key={n} className="whitespace-nowrap text-muted-foreground">
                          {orig !== undefined ? formatPriceCHF(orig) : "–"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  },
);
