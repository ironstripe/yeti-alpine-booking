import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, Download, Printer, Search, Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

import { PaymentModal } from "@/components/bookings/PaymentModal";
import { useBillingPartners } from "@/hooks/useBillingPartners";
import {
  defaultOutstandingFilters,
  filterOutstandingRows,
  useOutstandingTickets,
  type OutstandingFilters,
  type OutstandingTicketRow,
} from "@/hooks/useOutstandingTickets";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  downloadCsv,
  formatCHF,
  getPaymentMethodLabel,
} from "@/lib/finance";

type SortKey = "created" | "course" | "outstanding" | "due";

const COURSE_TYPE_LABELS: Record<string, string> = {
  all: "Alle Kursarten",
  private: "Privatstunden",
  group: "Gruppenkurse",
};

function formatDate(value: string | null) {
  if (!value) return "–";
  try {
    return format(parseISO(value), "dd.MM.yyyy", { locale: de });
  } catch {
    return "–";
  }
}

export default function FinanceUnpaid() {
  const navigate = useNavigate();
  const { data: rows, isLoading } = useOutstandingTickets();
  const { data: partners } = useBillingPartners();

  const [filters, setFilters] = useState<OutstandingFilters>(defaultOutstandingFilters);
  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [paymentTicket, setPaymentTicket] = useState<OutstandingTicketRow | null>(null);

  const filtered = useMemo(() => {
    const list = filterOutstandingRows(rows ?? [], filters);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "created":
          return b.created_at.localeCompare(a.created_at);
        case "course":
          return (a.courseDateFrom || "9999").localeCompare(b.courseDateFrom || "9999");
        case "due":
          return (a.payment_due_date || "9999").localeCompare(b.payment_due_date || "9999");
        default:
          return b.outstanding - a.outstanding;
      }
    });
    return sorted;
  }, [rows, filters, sortKey]);

  const totalOutstanding = filtered.reduce((sum, row) => sum + row.outstanding, 0);
  const overdueCount = filtered.filter((row) => row.isOverdue).length;

  const update = (patch: Partial<OutstandingFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const handleExport = () => {
    const rowsForCsv: (string | number)[][] = [
      [
        "Buchungsnummer",
        "Kunde",
        "E-Mail",
        "Kursart",
        "Kurs",
        "Kursdatum von",
        "Kursdatum bis",
        "Erstellt",
        "Zahlungsart",
        "Hotel",
        "Fällig am",
        "Status",
        "Gesamt",
        "Bezahlt",
        "Offen",
        "Guthaben",
      ],
      ...filtered.map((row) => [
        row.ticket_number,
        row.customer.name,
        row.customer.email || "",
        COURSE_TYPE_LABELS[row.courseType] || row.courseType,
        row.courseSummary,
        row.courseDateFrom || "",
        row.courseDateTo || "",
        row.created_at.slice(0, 10),
        getPaymentMethodLabel(row.payment_method),
        row.billingPartner?.name || "",
        row.payment_due_date || "",
        PAYMENT_STATUS_LABELS[row.paymentStatus],
        row.total_amount,
        row.paid_amount,
        row.outstanding,
        row.availableCredit,
      ]),
    ];
    downloadCsv(`unbezahlte-kurse-${format(new Date(), "yyyy-MM-dd")}.csv`, rowsForCsv);
  };


  return (
    <div className="space-y-6">
      <PageHeader
        title="Unbezahlte Kurse"
        description="Alle Buchungen mit offenem Betrag – eine Zeile pro Buchung"
      />

      <div className="grid gap-4 sm:grid-cols-3 print:hidden">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Offene Buchungen</p>
              <p className="text-2xl font-semibold">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Offener Betrag</p>
              <p className="text-2xl font-semibold">{formatCHF(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Überfällig</p>
              <p className="text-2xl font-semibold">{overdueCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="print:hidden">
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Suche</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Nummer, Kunde, E-Mail"
                  value={filters.search || ""}
                  onChange={(e) => update({ search: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Kursart</Label>
              <Select
                value={filters.courseType || "all"}
                onValueChange={(v) => update({ courseType: v as OutstandingFilters["courseType"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Kursarten</SelectItem>
                  <SelectItem value="private">Privatstunden</SelectItem>
                  <SelectItem value="group">Gruppenkurse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Zahlungsart</Label>
              <Select
                value={filters.paymentMethod || "all"}
                onValueChange={(v) => update({ paymentMethod: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hotel</Label>
              <Select
                value={filters.billingPartnerId || "all"}
                onValueChange={(v) => update({ billingPartnerId: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {(partners || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Kursdatum von</Label>
              <Input
                type="date"
                value={filters.courseFrom || ""}
                onChange={(e) => update({ courseFrom: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kursdatum bis</Label>
              <Input
                type="date"
                value={filters.courseTo || ""}
                onChange={(e) => update({ courseTo: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sortierung</Label>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outstanding">Offener Betrag</SelectItem>
                  <SelectItem value="due">Fälligkeit</SelectItem>
                  <SelectItem value="course">Kursdatum</SelectItem>
                  <SelectItem value="created">Erstellt am</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!filters.onlyOverdue}
                  onCheckedChange={(c) => update({ onlyOverdue: !!c })}
                />
                Nur überfällige
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={!!filters.onlyWithCredit}
                  onCheckedChange={(c) => update({ onlyWithCredit: !!c })}
                />
                Nur mit Guthaben
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
              <Download className="mr-2 h-4 w-4" />
              CSV exportieren
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Drucken
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(defaultOutstandingFilters)}
            >
              Filter zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              Keine Buchungen mit offenem Betrag.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buchung</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Kurs</TableHead>
                  <TableHead>Kursdatum</TableHead>
                  <TableHead>Zahlungsart</TableHead>
                  <TableHead>Fällig</TableHead>
                  <TableHead className="text-right">Offen</TableHead>
                  <TableHead className="text-right print:hidden">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/bookings/${row.id}`)}
                  >
                    <TableCell className="font-medium">
                      {row.ticket_number}
                      <div className="text-xs text-muted-foreground">
                        erstellt {formatDate(row.created_at.slice(0, 10))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.customer.name}
                      {row.availableCredit > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          Guthaben {formatCHF(row.availableCredit)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{row.courseSummary}</TableCell>
                    <TableCell>
                      {formatDate(row.courseDateFrom)}
                      {row.courseDateTo && row.courseDateTo !== row.courseDateFrom
                        ? ` – ${formatDate(row.courseDateTo)}`
                        : ""}
                    </TableCell>
                    <TableCell>
                      {getPaymentMethodLabel(row.payment_method)}
                      {row.billingPartner && (
                        <div className="text-xs text-muted-foreground">
                          {row.billingPartner.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {formatDate(row.payment_due_date)}
                        <Badge variant={row.isOverdue ? "destructive" : "secondary"}>
                          {PAYMENT_STATUS_LABELS[row.paymentStatus]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCHF(row.outstanding)}
                    </TableCell>
                    <TableCell className="text-right print:hidden">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaymentTicket(row);
                        }}
                      >
                        Zahlung erfassen
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaymentModal
        ticket={
          paymentTicket
            ? ({
                id: paymentTicket.id,
                total_amount: paymentTicket.total_amount,
                paid_amount: paymentTicket.paid_amount,
                ticket_number: paymentTicket.ticket_number,
              } as any)
            : null
        }
        onClose={() => setPaymentTicket(null)}
      />
    </div>
  );
}
