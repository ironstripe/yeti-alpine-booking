import { Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

interface VariableHelperProps {
  onInsert: (variable: string) => void;
}

const variableGroups = [
  {
    name: "Kunde",
    variables: [
      { key: "customer.first_name", label: "Vorname" },
      { key: "customer.last_name", label: "Nachname" },
      { key: "customer.email", label: "E-Mail" },
      { key: "customer.phone", label: "Telefon" },
      { key: "customer.street", label: "Strasse" },
      { key: "customer.zip", label: "PLZ" },
      { key: "customer.city", label: "Ort" },
    ],
  },
  {
    name: "Buchung",
    variables: [
      { key: "request_number", label: "Anfragenummer" },
      { key: "ticket_number", label: "Ticketnummer" },
      { key: "booking.date", label: "Datum" },
      { key: "booking.time", label: "Uhrzeit" },
      { key: "product.name", label: "Produkt" },
      { key: "instructor.name", label: "Skilehrer" },
      { key: "meeting_point", label: "Treffpunkt" },
      { key: "booking.items", label: "Buchungspositionen" },
      { key: "booking.total", label: "Gesamtbetrag" },
    ],
  },
  {
    name: "Rechnung",
    variables: [
      { key: "invoice.number", label: "Rechnungsnummer" },
      { key: "invoice.date", label: "Rechnungsdatum" },
      { key: "invoice.due_date", label: "Fälligkeitsdatum" },
      { key: "invoice.subtotal", label: "Zwischensumme" },
      { key: "invoice.discount", label: "Rabatt" },
      { key: "invoice.total", label: "Gesamtbetrag" },
      { key: "invoice.qr_reference", label: "QR-Referenz" },
      { key: "invoice.items", label: "Rechnungspositionen" },
    ],
  },
  {
    name: "Zahlung",
    variables: [
      { key: "payment.amount", label: "Betrag" },
      { key: "payment.due_date", label: "Fälligkeitsdatum" },
      { key: "payment.method", label: "Zahlungsart" },
      { key: "payment.status", label: "Zahlungsstatus" },
    ],
  },
  {
    name: "Gutschein",
    variables: [
      { key: "voucher.code", label: "Code" },
      { key: "voucher.value", label: "Wert" },
      { key: "voucher.expiry", label: "Ablaufdatum" },
      { key: "voucher.recipient", label: "Empfänger" },
    ],
  },
  {
    name: "Skischule",
    variables: [
      { key: "school.name", label: "Name" },
      { key: "school.email", label: "E-Mail" },
      { key: "school.phone", label: "Telefon" },
      { key: "school.street", label: "Strasse" },
      { key: "school.zip", label: "PLZ" },
      { key: "school.city", label: "Ort" },
      { key: "school.iban", label: "IBAN" },
      { key: "school.website", label: "Website" },
    ],
  },
  {
    name: "System",
    variables: [
      { key: "current.date", label: "Aktuelles Datum" },
      { key: "current.year", label: "Aktuelles Jahr" },
    ],
  },
];

export function VariableHelper({ onInsert }: VariableHelperProps) {
  const handleCopy = (variable: string) => {
    navigator.clipboard.writeText(`{{${variable}}}`);
    toast.success("Variable kopiert");
  };

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Verfügbare Variablen</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Klicken Sie auf eine Variable, um sie einzufügen.
        </p>
      </div>

      <Accordion type="multiple" className="w-full" defaultValue={["Kunde", "Buchung"]}>
        {variableGroups.map((group) => (
          <AccordionItem key={group.name} value={group.name} className="border-b-0">
            <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
              {group.name}
            </AccordionTrigger>
            <AccordionContent className="pb-2 px-1">
              <div className="space-y-1">
                {group.variables.map((variable) => (
                  <div
                    key={variable.key}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted group"
                  >
                    <button
                      type="button"
                      onClick={() => onInsert(`{{${variable.key}}}`)}
                      className="flex-1 text-left text-sm"
                    >
                      <span className="font-mono text-xs text-primary">
                        {`{{${variable.key}}}`}
                      </span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {variable.label}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => handleCopy(variable.key)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
