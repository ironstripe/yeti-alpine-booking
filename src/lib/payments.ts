/**
 * Frontend access to the shared payment domain.
 * The implementation lives in supabase/functions/_shared/payment-domain.ts so
 * that Edge Functions and the UI use exactly the same rules. The server stays
 * authoritative — the UI only mirrors validation for immediate feedback.
 */
export * from "../../supabase/functions/_shared/payment-domain";
