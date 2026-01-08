import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  FileText,
  Mail,
  Receipt,
  Printer,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Eye,
} from "lucide-react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useCreateInvoice, useInvoicesByTicket, useSendInvoice } from "@/hooks/useInvoices";
import { useSendTestEmail } from "@/hooks/useEmailTemplates";
import { InvoicePrintTemplate } from "@/components/invoices/InvoicePrintTemplate";
import { formatCurrency } from "@/lib/swiss-qr-utils";

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invoicePrintRef = useRef<HTMLDivElement>(null);
  
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  
  const { data: schoolSettings } = useSchoolSettings();
  const createInvoice = useCreateInvoice();
  const sendInvoice = useSendInvoice();
  const sendConfirmation = useSendTestEmail();
  
  // Fetch ticket with all details
  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ["ticket-detail", id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          *,
          customer:customers(*),
          items:ticket_items(
            *,
            product:products(*),
            participant:customer_participants(*),
            instructor:instructors(*)
          )
        `)
        .eq("id", id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
  
  // Fetch invoices for this ticket
  const { data: invoices = [] } = useInvoicesByTicket(id);
  
  // Fetch email log for this ticket
  const { data: emailLogs = [] } = useQuery({
    queryKey: ["email-logs", id],
    queryFn: async () => {
      if (!id) return [];
      
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .or(`metadata->ticket_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) {
        console.error("Email logs error:", error);
        return [];
      }
      return data || [];
    },
    enabled: !!id,
  });
  
  const handlePrintInvoice = useReactToPrint({
    contentRef: invoicePrintRef,
    documentTitle: `Rechnung-${invoices[0]?.invoice_number || "neu"}`,
  });
  
  const handleCreateInvoice = async () => {
    if (!ticket) return;
    
    try {
      await createInvoice.mutateAsync({
        ticketId: ticket.id,
        customerId: ticket.customer_id,
        subtotal: ticket.total_amount || 0,
        discount: 0,
        total: ticket.total_amount || 0,
      });
    } catch (error) {
      console.error("Failed to create invoice:", error);
    }
  };
  
  const handleSendInvoice = async (invoiceId: string) => {
    if (!ticket?.customer?.email) {
      toast.error("Keine E-Mail-Adresse vorhanden");
      return;
    }
    
    try {
      await sendInvoice.mutateAsync({
        invoiceId,
        recipientEmail: ticket.customer.email,
      });
    } catch (error) {
      console.error("Failed to send invoice:", error);
    }
  };
  
  const handleSendConfirmation = async () => {
    if (!ticket?.customer?.email) {
      toast.error("Keine E-Mail-Adresse vorhanden");
      return;
    }
    
    try {
      await sendConfirmation.mutateAsync({
        templateId: "booking_confirmation",
        recipientEmail: ticket.customer.email,
        testData: {
          customer: {
            first_name: ticket.customer.first_name,
            last_name: ticket.customer.last_name,
          },
          ticket: {
            number: ticket.ticket_number,
            total: formatCurrency(ticket.total_amount || 0),
          },
        },
      });
    } catch (error) {
      console.error("Failed to send confirmation:", error);
    }
  };
  
  if (ticketLoading) {
    return (
      <>
        <PageHeader title="Buchungsdetails" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }
  
  if (!ticket) {
    return (
      <>
        <PageHeader title="Buchungsdetails" />
        <Card className="bg-card">
          <CardContent className="py-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Buchung nicht gefunden</h3>
              <Button variant="outline" onClick={() => navigate("/bookings")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Zurück zu Buchungen
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }
  
  const latestInvoice = invoices[0];
  const lineItems = ticket.items?.map((item: any) => ({
    description: `${item.participant?.first_name || 'Teilnehmer'} - ${item.product?.name || 'Produkt'}`,
    details: item.instructor ? `Lehrer: ${item.instructor.first_name} ${item.instructor.last_name}` : undefined,
    amount: item.line_total || item.unit_price || 0,
  })) || [];

  return (
    <>
      <PageHeader
        title={`Buchung ${ticket.ticket_number}`}
        description={`${ticket.customer?.first_name || ''} ${ticket.customer?.last_name || ''} · ${ticket.customer?.email || ''}`}
        actions={
          <Button variant="outline" onClick={() => navigate("/bookings")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Booking Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Buchungsdetails
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={ticket.status === 'confirmed' ? 'default' : 'secondary'}>
                    {ticket.status === 'confirmed' ? 'Bestätigt' : ticket.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Gesamtbetrag</p>
                  <p className="text-lg font-semibold">CHF {formatCurrency(ticket.total_amount || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bezahlt</p>
                  <p className="font-medium">CHF {formatCurrency(ticket.paid_amount || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Erstellt am</p>
                  <p className="font-medium">
                    {format(new Date(ticket.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </p>
                </div>
              </div>
              
              {ticket.items && ticket.items.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-sm font-medium mb-2">Positionen</p>
                    <div className="space-y-2">
                      {ticket.items.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-start p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">
                              {item.participant?.first_name} {item.participant?.last_name} - {item.product?.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(item.date), 'dd.MM.yyyy', { locale: de })}
                              {item.time_start && ` · ${item.time_start.substring(0, 5)}`}
                              {item.time_end && ` - ${item.time_end.substring(0, 5)}`}
                            </p>
                            {item.instructor && (
                              <p className="text-sm text-muted-foreground">
                                Lehrer: {item.instructor.first_name} {item.instructor.last_name}
                              </p>
                            )}
                          </div>
                          <p className="font-medium">CHF {formatCurrency(item.line_total || item.unit_price || 0)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Invoice Section */}
          {latestInvoice && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Rechnung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium">{latestInvoice.invoice_number}</p>
                    <p className="text-sm text-muted-foreground">
                      Erstellt am {format(new Date(latestInvoice.created_at), 'dd.MM.yyyy', { locale: de })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={latestInvoice.status === 'paid' ? 'default' : 'secondary'}>
                      {latestInvoice.status === 'paid' ? 'Bezahlt' : 
                       latestInvoice.status === 'sent' ? 'Gesendet' : 
                       latestInvoice.status === 'overdue' ? 'Überfällig' : 'Entwurf'}
                    </Badge>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedInvoice(latestInvoice.id);
                        setShowInvoicePreview(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Anzeigen
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handlePrintInvoice}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Drucken
                    </Button>
                    {latestInvoice.status === 'draft' && (
                      <Button 
                        size="sm"
                        onClick={() => handleSendInvoice(latestInvoice.id)}
                        disabled={sendInvoice.isPending}
                      >
                        {sendInvoice.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-1" />
                        )}
                        Senden
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Communication Log */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Kommunikationsverlauf
              </CardTitle>
            </CardHeader>
            <CardContent>
              {emailLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Noch keine E-Mails gesendet
                </p>
              ) : (
                <div className="space-y-2">
                  {emailLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${
                          log.status === 'delivered' ? 'bg-green-500' :
                          log.status === 'sent' ? 'bg-blue-500' :
                          log.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                        }`} />
                        <div>
                          <p className="text-sm font-medium">{log.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {log.status === 'delivered' ? 'Zugestellt' :
                         log.status === 'sent' ? 'Gesendet' :
                         log.status === 'opened' ? 'Geöffnet' :
                         log.status === 'failed' ? 'Fehlgeschlagen' : log.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={handleSendConfirmation}
                disabled={sendConfirmation.isPending}
              >
                {sendConfirmation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                Bestätigung senden
              </Button>
              
              {!latestInvoice ? (
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={handleCreateInvoice}
                  disabled={createInvoice.isPending}
                >
                  {createInvoice.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Receipt className="h-4 w-4 mr-2" />
                  )}
                  Rechnung erstellen
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedInvoice(latestInvoice.id);
                    setShowInvoicePreview(true);
                  }}
                >
                  <Receipt className="h-4 w-4 mr-2" />
                  Rechnung anzeigen
                </Button>
              )}
              
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => toast.info("Erinnerung wird gesendet...")}
              >
                <Clock className="h-4 w-4 mr-2" />
                Erinnerung senden
              </Button>
            </CardContent>
          </Card>

          {/* Customer Info */}
          {ticket.customer && (
            <Card>
              <CardHeader>
                <CardTitle>Kunde</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-medium">
                  {ticket.customer.first_name} {ticket.customer.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{ticket.customer.email}</p>
                {ticket.customer.phone && (
                  <p className="text-sm text-muted-foreground">{ticket.customer.phone}</p>
                )}
                {ticket.customer.street && (
                  <div className="text-sm text-muted-foreground">
                    <p>{ticket.customer.street}</p>
                    <p>{ticket.customer.zip} {ticket.customer.city}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Invoice Preview Dialog */}
      <Dialog open={showInvoicePreview} onOpenChange={setShowInvoicePreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rechnungsvorschau</DialogTitle>
            <DialogDescription>
              {latestInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          
          {latestInvoice && schoolSettings && ticket.customer && (
            <InvoicePrintTemplate
              ref={invoicePrintRef}
              invoice={{
                invoice_number: latestInvoice.invoice_number,
                invoice_date: latestInvoice.invoice_date,
                due_date: latestInvoice.due_date,
                qr_reference: latestInvoice.qr_reference,
                subtotal: latestInvoice.subtotal,
                discount: latestInvoice.discount,
                total: latestInvoice.total,
              }}
              school={{
                name: schoolSettings.name || 'Skischule YETY',
                street: schoolSettings.street || undefined,
                zip: schoolSettings.zip || undefined,
                city: schoolSettings.city || undefined,
                country: schoolSettings.country || 'LI',
                phone: schoolSettings.phone || undefined,
                email: schoolSettings.email || undefined,
                iban: schoolSettings.iban || undefined,
                bic: schoolSettings.bic || undefined,
                account_holder: schoolSettings.account_holder || undefined,
                logo_url: schoolSettings.logo_url || undefined,
              }}
              customer={{
                first_name: ticket.customer.first_name || undefined,
                last_name: ticket.customer.last_name,
                street: ticket.customer.street || undefined,
                zip: ticket.customer.zip || undefined,
                city: ticket.customer.city || undefined,
                country: ticket.customer.country || undefined,
              }}
              ticketNumber={ticket.ticket_number}
              lineItems={lineItems}
            />
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoicePreview(false)}>
              Schliessen
            </Button>
            <Button onClick={handlePrintInvoice}>
              <Printer className="h-4 w-4 mr-2" />
              Drucken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden print template */}
      <div className="hidden">
        {latestInvoice && schoolSettings && ticket.customer && (
          <InvoicePrintTemplate
            ref={invoicePrintRef}
            invoice={{
              invoice_number: latestInvoice.invoice_number,
              invoice_date: latestInvoice.invoice_date,
              due_date: latestInvoice.due_date,
              qr_reference: latestInvoice.qr_reference,
              subtotal: latestInvoice.subtotal,
              discount: latestInvoice.discount,
              total: latestInvoice.total,
            }}
            school={{
              name: schoolSettings.name || 'Skischule YETY',
              street: schoolSettings.street || undefined,
              zip: schoolSettings.zip || undefined,
              city: schoolSettings.city || undefined,
              country: schoolSettings.country || 'LI',
              phone: schoolSettings.phone || undefined,
              email: schoolSettings.email || undefined,
              iban: schoolSettings.iban || undefined,
              bic: schoolSettings.bic || undefined,
              account_holder: schoolSettings.account_holder || undefined,
              logo_url: schoolSettings.logo_url || undefined,
            }}
            customer={{
              first_name: ticket.customer.first_name || undefined,
              last_name: ticket.customer.last_name,
              street: ticket.customer.street || undefined,
              zip: ticket.customer.zip || undefined,
              city: ticket.customer.city || undefined,
              country: ticket.customer.country || undefined,
            }}
            ticketNumber={ticket.ticket_number}
            lineItems={lineItems}
          />
        )}
      </div>
    </>
  );
};

export default BookingDetail;
