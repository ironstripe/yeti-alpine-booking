/**
 * Server-side invoice issuance: the single path that creates invoices and
 * their immutable payment snapshot. Used by every invoice creation flow
 * (office UI, booking completion, website confirmation, hotel billing,
 * split invoices for shared private lessons, corrections/reissues).
 */
import {
  routePayment,
  type PaymentProfile,
  type RoutingResult,
} from "./payment-domain.ts";
import { loadInvoiceContent } from "./invoiceContentLoad.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export interface IssueInvoiceInput {
  ticketId: string;
  customerId?: string | null;
  billingPartnerId?: string | null;
  subtotal: number;
  discount?: number;
  total: number;
  currency?: string | null;
  dueDays?: number;
  overrideProfileId?: string | null;
  overrideReason?: string | null;
  actorUserId?: string | null;
  /** Reissue/correction: allow creating an additional invoice for the ticket. */
  allowAdditional?: boolean;
}

export interface IssueInvoiceResult {
  ok: boolean;
  invoice?: Record<string, unknown>;
  routing?: RoutingResult;
  error?: string;
  error_code?: string;
}

interface Debtor {
  name: string;
  street?: string | null;
  houseNumber?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  source: "billing_partner" | "customer" | "ticket_master_customer";
}

export async function resolveDebtor(
  supabase: Client,
  input: { ticketId: string; customerId?: string | null; billingPartnerId?: string | null },
): Promise<{ debtor?: Debtor; customerId?: string | null; paymentDueDate?: string | null; error?: string; error_code?: string }> {
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, customer_id, billing_partner_id, payment_due_date")
    .eq("id", input.ticketId)
    .maybeSingle();

  if (ticketError || !ticket) return { error_code: "TICKET_LOOKUP_FAILED", error: "Buchung konnte nicht geladen werden. Rechnung nicht erstellt." };

  const partnerId = input.billingPartnerId ?? ticket?.billing_partner_id ?? null;
  if (partnerId) {
    const { data: partner } = await supabase
      .from("billing_partners")
      .select("name, street, house_number, zip, city, country")
      .eq("id", partnerId)
      .maybeSingle();
    if (partner) {
      return {
        paymentDueDate: ticket.payment_due_date ?? null,
        customerId: input.customerId ?? ticket?.customer_id ?? null,
        debtor: {
          name: partner.name,
          street: partner.street,
          houseNumber: partner.house_number,
          zip: partner.zip,
          city: partner.city,
          country: partner.country,
          source: "billing_partner",
        },
      };
    }
  }

  const customerId = input.customerId ?? ticket?.customer_id ?? null;
  if (!customerId) return { error: "Für diese Buchung ist keine Rechnungsempfängerin bzw. kein Rechnungsempfänger hinterlegt." };

  const { data: customer } = await supabase
    .from("customers")
    .select("id, first_name, last_name, organization_name, street, house_number, zip, city, country")
    .eq("id", customerId)
    .maybeSingle();
  if (!customer) return { error: "Kundendaten konnten nicht geladen werden." };

  const name = customer.organization_name?.trim()
    || [customer.first_name, customer.last_name].filter(Boolean).join(" ");

  return {
    paymentDueDate: ticket.payment_due_date ?? null,
    customerId,
    debtor: {
      name,
      street: customer.street,
      houseNumber: customer.house_number,
      zip: customer.zip,
      city: customer.city,
      country: customer.country,
      source: input.customerId ? "customer" : "ticket_master_customer",
    },
  };
}

export async function loadPaymentProfiles(supabase: Client): Promise<PaymentProfile[]> {
  const { data } = await supabase
    .from("payment_profiles")
    .select("*")
    .eq("is_archived", false);
  return (data ?? []) as PaymentProfile[];
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function issueInvoice(
  supabase: Client,
  input: IssueInvoiceInput,
): Promise<IssueInvoiceResult> {
  // 1. Idempotency — never create a second open invoice for the same ticket.
  //    An open invoice wins; a draft left behind by an interrupted issuance is resumed.
  let resumeDraft: Record<string, any> | null = null;
  if (!input.allowAdditional) {
    const { data: existing } = await supabase
      .from("invoices")
      .select("*")
      .eq("ticket_id", input.ticketId)
      .not("status", "in", '("cancelled","void")')
      .order("created_at", { ascending: false });
    const rows = (existing ?? []) as Array<Record<string, any>>;
    const issuedRow = rows.find((r) => r.status !== "draft");
    if (issuedRow) return { ok: true, invoice: issuedRow };
    resumeDraft = rows[0] ?? null;
  }

  // 2. Billing party
  const { debtor, customerId, paymentDueDate, error: debtorError, error_code } = await resolveDebtor(supabase, input);
  if (!debtor) return { ok: false, error_code: error_code ?? "NO_DEBTOR", error: debtorError };

  // 3. Currency — from the invoice/ticket, never inferred from country.
  const currency = (input.currency ?? "CHF").toUpperCase();
  const dueDate = resumeDraft ? resumeDraft.due_date : paymentDueDate ?? addDays(input.dueDays ?? 14);

  // 4. Dry-run routing before anything is written.
  const profiles = await loadPaymentProfiles(supabase);
  const preflight = routePayment({
    billingCountry: debtor.country,
    currency,
    invoiceIdentifier: "PREFLIGHT-1",
    dueDate,
    profiles,
    overrideProfileId: input.overrideProfileId,
    overrideReason: input.overrideReason,
  });
  if (!preflight.ok) {
    return { ok: false, error_code: preflight.error_code, error: preflight.error };
  }

  // 5. Create the invoice so the invoice number exists (reference is derived from it).
  //    Only the exact invoice-number unique conflict (legacy unserialized number
  //    generation under concurrency) is retried, a bounded number of times.
  let created: Record<string, any> | null = resumeDraft;
  for (let attempt = 0; !created; attempt++) {
    const { data, error: createError } = await supabase
      .from("invoices")
      .insert({
        ticket_id: input.ticketId,
        customer_id: customerId,
        subtotal: input.subtotal,
        discount: input.discount ?? 0,
        total: input.total,
        currency,
        qr_reference: "",
        due_date: dueDate,
        status: "draft",
        created_by: input.actorUserId ?? null,
      })
      .select("*")
      .single();
    if (!createError) { created = data; break; }
    const numberConflict = createError.code === "23505" && String(createError.message ?? "").includes("invoices_invoice_number_key");
    if (!numberConflict || attempt >= 4) return { ok: false, error_code: "INSERT_FAILED", error: createError.message };
  }
  if (!created) return { ok: false, error_code: "INSERT_FAILED", error: "no invoice row" };
  if (Number(created.total) !== Number(input.total) || (created.customer_id ?? null) !== (customerId ?? null)) {
    return { ok: false, error_code: "DRAFT_MISMATCH", error: "Vorhandener Rechnungsentwurf passt nicht zu Betrag/Kunde" };
  }

  // 6. Route with the final invoice number.
  const routing = routePayment({
    billingCountry: debtor.country,
    currency,
    invoiceIdentifier: created.invoice_number || created.id,
    invoiceNumber: created.invoice_number,
    dueDate,
    amount: Number(input.total),
    debtor: {
      name: debtor.name,
      street: debtor.street,
      houseNumber: debtor.houseNumber,
      zip: debtor.zip,
      city: debtor.city,
      country: debtor.country,
    },
    profiles,
    overrideProfileId: input.overrideProfileId,
    overrideReason: input.overrideReason,
  });

  if (!routing.ok) {
    // Never delete a frozen draft when current configuration can no longer route it.
    if (resumeDraft?.payment_snapshot != null) {
      return { ok: false, error_code: "DRAFT_PAYMENT_MISMATCH", error: "Eingefrorene Zahlungsdaten passen nicht zur aktuellen Zahlungsroute. Rechnungsentwurf unverändert." };
    }
    await supabase.from("invoices").delete().eq("id", created.id);
    return { ok: false, error_code: routing.error_code, error: routing.error };
  }

  const { profile, snapshot } = routing;
  if (!profile || !snapshot) return { ok: false, error_code: "SNAPSHOT_FAILED", error: "Zahlungsdaten fehlen." };
  const paymentFields = {
    qr_reference: routing.reference || "",
    payment_profile_id: profile.id,
    payment_presentation_type: routing.presentation_type,
    payment_reference_type: routing.reference_type,
    payment_reference: routing.reference || null,
    payment_payload_version: snapshot.payload_version,
    payment_routing_reason: routing.routing_reason,
    payment_profile_overridden: !!input.overrideProfileId,
    payment_profile_override_reason: input.overrideProfileId ? input.overrideReason ?? null : null,
    payment_override_by: input.overrideProfileId ? input.actorUserId ?? null : null,
    is_legacy_payment: false,
  };
  if (resumeDraft?.payment_snapshot != null) {
    const frozen = resumeDraft.payment_snapshot;
    // Compare the complete production snapshot, including QR amount/debtor payload.
    // Its creation timestamp is historical, not a fresh routing decision.
    const snapshotMatches = typeof frozen === "object" && !Array.isArray(frozen)
      && Object.keys(frozen).length === Object.keys(snapshot).length
      && typeof frozen.snapshot_created_at === "string" && Number.isFinite(Date.parse(frozen.snapshot_created_at))
      && Object.entries(snapshot).every(([key, value]) => {
        if (key === "snapshot_created_at") return true;
        if (key === "account_holder_address") {
          const address = frozen[key];
          return address && typeof address === "object" && !Array.isArray(address)
            && Object.keys(address).length === Object.keys(snapshot.account_holder_address).length
            && Object.entries(snapshot.account_holder_address).every(([field, expected]) => address[field] === expected);
        }
        return frozen[key] === value;
      });
    const columnsMatch = Object.entries(paymentFields).every(([key, value]) => resumeDraft?.[key] === value)
      && resumeDraft.currency === snapshot.currency;
    if (!snapshotMatches || !columnsMatch) {
      return { ok: false, error_code: "DRAFT_PAYMENT_MISMATCH", error: "Eingefrorene Zahlungsdaten passen nicht zur aktuellen Zahlungsroute. Rechnungsentwurf unverändert." };
    }
  }

  // R1: immutable versioned content snapshot, frozen once at issuance (a resumed draft keeps its own).
  let contentSnapshot: unknown = resumeDraft?.content_snapshot ?? null;
  if (contentSnapshot == null) {
    try { contentSnapshot = await loadInvoiceContent(supabase, input.ticketId); }
    catch (_e) {
      if (!resumeDraft) await supabase.from("invoices").delete().eq("id", created.id).eq("status", "draft");
      return { ok: false, error_code: "CONTENT_FAILED", error: "Rechnungspositionen konnten nicht vollständig gelesen werden. Es wurde keine Rechnung ausgestellt." };
    }
  }

  const { data: issued, error: updateError } = await supabase
    .from("invoices")
    .update({
      ...paymentFields,
      content_snapshot: contentSnapshot,
      payment_snapshot: resumeDraft?.payment_snapshot ?? snapshot,
      issued_at: new Date().toISOString(),
      status: "open",
    })
    .eq("id", created.id)
    .select("*")
    .single();
  if (updateError) {
    // A concurrent issuer already opened an invoice for this ticket: drop our draft, return theirs.
    if (!input.allowAdditional && updateError.code === "23505" && String(updateError.message ?? "").includes("invoices_open_ticket_unique")) {
      await supabase.from("invoices").delete().eq("id", created.id).eq("status", "draft");
      const { data: winner } = await supabase.from("invoices").select("*").eq("ticket_id", input.ticketId).eq("status", "open").maybeSingle();
      if (winner) return { ok: true, invoice: winner };
    }
    return { ok: false, error_code: "SNAPSHOT_FAILED", error: updateError.message };
  }

  // 7. Audit trail
  await supabase.from("ticket_history").insert({
    ticket_id: input.ticketId,
    event_type: "invoice_issued",
    created_by_user_id: input.actorUserId ?? null,
    details: {
      invoice_id: issued.id,
      invoice_number: issued.invoice_number,
      billing_party_source: debtor.source,
      billing_country: debtor.country,
      currency,
      presentation_type: routing.presentation_type,
      profile_id: profile.id,
      profile_name: profile.name,
      reference_type: routing.reference_type,
      routing_reason: routing.routing_reason,
      overridden: !!input.overrideProfileId,
      override_reason: input.overrideReason ?? null,
    },
  });

  return { ok: true, invoice: issued, routing };
}

/** Preview the routing decision without creating anything. */
export async function previewRouting(
  supabase: Client,
  input: { ticketId: string; customerId?: string | null; billingPartnerId?: string | null; currency?: string | null; overrideProfileId?: string | null; overrideReason?: string | null },
): Promise<{ ok: boolean; debtor?: Debtor; routing?: RoutingResult; compatibleProfiles?: PaymentProfile[]; error?: string; error_code?: string }> {
  const { debtor, error } = await resolveDebtor(supabase, input);
  if (!debtor) return { ok: false, error_code: "NO_DEBTOR", error };
  const profiles = await loadPaymentProfiles(supabase);
  const routing = routePayment({
    billingCountry: debtor.country,
    currency: (input.currency ?? "CHF").toUpperCase(),
    invoiceIdentifier: "PREVIEW-1",
    dueDate: addDays(14),
    profiles,
    overrideProfileId: input.overrideProfileId,
    overrideReason: input.overrideReason ?? "Vorschau",
  });
  return {
    ok: routing.ok,
    debtor,
    routing,
    compatibleProfiles: profiles.filter(
      (p) => p.presentation_type === routing.presentation_type && p.currency === (input.currency ?? "CHF").toUpperCase() && p.is_active && !p.is_archived,
    ),
    error: routing.error,
    error_code: routing.error_code,
  };
}
