// #36 containment: no payment provider is connected, so a caller-supplied
// payment_reference is NOT proof of payment. Online payment requests are refused
// before any database read/write or finalization. Invoice flow is unaffected.
// Remove only when a provider-verified payment check (server-side) replaces this.

export const ONLINE_PAYMENT_PROVIDER_CONNECTED = false as const;

export type GateResult =
  | { allowed: true }
  | { allowed: false; status: 503; body: { success: false; code: "payment_provider_unavailable"; error: string } };

export function onlinePaymentGate(paymentMethod: string): GateResult {
  if (paymentMethod === "online" && !ONLINE_PAYMENT_PROVIDER_CONNECTED) {
    return {
      allowed: false,
      status: 503,
      body: {
        success: false,
        code: "payment_provider_unavailable",
        error: "Onlinezahlung ist derzeit nicht verfügbar. Bitte wählen Sie Zahlung per Rechnung.",
      },
    };
  }
  return { allowed: true };
}
