import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatIBAN, formatPaymentAmount, formatSCORReference, type PaymentSnapshot } from "@/lib/payments";

interface Props {
  snapshot: PaymentSnapshot;
  amount: number;
  invoiceNumber: string;
  dueDate?: string | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex text-sm py-[1mm]">
      <span className="w-[55mm] text-gray-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * SEPA or international bank-transfer instructions. Rendered from the invoice's
 * immutable payment snapshot — never from current settings.
 */
export function BankTransferInstructions({ snapshot, amount, invoiceNumber, dueDate }: Props) {
  const isSepa = snapshot.presentation_type === "sepa_transfer";
  const address = snapshot.account_holder_address;
  const addressLine = [address.street, address.houseNumber].filter(Boolean).join(" ");
  const cityLine = [address.zip, address.city, address.country].filter(Boolean).join(" ");

  const reference = snapshot.reference_type === "SCOR"
    ? formatSCORReference(snapshot.reference)
    : invoiceNumber;

  return (
    <section className="border border-gray-300 rounded p-4 mt-6" data-testid="bank-transfer-instructions">
      <h3 className="font-bold text-base mb-3">
        {isSepa ? "Zahlung per SEPA-Überweisung" : "Zahlung per internationaler Überweisung"}
      </h3>

      <Row label="Zahlungsempfänger" value={snapshot.account_holder} />
      {addressLine && <Row label="Adresse" value={addressLine} />}
      {cityLine && <Row label="" value={cityLine} />}
      {snapshot.bank_name && <Row label="Bank" value={snapshot.bank_name} />}
      <Row label="IBAN" value={formatIBAN(snapshot.iban)} />
      {snapshot.bic_swift && <Row label={isSepa ? "BIC" : "BIC / SWIFT"} value={snapshot.bic_swift} />}
      <Row label="Währung" value={snapshot.currency} />
      <Row label="Betrag" value={`${snapshot.currency} ${formatPaymentAmount(amount)}`} />
      <Row
        label={snapshot.reference_type === "SCOR" ? "Creditor Reference" : "Zahlungszweck"}
        value={reference}
      />
      {dueDate && (
        <Row label="Zahlbar bis" value={format(new Date(dueDate), "dd.MM.yyyy", { locale: de })} />
      )}
    </section>
  );
}
