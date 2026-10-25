// B07-P2: pre-save price summary for the canonical office private create, taken ONLY from the server
// quote (product tariffs + same-day discount rule or explicit manual override). No client price math.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { paCreateQuote, type CreateQuote, type DiscountOverride, type PaSlot } from "@/lib/privateAppointmentsApi";

const chf = (n: number) => `CHF ${Number(n).toFixed(2)}`;

export interface PrivateServerQuoteProps {
  productId: string | null;
  persons: number;
  /** B07-P3: payer + saved participant ids; their already booked same-day private lessons count. */
  customerId?: string | null;
  knownParticipantIds?: string[];
  slots: PaSlot[] | null;
  /** Plan problem to show instead of a price (nothing is quoted then). */
  planError: string | null;
  override: DiscountOverride | undefined;
  onQuote: (q: CreateQuote | null, busy: boolean) => void;
}

export function PrivateServerQuote({ productId, persons, customerId, knownParticipantIds, slots, planError, override, onQuote }: PrivateServerQuoteProps) {
  const known = (knownParticipantIds ?? []).join(",");
  const request = useMemo(() => (productId && slots && slots.length > 0 && persons > 0 ? {
    product_id: productId,
    persons,
    ...(customerId && known ? { customer_id: customerId, participant_ids: known.split(",") } : {}),
    appointments: slots.map(({ date, time_start, time_end }) => ({ date, time_start, time_end })),
    ...(override ? { discount_override: { percent: override.percent } } : {}),
  } : null), [productId, persons, customerId, known, slots, override]);

  const q = useQuery({
    queryKey: ["pa-create-quote", request],
    queryFn: () => paCreateQuote(request!),
    enabled: !!request,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    onQuote(request && q.data && !q.isFetching ? q.data : null, !!request && q.isFetching);
  }, [request, q.data, q.isFetching, onQuote]);

  const problem = planError ?? (!productId ? "Bitte ein Privatstunden-Produkt wählen." : null)
    ?? (q.error instanceof Error ? q.error.message : null);

  return (
    <Card data-testid="private-server-quote">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Preis gemäss Produkttarif</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {problem ? (
          <p role="alert" className="text-destructive">{problem}</p>
        ) : q.isFetching || !q.data ? (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preis wird vom Server berechnet …</p>
        ) : (
          <QuoteBody quote={q.data} slots={slots ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

function QuoteBody({ quote, slots }: { quote: CreateQuote; slots: PaSlot[] }) {
  const rule = quote.discount_rule;
  return (
    <>
      <ul className="space-y-2">
        {quote.items.map((it) => {
          const s = slots[it.index];
          const label = s ? `${format(parseISO(s.date), "EEE dd.MM.", { locale: de })} ${s.time_start}–${s.time_end}` : `Lektion ${it.index + 1}`;
          return (
            <li key={it.index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5" data-testid="quote-line">
              <span className="min-w-0">{label} · {it.persons} Person(en)</span>
              <span className="tabular-nums whitespace-nowrap">{chf(it.price)}</span>
              {Number(it.discount_amount) > 0 && (
                <span className="w-full text-xs text-muted-foreground">
                  {it.discount_source === "manual"
                    ? `Manueller Rabatt ${Number(it.discount_percent)} %: −${chf(it.discount_amount)}`
                    : `Tagesrabatt für ${it.eligible} von ${it.persons} Person(en): −${chf(it.discount_amount)}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t pt-2">
        <div className="flex justify-between"><span>Zwischensumme</span><span className="tabular-nums whitespace-nowrap">{chf(quote.gross_total)}</span></div>
        {quote.discount_source === "automatic" && (
          <div className="flex justify-between text-muted-foreground">
            <span>Automatischer Tagesrabatt {Number(rule.percent)} % (ab {rule.threshold_minutes / 60} Std. pro Person und Tag)</span>
            <span className="tabular-nums whitespace-nowrap">−{chf(quote.discount_total)}</span>
          </div>
        )}
        {quote.discount_source === "manual" && (
          <div className="flex justify-between text-muted-foreground">
            <span>Manueller Rabatt (ersetzt den automatischen Tagesrabatt)</span>
            <span className="tabular-nums whitespace-nowrap">−{chf(quote.discount_total)}</span>
          </div>
        )}
        {quote.discount_source === "manual" && Number(quote.automatic_discount_total) > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="override-note">
            Ohne manuellen Rabatt gälte der Tagesrabatt von −{chf(quote.automatic_discount_total)}. Rabatte werden nicht addiert.
          </p>
        )}
        <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums whitespace-nowrap" data-testid="quote-total">{chf(quote.total)}</span></div>
      </div>
    </>
  );
}
