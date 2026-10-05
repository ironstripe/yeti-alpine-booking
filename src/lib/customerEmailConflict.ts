import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/**
 * True only for the server's UNIQUE(email) violation on customers.
 * Other 23505 conflicts (e.g. customers_customer_number_key) are NOT a duplicate email.
 */
export function isCustomerEmailUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  if (e.code !== "23505") return false;
  const text = `${typeof e.message === "string" ? e.message : ""} ${typeof e.details === "string" ? e.details : ""}`;
  return text.includes("customers_email_key");
}

export type EmailConflictLookup =
  | { status: "found"; customer: Tables<"customers"> }
  | { status: "unavailable"; reason: "not_found" | "archived" | "merged" }
  | { status: "lookup_failed" };

/** Exact, RLS-respecting read of the customer owning the submitted email. */
export async function lookupCustomerByExactEmail(email: string): Promise<EmailConflictLookup> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (error) return { status: "lookup_failed" };
    if (!data) return { status: "unavailable", reason: "not_found" };
    if (data.merged_into_id) return { status: "unavailable", reason: "merged" };
    if (data.is_archived) return { status: "unavailable", reason: "archived" };
    return { status: "found", customer: data };
  } catch {
    return { status: "lookup_failed" };
  }
}
