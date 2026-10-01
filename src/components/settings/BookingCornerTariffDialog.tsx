import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatPriceCHF } from "@/lib/pricing-utils";
import type { ProductWithTiers } from "@/hooks/useProducts";

type Tariff = {
  source_id: string;
  source_family: string;
  day_count: number;
  duration_minutes: number;
  persons_per_lesson: number;
  price_chf: number;
};

interface Props {
  product: ProductWithTiers | null;
  onOpenChange: (open: boolean) => void;
}

export function BookingCornerTariffDialog({ product, onOpenChange }: Props) {
  const { data: tariffs, isPending, error } = useQuery({
    queryKey: ["bc-product-tariffs", product?.id],
    enabled: !!product,
    queryFn: async (): Promise<Tariff[]> => {
      const { data, error: fetchError } = await supabase
        .from("bc_product_tariff_sources")
        .select("source_id,source_family,day_count,duration_minutes,persons_per_lesson,price_chf")
        .eq("product_id", product!.id)
        .eq("import_status", "draft")
        .order("duration_minutes", { ascending: true })
        .order("day_count", { ascending: true })
        .order("persons_per_lesson", { ascending: true });
      if (fetchError) throw fetchError;
      return data ?? [];
    },
  });

  const privateProduct = product?.type === "private";
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Booking-Corner-Quelltarife: {product?.name}</DialogTitle>
          <DialogDescription>
            Entwurf für Winter 26/27 in CHF. Diese Tarife sind dokumentiert, aber noch nicht mit der Buchungs-, Rechnungs- oder Webpreislogik verknüpft. Das Produkt bleibt gesperrt.
          </DialogDescription>
        </DialogHeader>
        {isPending ? <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Tarife laden ...</div> : error ? (
          <p role="alert" className="text-destructive">Tarife konnten nicht geladen werden. Bitte Berechtigung und Verbindung prüfen.</p>
        ) : !tariffs?.length ? (
          <p className="text-muted-foreground">Für dieses Produkt sind keine Quelltarife hinterlegt.</p>
        ) : privateProduct ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Dauer</TableHead>
                {[1, 2, 3, 4, 5].map(n => <TableHead key={n} className="whitespace-nowrap">{n} {n === 1 ? "Person" : "Personen"}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {[...new Set(tariffs.map(t => t.duration_minutes))].sort((a, b) => a - b).map(minutes => (
                  <TableRow key={minutes}>
                    <TableCell className="whitespace-nowrap font-medium">{minutes / 60} {minutes === 60 ? "Stunde" : "Stunden"}</TableCell>
                    {[1, 2, 3, 4, 5].map(n => {
                      const row = tariffs.find(t => t.duration_minutes === minutes && t.persons_per_lesson === n);
                      return <TableCell key={n} className="whitespace-nowrap" title={row ? `Booking-Corner Tarif ${row.source_id}` : "Kein Quelltarif"}>{row ? formatPriceCHF(Number(row.price_chf)) : "–"}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Tage</TableHead><TableHead>Pro Tag</TableHead><TableHead>Quelltarif (kumulativ)</TableHead></TableRow></TableHeader>
            <TableBody>{tariffs.map(row => (
              <TableRow key={row.source_id} title={`Booking-Corner Tarif ${row.source_id}`}>
                <TableCell>{row.day_count}</TableCell><TableCell>{row.duration_minutes / 60} h</TableCell>
                <TableCell>{formatPriceCHF(Number(row.price_chf))}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
