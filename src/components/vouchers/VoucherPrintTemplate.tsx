import { forwardRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { Voucher } from "@/hooks/useVouchers";

interface VoucherPrintTemplateProps {
  voucher: Voucher;
}

export const VoucherPrintTemplate = forwardRef<HTMLDivElement, VoucherPrintTemplateProps>(
  ({ voucher }, ref) => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: "CHF",
        minimumFractionDigits: 2,
      }).format(amount);
    };

    return (
      <div ref={ref} className="print-voucher hidden print:block bg-white text-black p-8">
        <style>{`
          @media print {
            .print-voucher { display: block !important; }
            @page { margin: 1cm; }
          }
        `}</style>

        <div className="max-w-md mx-auto border-2 border-gray-800 rounded-lg p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-2xl mb-2">❄️ SCHNEESPORTSCHULE MALBUN ❄️</div>
            <div className="border-t-2 border-b-2 border-gray-800 py-2 my-4">
              <span className="text-xl font-bold tracking-widest">GUTSCHEIN</span>
            </div>
          </div>

          {/* Value */}
          <div className="text-center my-8">
            <div className="text-4xl font-bold">
              {formatCurrency(voucher.original_value)}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2 text-center mb-6">
            <div>
              <span className="text-gray-600">Code:</span>{" "}
              <span className="font-mono font-bold">{voucher.code}</span>
            </div>
            <div>
              <span className="text-gray-600">Gültig bis:</span>{" "}
              <span className="font-medium">
                {format(new Date(voucher.expiry_date), "dd. MMMM yyyy", { locale: de })}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-400 my-6"></div>

          {/* Recipient */}
          {(voucher.buyer_name || voucher.recipient_name) && (
            <div className="text-center mb-4">
              <span className="text-gray-600">Für:</span>{" "}
              <span className="font-medium">{voucher.recipient_name || voucher.buyer_name}</span>
            </div>
          )}

          {/* Terms */}
          <div className="text-center text-sm text-gray-600 mt-6">
            <p>Einlösbar für alle Kurse und Produkte der</p>
            <p>Schneesportschule Malbun.</p>
            <p className="mt-2 font-medium">www.schneesportschule.li</p>
          </div>
        </div>

        {/* Personal Message */}
        {voucher.recipient_message && (
          <div className="mt-8 text-center">
            <div className="border-t border-dashed border-gray-400 pt-6">
              <p className="text-gray-600 text-sm mb-2">Persönliche Nachricht:</p>
              <p className="italic">"{voucher.recipient_message}"</p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

VoucherPrintTemplate.displayName = "VoucherPrintTemplate";
