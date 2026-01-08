import { forwardRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { QRPaymentSlip } from "./QRPaymentSlip";
import { formatCurrency } from "@/lib/swiss-qr-utils";

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
  };
  school: {
    name: string;
    street?: string;
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
    
    return (
      <div ref={ref} className="bg-white text-black p-8 max-w-[210mm] mx-auto print:p-0 print:max-w-none" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
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
              {school.street && <p>{school.street}</p>}
              {school.zip && school.city && <p>{school.zip} {school.city}</p>}
              {school.phone && <p>Tel: {school.phone}</p>}
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
            {customer.street && <p>{customer.street}</p>}
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
              <th className="text-right py-2 text-sm font-bold w-32">Betrag CHF</th>
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
                <td className="text-right py-1">CHF {formatCurrency(invoice.subtotal)}</td>
              </tr>
              {invoice.discount > 0 && (
                <tr>
                  <td className="pr-8 py-1">Rabatt</td>
                  <td className="text-right py-1 text-green-600">- CHF {formatCurrency(invoice.discount)}</td>
                </tr>
              )}
              <tr className="border-t border-gray-300">
                <td className="pr-8 py-2 font-bold text-base">TOTAL CHF</td>
                <td className="text-right py-2 font-bold text-base">{formatCurrency(invoice.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payment Info */}
        <div className="mb-4 text-sm">
          <p className="font-bold mb-2">Zahlungsinformationen:</p>
          {school.iban && <p>IBAN: {school.iban}</p>}
          {school.bic && <p>BIC: {school.bic}</p>}
          <p>Referenz: {invoice.invoice_number}</p>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Bitte verwenden Sie den untenstehenden QR-Code für die einfache Zahlung mit Ihrer Banking-App.
        </p>

        {/* QR Payment Slip */}
        {school.iban && (
          <QRPaymentSlip
            creditor={{
              name: school.name,
              street: school.street || '',
              zip: school.zip || '',
              city: school.city || '',
              country: (school.country as 'LI' | 'CH') || 'LI',
              iban: school.iban,
              accountHolder: school.account_holder,
            }}
            debtor={{
              name: customerName,
              street: customer.street,
              zip: customer.zip,
              city: customer.city,
              country: customer.country,
            }}
            amount={invoice.total}
            currency="CHF"
            reference={invoice.qr_reference}
            message={`Rechnung ${invoice.invoice_number}`}
          />
        )}
      </div>
    );
  }
);

InvoicePrintTemplate.displayName = "InvoicePrintTemplate";
