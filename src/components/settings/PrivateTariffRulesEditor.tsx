// B07-P: editor for product-configured private tariffs (exact blocks + hourly windows).
// Shown when privateTariffsLive() (B07 release); saves only via product-private-tariff-rules.
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePrivateTariffRules, useSavePrivateTariffRules } from "@/hooks/usePrivateTariffRules";
import { validateTariffRules, type TariffRule } from "@/lib/privateTariffRules";

const blank = (kind: TariffRule["rule_kind"]): TariffRule => ({
  rule_kind: kind, window_start: "", window_end: "", price_chf: 0, extra_person_chf: 0,
  max_persons: 4, max_block_minutes: null, office_only: false, provenance: "",
});

export function PrivateTariffRulesEditor({ productId }: { productId: string }) {
  const { data, isPending, error } = usePrivateTariffRules(productId);
  const save = useSavePrivateTariffRules(productId);
  const [rules, setRules] = useState<TariffRule[]>([]);
  useEffect(() => { if (data) setRules(data.rules); }, [data]);
  const errors = useMemo(() => validateTariffRules(rules), [rules]);

  if (isPending) return <p className="text-sm text-muted-foreground">Tarife werden geladen…</p>;
  if (error) return <p className="text-sm text-destructive">Tarife nicht verfügbar. Ohne Tarif ist dieses Produkt nicht buchbar.</p>;

  const set = (i: number, patch: Partial<TariffRule>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (v: string) => (v === "" ? NaN : Number(v));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        «Fixer Block» gilt nur bei exakt gleicher Start- und Endzeit. «Stundentarif» gilt pro volle Stunde im Zeitfenster.
        Ohne passenden Tarif ist eine Buchung nicht möglich. Revision {data?.revision ?? 0}.
      </p>
      {rules.map((r, i) => (
        <div key={i} className="grid grid-cols-2 md:grid-cols-9 gap-2 items-end rounded-md border p-2">
          <label className="text-xs col-span-2 md:col-span-1">Art
            <select aria-label={`Art ${i + 1}`} className="block w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={r.rule_kind} onChange={(e) => set(i, { rule_kind: e.target.value as TariffRule["rule_kind"], max_block_minutes: null })}>
              <option value="exact_block">Fixer Block</option>
              <option value="hourly">Stundentarif</option>
            </select>
          </label>
          <label className="text-xs">Von<Input aria-label={`Von ${i + 1}`} type="time" step={300} value={r.window_start} onChange={(e) => set(i, { window_start: e.target.value })} /></label>
          <label className="text-xs">Bis<Input aria-label={`Bis ${i + 1}`} type="time" step={300} value={r.window_end} onChange={(e) => set(i, { window_end: e.target.value })} /></label>
          <label className="text-xs">CHF (1 Pers.)<Input aria-label={`Preis ${i + 1}`} type="number" min={0} value={Number.isFinite(r.price_chf) ? r.price_chf : ""} onChange={(e) => set(i, { price_chf: num(e.target.value) })} /></label>
          <label className="text-xs">+ CHF/Person<Input aria-label={`Zuschlag ${i + 1}`} type="number" min={0} value={Number.isFinite(r.extra_person_chf) ? r.extra_person_chf : ""} onChange={(e) => set(i, { extra_person_chf: num(e.target.value) })} /></label>
          <label className="text-xs">Max. Pers.<Input aria-label={`Max Personen ${i + 1}`} type="number" min={1} max={5} value={r.max_persons} onChange={(e) => set(i, { max_persons: num(e.target.value) })} /></label>
          <label className="text-xs">Max. Dauer (Min.)
            <Input aria-label={`Max Dauer ${i + 1}`} type="number" min={60} step={60} disabled={r.rule_kind !== "hourly"}
              value={r.max_block_minutes ?? ""} onChange={(e) => set(i, { max_block_minutes: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
          <label className="text-xs flex flex-col gap-1">Nur Büro<Switch aria-label={`Nur Büro ${i + 1}`} checked={r.office_only} onCheckedChange={(v) => set(i, { office_only: v })} /></label>
          <div className="flex gap-1 items-end col-span-2 md:col-span-1">
            <Input aria-label={`Quelle ${i + 1}`} placeholder="Quelle" value={r.provenance} onChange={(e) => set(i, { provenance: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Tarif ${i + 1} entfernen`} onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {errors.get(i) && <p className="col-span-full text-xs text-destructive">{errors.get(i)}</p>}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setRules((rs) => [...rs, blank("exact_block")])}><Plus className="h-4 w-4 mr-1" />Fixer Block</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setRules((rs) => [...rs, blank("hourly")])}><Plus className="h-4 w-4 mr-1" />Stundentarif</Button>
        <Button type="button" size="sm" disabled={errors.size > 0 || save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ expectedRevision: data?.revision ?? 0, rules });
              toast.success("Tarife gespeichert");
            } catch (e) { toast.error((e as Error).message); }
          }}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Tarife speichern
        </Button>
      </div>
    </div>
  );
}
