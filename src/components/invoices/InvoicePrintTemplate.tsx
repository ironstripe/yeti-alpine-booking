import { forwardRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { QRPaymentSlip } from "./QRPaymentSlip";
import { SwissQRPaymentPart } from "./SwissQRPaymentPart";
import { BankTransferInstructions } from "./BankTransferInstructions";
import { formatCurrency } from "@/lib/swiss-qr-utils";
import { formatPhoneDisplay } from "@/lib/phone-utils";
import type { PaymentSnapshot } from "@/lib/payments";

interface InvoiceLineItem {
  description: string;
  details?: string;
  amount: number;
}

interface InvoicePrintTemplateProps {
  invoice: {
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    qr_reference: string;
    subtotal: number;
    discount: number;
    total: number;
    currency?: string;
    payment_snapshot?: PaymentSnapshot | null;
    payment_presentation_type?: string | null;
    is_legacy_payment?: boolean | null;
  };
  school: {
    name: string;
    street?: string;
    house_number?: string;
    zip?: string;
    city?: string;
    country?: string;
    phone?: string;
    email?: string;
    iban?: string;
    bic?: string;
    account_holder?: string;
    logo_url?: string;
  };
  customer: {
    first_name?: string;
    last_name: string;
    street?: string;
    house_number?: string;
    zip?: string;
    city?: string;
    country?: string;
  };
  ticketNumber: string;
  lineItems: InvoiceLineItem[];
}

export const InvoicePrintTemplate = forwardRef<HTMLDivElement, InvoicePrintTemplateProps>(
  ({ invoice, school, customer, ticketNumber, lineItems }, ref) => {
    const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');
    const snapshot = invoice.payment_snapshot ?? null;
    const presentation = snapshot?.presentation_type ?? invoice.payment_presentation_type ?? null;
    const schoolStreet = [school.street, school.house_number].filter(Boolean).join(' ');
    const customerStreet = [customer.street, customer.house_number].filter(Boolean).join(' ');

    return (
      <div
        ref={ref}
        className="bg-white text-black print:p-0"
        style={{ fontFamily: 'Helvetica, Arial, sans-serif', width: '210mm', margin: '0 auto' }}
      >
        {/* Print rules: A4 pages, payment part never split across pages */}
        <style>{`
          @page { size: A4; margin: 0; }
          @media print {
            .invoice-body { padding: 15mm 15mm 5mm 15mm; }
            .qr-bill { break-inside: avoid; page-break-inside: avoid; }
          }
        `}</style>

        <div className="invoice-body p-8 print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          {/* Logo & School Info */}
          <div>
            {school.logo_url ? (
              <img src={school.logo_url} alt={school.name} className="h-12 mb-2" />
            ) : (
              <h1 className="text-2xl font-bold">{school.name}</h1>
            )}
            <div className="text-sm text-gray-600">
              {schoolStreet && <p>{schoolStreet}</p>}
              {school.zip && school.city && <p>{school.zip} {school.city}</p>}
              {school.phone && <p>Tel: {formatPhoneDisplay(school.phone)}</p>}
              {school.email && <p>{school.email}</p>}
            </div>
          </div>

          {/* Invoice Meta */}
          <div className="text-right">
            <h2 className="text-3xl font-bold mb-4">RECHNUNG</h2>
            <table className="text-sm ml-auto">
              <tbody>
                <tr>
                  <td className="text-gray-600 pr-4">Rechnungsnummer:</td>
                  <td className="font-medium">{invoice.invoice_number}</td>
                </tr>
                <tr>
                  <td className="text-gray-600 pr-4">Rechnungsdatum:</td>
                  <td>{format(new Date(invoice.invoice_date), 'dd.MM.yyyy', { locale: de })}</td>
                </tr>
                <tr>
                  <td className="text-gray-600 pr-4">Ticket-Nr:</td>
                  <td>{ticketNumber}</td>
                </tr>
                <tr>
                  <td className="text-gray-600 pr-4">Zahlbar bis:</td>
                  <td className="font-medium">{format(new Date(invoice.due_date), 'dd.MM.yyyy', { locale: de })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Separator */}
        <hr className="border-gray-300 mb-6" />

        {/* Customer Address */}
        <div className="mb-8">
          <p className="text-sm text-gray-600 mb-1">Rechnungsadresse:</p>
          <div className="text-base">
            <p className="font-medium">{customerName}</p>
            {customerStreet && <p>{customerStreet}</p>}
            {customer.zip && customer.city && <p>{customer.zip} {customer.city}</p>}
            {customer.country && customer.country !== 'CH' && customer.country !== 'LI' && (
              <p>{customer.country}</p>
            )}
          </div>
        </div>

        {/* Line Items Table */}
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-2 text-sm font-bold w-12">Pos</th>
              <th className="text-left py-2 text-sm font-bold">Beschreibung</th>
              <th className="text-right py-2 text-sm font-bold w-32">Betrag {invoice.currency || 'CHF'}</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={index} className="border-b border-gray-200">
                <td className="py-3 align-top text-sm">{index + 1}</td>
                <td className="py-3 text-sm">
                  <p className="font-medium">{item.description}</p>
                  {item.details && <p className="text-gray-600 text-xs">{item.details}</p>}
                </td>
                <td className="py-3 text-right text-sm">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="pr-8 py-1">Zwischensumme</td>
                <td className="text-right py-1">{invoice.currency || 'CHF'} {formatCurrency(invoice.subtotal)}</td>
              </tr>
              {invoice.discount > 0 && (
                <tr>
                  <td className="pr-8 py-1">Rabatt</td>
                  <td className="text-right py-1 text-green-600">- {invoice.currency || 'CHF'} {formatCurrency(invoice.discount)}</td>
                </tr>
              )}
              <tr className="border-t border-gray-300">
                <td className="pr-8 py-2 font-bold text-base">TOTAL {invoice.currency || 'CHF'}</td>
                <td className="text-right py-2 font-bold text-base">{formatCurrency(invoice.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Non Swiss-QR payment instructions */}
        {snapshot && (presentation === 'sepa_transfer' || presentation === 'international_transfer') && (
          <BankTransferInstructions
            snapshot={snapshot}
            amount={invoice.total}
            invoiceNumber={invoice.invoice_number}
            dueDate={invoice.due_date}
          />
        )}

        {snapshot && presentation === 'swiss_qr' && (
          <p className="text-sm text-gray-600 mb-4">
            Bitte verwenden Sie den untenstehenden QR-Zahlteil für die Zahlung mit Ihrer Banking-App.
          </p>
        )}
        </div>

        {/* Swiss QR payment part — full width, never split */}
        {snapshot && presentation === 'swiss_qr' && (
          <>
            <div className="border-t border-dashed border-black relative mt-6">
              <span className="absolute -top-[2mm] left-2 bg-white px-1 text-[8pt]">✂</span>
            </div>
            <SwissQRPaymentPart
              snapshot={snapshot}
              amount={invoice.total}
              debtor={{
                name: customerName,
                street: customer.street,
                houseNumber: customer.house_number,
                zip: customer.zip,
                city: customer.city,
              }}
              additionalInfo={`Rechnung ${invoice.invoice_number}`}
            />
          </>
        )}

        {/* Legacy invoices issued before payment profiles keep their original slip */}
        {!snapshot && school.iban && (
          <div className="invoice-body p-8 print:p-0">
            <QRPaymentSlip
              creditor={{
                name: school.name,
                street: schoolStreet || '',
                zip: school.zip || '',
                city: school.city || '',
                country: (school.country as 'LI' | 'CH') || 'LI',
                iban: school.iban,
                accountHolder: school.account_holder,
              }}
              debtor={{
                name: customerName,
                street: customerStreet,
                zip: customer.zip,
                city: customer.city,
                country: customer.country,
              }}
              amount={invoice.total}
              currency="CHF"
              reference={invoice.qr_reference}
              message={`Rechnung ${invoice.invoice_number}`}
            />
          </div>
        )}
      </div>
    );
  }
);

InvoicePrintTemplate.displayName = "InvoicePrintTemplate";
