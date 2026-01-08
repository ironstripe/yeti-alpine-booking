import { useEffect, useState } from "react";
import { formatQRReference, formatIBAN, formatCurrency, buildSwissQRPayload, type SwissQRCodeData } from "@/lib/swiss-qr-utils";
import QRCode from "qrcode";

interface QRPaymentSlipProps {
  creditor: {
    name: string;
    street: string;
    zip: string;
    city: string;
    country: 'LI' | 'CH';
    iban: string;
    accountHolder?: string;
  };
  debtor?: {
    name: string;
    street?: string;
    zip?: string;
    city?: string;
    country?: string;
  };
  amount: number;
  currency?: 'CHF' | 'EUR';
  reference: string;
  message?: string;
}

export function QRPaymentSlip({
  creditor,
  debtor,
  amount,
  currency = 'CHF',
  reference,
  message,
}: QRPaymentSlipProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  useEffect(() => {
    const generateQR = async () => {
      const qrData: SwissQRCodeData = {
        creditorIBAN: creditor.iban,
        creditorName: creditor.accountHolder || creditor.name,
        creditorStreet: creditor.street,
        creditorCity: creditor.city,
        creditorPostal: creditor.zip,
        creditorCountry: creditor.country,
        amount,
        currency,
        debtorName: debtor?.name,
        debtorStreet: debtor?.street,
        debtorCity: debtor?.city,
        debtorPostal: debtor?.zip,
        debtorCountry: debtor?.country,
        referenceType: 'QRR',
        reference,
        message,
      };

      const payload = buildSwissQRPayload(qrData);
      
      try {
        const dataUrl = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 0,
          width: 166, // 46mm at 92 DPI
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error("Failed to generate QR code:", error);
      }
    };

    generateQR();
  }, [creditor, debtor, amount, currency, reference, message]);

  return (
    <div className="border-t-2 border-dashed border-black pt-4 mt-8">
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold">QR-RECHNUNG</h3>
      </div>

      <div className="flex gap-6">
        {/* Left: QR Code */}
        <div className="flex-shrink-0">
          {qrCodeDataUrl ? (
            <div className="border border-black p-2">
              <img 
                src={qrCodeDataUrl} 
                alt="Swiss QR Code" 
                className="w-[166px] h-[166px]"
              />
            </div>
          ) : (
            <div className="w-[166px] h-[166px] border border-black flex items-center justify-center bg-muted">
              <span className="text-xs text-muted-foreground">QR-Code wird generiert...</span>
            </div>
          )}
          <p className="text-[10px] text-center mt-1">Swiss QR Code</p>
        </div>

        {/* Right: Payment Info */}
        <div className="flex-1 text-sm space-y-3">
          {/* Creditor */}
          <div>
            <p className="font-bold text-xs uppercase text-muted-foreground">Konto / Zahlbar an</p>
            <p>{formatIBAN(creditor.iban)}</p>
            <p>{creditor.accountHolder || creditor.name}</p>
            <p>{creditor.street}</p>
            <p>{creditor.zip} {creditor.city}</p>
          </div>

          {/* Reference */}
          <div>
            <p className="font-bold text-xs uppercase text-muted-foreground">Referenz</p>
            <p className="font-mono">{formatQRReference(reference)}</p>
          </div>

          {/* Debtor */}
          {debtor && (
            <div>
              <p className="font-bold text-xs uppercase text-muted-foreground">Zahlbar durch</p>
              <p>{debtor.name}</p>
              {debtor.street && <p>{debtor.street}</p>}
              {debtor.city && <p>{debtor.zip} {debtor.city}</p>}
            </div>
          )}

          {/* Amount */}
          <div className="flex gap-8">
            <div>
              <p className="font-bold text-xs uppercase text-muted-foreground">Währung</p>
              <p>{currency}</p>
            </div>
            <div>
              <p className="font-bold text-xs uppercase text-muted-foreground">Betrag</p>
              <p className="font-bold">{formatCurrency(amount)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground mt-4 text-center">
        Bitte scannen Sie den QR-Code mit Ihrer Banking-App für die einfache Zahlung.
      </p>
    </div>
  );
}
