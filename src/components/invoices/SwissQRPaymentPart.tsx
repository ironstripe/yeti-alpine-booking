import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  formatIBAN,
  formatPaymentAmount,
  formatQRReference,
  formatSCORReference,
  type PaymentSnapshot,
} from "@/lib/payments";

interface Props {
  snapshot: PaymentSnapshot;
  amount: number;
  debtor?: {
    name: string;
    street?: string | null;
    houseNumber?: string | null;
    zip?: string | null;
    city?: string | null;
  };
  /** Additional information printed on the payment part (e.g. due date). */
  additionalInfo?: string;
}

function addressLines(a: { street?: string | null; houseNumber?: string | null; zip?: string | null; city?: string | null }) {
  const line1 = [a.street, a.houseNumber].filter(Boolean).join(" ");
  const line2 = [a.zip, a.city].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean);
}

function formatReference(snapshot: PaymentSnapshot): string {
  if (snapshot.reference_type === "QRR") return formatQRReference(snapshot.reference);
  if (snapshot.reference_type === "SCOR") return formatSCORReference(snapshot.reference);
  return "";
}

/**
 * Complete Swiss QR-bill payment part according to the SIX style guide:
 * 210 x 105 mm total, 62 mm receipt, 148 mm payment part,
 * 46 x 46 mm QR code with the official 7 x 7 mm Swiss cross.
 */
export function SwissQRPaymentPart({ snapshot, amount, debtor, additionalInfo }: Props) {
  const [qrSvg, setQrSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    if (!snapshot.qr_payload) return;
    QRCode.toString(snapshot.qr_payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 0,
    })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch((error) => console.error("QR-Code konnte nicht erzeugt werden:", error));
    return () => {
      cancelled = true;
    };
  }, [snapshot.qr_payload]);

  const creditor = snapshot.account_holder_address;
  const reference = formatReference(snapshot);
  const label = "text-[6pt] font-bold leading-[7pt]";
  const value = "text-[8pt] leading-[9pt]";
  const labelPP = "text-[8pt] font-bold leading-[9pt]";
  const valuePP = "text-[10pt] leading-[11pt]";

  return (
    <div className="qr-bill bg-white text-black" data-testid="swiss-qr-payment-part">
      <div className="qr-bill-inner flex" style={{ width: "210mm", height: "105mm", fontFamily: "Helvetica, Arial, sans-serif" }}>
        {/* Receipt — 62 mm */}
        <section
          className="border-r border-dashed border-black"
          style={{ width: "62mm", height: "105mm", padding: "5mm" }}
        >
          <p className="text-[11pt] font-bold leading-[12pt] mb-[3mm]">Empfangsschein</p>

          <p className={label}>Konto / Zahlbar an</p>
          <p className={value}>{formatIBAN(snapshot.iban)}</p>
          <p className={value}>{snapshot.account_holder}</p>
          {addressLines(creditor).map((line) => (
            <p key={line} className={value}>{line}</p>
          ))}

          {reference && (
            <>
              <p className={`${label} mt-[2mm]`}>Referenz</p>
              <p className={value}>{reference}</p>
            </>
          )}

          {debtor?.name && (
            <>
              <p className={`${label} mt-[2mm]`}>Zahlbar durch</p>
              <p className={value}>{debtor.name}</p>
              {addressLines(debtor).map((line) => (
                <p key={line} className={value}>{line}</p>
              ))}
            </>
          )}

          <div className="flex gap-[6mm] mt-[3mm]">
            <div>
              <p className={label}>Währung</p>
              <p className={value}>{snapshot.currency}</p>
            </div>
            <div>
              <p className={label}>Betrag</p>
              <p className={value}>{formatPaymentAmount(amount)}</p>
            </div>
          </div>

          <p className="text-[6pt] font-bold text-right mt-[4mm]">Annahmestelle</p>
        </section>

        {/* Payment part — 148 mm */}
        <section className="flex" style={{ width: "148mm", height: "105mm", padding: "5mm" }}>
          <div style={{ width: "51mm" }}>
            <p className="text-[11pt] font-bold leading-[12pt] mb-[3mm]">Zahlteil</p>

            {/* QR code — exactly 46 x 46 mm, Swiss cross 7 x 7 mm centered */}
            <div className="relative" style={{ width: "46mm", height: "46mm" }}>
              {qrSvg ? (
                <div
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div className="w-full h-full border border-black" />
              )}
              <div
                className="absolute bg-white flex items-center justify-center"
                style={{
                  width: "7mm",
                  height: "7mm",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  border: "0.4mm solid #FFFFFF",
                }}
              >
                <svg viewBox="0 0 19.6 19.6" style={{ width: "7mm", height: "7mm" }} aria-hidden="true">
                  <rect width="19.6" height="19.6" fill="#000" />
                  <rect x="8.3" y="4" width="3" height="11.6" fill="#FFF" />
                  <rect x="4" y="8.3" width="11.6" height="3" fill="#FFF" />
                  <rect x="0.7" y="0.7" width="18.2" height="18.2" fill="none" stroke="#FFF" strokeWidth="1.4" />
                </svg>
              </div>
            </div>

            <div className="mt-[5mm] flex gap-[6mm]">
              <div>
                <p className={labelPP}>Währung</p>
                <p className={valuePP}>{snapshot.currency}</p>
              </div>
              <div>
                <p className={labelPP}>Betrag</p>
                <p className={valuePP}>{formatPaymentAmount(amount)}</p>
              </div>
            </div>
          </div>

          <div style={{ width: "87mm", paddingLeft: "5mm" }}>
            <p className={labelPP}>Konto / Zahlbar an</p>
            <p className={valuePP}>{formatIBAN(snapshot.iban)}</p>
            <p className={valuePP}>{snapshot.account_holder}</p>
            {addressLines(creditor).map((line) => (
              <p key={line} className={valuePP}>{line}</p>
            ))}

            {reference && (
              <>
                <p className={`${labelPP} mt-[2mm]`}>Referenz</p>
                <p className={valuePP}>{reference}</p>
              </>
            )}

            {(snapshot.payment_message || additionalInfo) && (
              <>
                <p className={`${labelPP} mt-[2mm]`}>Zusätzliche Informationen</p>
                {snapshot.payment_message && <p className={valuePP}>{snapshot.payment_message}</p>}
                {additionalInfo && <p className={valuePP}>{additionalInfo}</p>}
              </>
            )}

            {debtor?.name && (
              <>
                <p className={`${labelPP} mt-[2mm]`}>Zahlbar durch</p>
                <p className={valuePP}>{debtor.name}</p>
                {addressLines(debtor).map((line) => (
                  <p key={line} className={valuePP}>{line}</p>
                ))}
              </>
            )}
          </div>
        </section>
      </div>

      {/* Separation notice (electronic PDFs) */}
      <p className="text-[6pt] text-center print:hidden">
        ✂ Vor der Einzahlung abzutrennen
      </p>
    </div>
  );
}
