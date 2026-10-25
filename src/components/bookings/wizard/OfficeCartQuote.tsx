// B07b: combined server quote for a multi-item cart (office-booking quote = dry run of the create).
// Every line, discount, total and the same-day context come from the server; nothing is computed here.
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BookingWizardState } from "@/contexts/BookingWizardContext";
import { fetchLunchProduct, lunchContextKey } from "@/hooks/useLunchProduct";
import { buildFinalization } from "@/hooks/useCreateBooking";
import { buildOfficeCart, currentCartItems, itemState, officeSubmissionKey, type OfficeCart } from "@/lib/officeCartRequest";
import { officeQuote, OfficeBookingError, type OfficeQuote } from "@/lib/officeBookingApi";
import { staffGroupHasLunch } from "@/lib/staffGroupPayload";

const chf = (n: number | null | undefined) => `CHF ${Number(n ?? 0).toFixed(2)}`;
const day = (d: string | null) => (d ? format(parseISO(d), "EE dd.MM.yyyy", { locale: de }) : "");
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

export interface OfficeCartReady { cart: OfficeCart; key: string; quote: OfficeQuote }

export function OfficeCartQuote({ state, onReady }: { state: BookingWizardState; onReady: (r: OfficeCartReady | null, busy: boolean) => void }) {
  // B09: season-aware lunch product per booked group product + dates (server re-resolves identically).
  const lunchContexts = useMemo(() => currentCartItems(state)
    .filter((it) => it.productType === "group" && staffGroupHasLunch(itemState(state, it)) && it.groupPlan?.server)
    .map((it) => ({ productId: it.groupPlan!.server!.productId, dates: it.selectedDates })), [state]);
  const lunch = useQuery({
    queryKey: ["office-cart-lunch", lunchContexts.map((c) => lunchContextKey(c).join("|"))],
    queryFn: async () => Object.fromEntries(await Promise.all(lunchContexts.map(async (c) => [lunchContextKey(c).join("|"), await fetchLunchProduct(c)]))),
    staleTime: 60_000,
  });

  const built = useMemo(() => {
    if (lunch.isLoading) return null;
    const map = (lunch.data ?? {}) as Record<string, { id: string; price: number } | null>;
    return buildOfficeCart(state, (productId, dates) => map[lunchContextKey({ productId, dates }).join("|")] ?? null, buildFinalization(state));
  }, [state, lunch.isLoading, lunch.data]);
  const cart = built?.kind === "ready" ? built.cart : null;
  const key = useMemo(() => officeSubmissionKey(state), [state.cartItems[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useQuery({
    queryKey: ["office-cart-quote", key, cart],
    queryFn: () => officeQuote(key, cart!),
    enabled: !!cart,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    onReady(cart && q.data && !q.isFetching ? { cart, key, quote: q.data.quote } : null, !!cart && q.isFetching);
  }, [cart, key, q.data, q.isFetching, onReady]);

  const names = useMemo(() => {
    const out: Record<string, string> = {};
    if (built?.kind === "ready") for (const [id, ref] of Object.entries(built.refs)) {
      const p = state.selectedParticipants.find((x) => x.id === id);
      out[ref] = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : ref;
    }
    return out;
  }, [built, state.selectedParticipants]);

  const problem = built?.kind === "error" ? built.message
    : q.error instanceof OfficeBookingError ? q.error.message
    : q.error instanceof Error ? "Preis konnte nicht berechnet werden. Bitte erneut versuchen." : null;

  return (
    <Card data-testid="office-cart-quote">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Gesamtpreis aller Positionen</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => void q.refetch()} disabled={!cart || q.isFetching} data-testid="office-quote-refresh">
          <RefreshCw className="mr-1 h-4 w-4" /> Preis neu berechnen
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {problem ? (
          <p role="alert" className="text-destructive" data-testid="office-quote-error">{problem}</p>
        ) : !built || q.isFetching || !q.data ? (
          <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preis wird vom Server berechnet …</p>
        ) : (
          <QuoteBody quote={q.data.quote} names={names} items={cart!.items.length} />
        )}
      </CardContent>
    </Card>
  );
}

function QuoteBody({ quote, names, items }: { quote: OfficeQuote; names: Record<string, string>; items: number }) {
  const who = (refs: string[] | null | undefined) => (refs ?? []).map((r) => names[r] ?? r).join(", ");
  const group = quote.lines.filter((l) => l.item_type !== "private");
  return (
    <div className="space-y-3">
      {Array.from({ length: items }, (_, i) => {
        const priv = quote.private.filter((p) => p.item === i);
        if (priv.length === 0) return null;
        return (
          <div key={`p${i}`} className="space-y-1">
            <p className="font-medium">Position {i + 1} · Privatunterricht</p>
            <ul className="space-y-1">
              {priv.map((p) => (
                <li key={`${p.item}-${p.index}`} data-testid="office-quote-line" className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span>{day(p.date)} {hm(p.time_start)}–{hm(p.time_end)} · {who(p.participants)}</span>
                  <span className="tabular-nums whitespace-nowrap">
                    {p.discount_percent > 0 && <span className="mr-2 text-muted-foreground line-through">{chf(p.gross)}</span>}
                    {chf(p.net)}
                  </span>
                  {p.discount_percent > 0 && (
                    <span className="w-full text-xs text-muted-foreground">
                      {p.discount_source === "manual" ? `Manueller Rabatt ${p.discount_percent}%${p.discount_reason ? ` (${p.discount_reason})` : ""} – ersetzt den Tagesrabatt`
                        : `Tagesrabatt ${p.discount_percent}% für ${p.eligible} von ${p.persons} Person(en) (ab 4 Std. gleiche Person am gleichen Tag)`}
                    </span>
                  )}
                  {p.discount_source === "manual" && p.discount_percent === 0 && (
                    <span className="w-full text-xs text-muted-foreground">Manuell 0% – kein Tagesrabatt</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {group.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">Gruppenkurse</p>
          <ul className="space-y-1">
            {group.map((l, k) => (
              <li key={`g${k}`} data-testid="office-quote-line" className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>{l.item_type === "lunch" ? "Mittagessen & Betreuung" : l.group_name ?? "Gruppenkurs"} · {who(l.participants)} · {day(l.date)}{l.end_date && l.end_date !== l.date ? ` – ${day(l.end_date)}` : ""}</span>
                <span className="tabular-nums whitespace-nowrap">{chf(l.line_total ?? l.unit_price)}</span>
                {Number(l.discount_percent) > 0 && (
                  <span className="w-full text-xs text-muted-foreground">Rabatt {l.discount_percent}%{l.discount_reason ? ` (${l.discount_reason})` : ""}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Number(quote.existing_same_day_appointments) > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="office-quote-existing">
          Für den Tagesrabatt mitgezählt: {quote.existing_same_day_appointments} bereits gebuchte Privatlektion(en) derselben Person(en) am selben Tag. Bestehende Buchungen werden nicht neu berechnet.
        </p>
      )}
      <div className="flex justify-between border-t pt-2 font-semibold">
        <span>Total</span><span className="tabular-nums" data-testid="office-quote-total">{chf(quote.total)}</span>
      </div>
    </div>
  );
}
