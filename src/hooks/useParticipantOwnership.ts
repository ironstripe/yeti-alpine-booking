// Which linked EXISTING participants belong to a different customer than the chosen payer.
// The server only books participants of the payer (no silent re-parenting/copying), so the office
// must resolve these explicitly before submit.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ForeignParticipant { id: string; name: string; ownerId: string | null; ownerName: string | null }

const isNewPerson = (id: string) => id.startsWith("local-") || id.startsWith("guest-");

export function useParticipantOwnership(linkedIds: string[], customerId: string | null) {
  const existing = linkedIds.filter((id) => !isNewPerson(id)).sort();
  const query = useQuery({
    queryKey: ["participant-ownership", customerId, existing],
    enabled: !!customerId && existing.length > 0,
    queryFn: async (): Promise<ForeignParticipant[]> => {
      const { data, error } = await supabase
        .from("customer_participants")
        .select("id, first_name, last_name, customer_id, customer:customers(first_name, last_name)")
        .in("id", existing);
      if (error) throw error;
      const found = new Map((data ?? []).map((p) => [p.id, p]));
      return existing
        .map((id) => found.get(id) ?? null)
        .map((p, i) => ({ p, id: existing[i] }))
        .filter(({ p }) => !p || p.customer_id !== customerId)
        .map(({ p, id }) => {
          const owner = p?.customer as { first_name: string | null; last_name: string | null } | null;
          return {
            id,
            name: p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : "Unbekannter Teilnehmer",
            ownerId: p?.customer_id ?? null,
            ownerName: owner ? [owner.first_name, owner.last_name].filter(Boolean).join(" ") : null,
          };
        });
    },
  });
  return { foreign: query.data ?? [], isLoading: query.isLoading && existing.length > 0 && !!customerId, isError: query.isError };
}
