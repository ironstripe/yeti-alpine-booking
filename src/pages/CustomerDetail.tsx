import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Edit, Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useCustomerDetail, useCustomerTickets } from "@/hooks/useCustomerDetail";
import { useCustomerContacts } from "@/hooks/useCustomerContacts";
import { CustomerInfoCard } from "@/components/customers/detail/CustomerInfoCard";
import { FamilyHub } from "@/components/customers/detail/FamilyHub";
import { BookingHistoryCard } from "@/components/customers/detail/BookingHistoryCard";
import { ContactPersonsCard } from "@/components/customers/detail/ContactPersonsCard";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: customer, isLoading: isLoadingCustomer } = useCustomerDetail(id);
  const { data: tickets = [], isLoading: isLoadingTickets } = useCustomerTickets(id);
  const { data: contacts = [] } = useCustomerContacts(id);
  
  const isSchool = customer?.customer_type === 'school';

  if (isLoadingCustomer) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-64" />
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Kunde nicht gefunden</h2>
        <p className="text-muted-foreground mt-2">
          Der angeforderte Kunde existiert nicht.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/customers")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück zur Kundenliste
        </Button>
      </div>
    );
  }

  const displayName = isSchool
    ? customer.organization_name || customer.last_name
    : customer.first_name
      ? `${customer.first_name} ${customer.last_name}`
      : `Familie ${customer.last_name}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/customers")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{displayName}</h1>
              {isSchool && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  <Building2 className="mr-1 h-3 w-3" />
                  Schule
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{customer.email}</p>
          </div>
        </div>
        <div className="flex gap-2 pl-14 sm:pl-0">
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Bearbeiten
          </Button>
          <Button
            onClick={() => navigate(isSchool ? `/bookings/new/school-camp?customer=${customer.id}` : `/bookings/new?customer=${customer.id}`)}
          >
            <Plus className="mr-2 h-4 w-4" />
            {isSchool ? "Skilager buchen" : "Neue Buchung"}
          </Button>
        </div>
      </div>

      {/* Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - Customer Info + Booking History */}
        <div className="lg:col-span-3 space-y-6 order-2 lg:order-1">
          <CustomerInfoCard customer={customer} />
          {isSchool && (
            <ContactPersonsCard customerId={customer.id} contacts={contacts} />
          )}
          <BookingHistoryCard tickets={tickets} isLoading={isLoadingTickets} customerId={customer.id} />
        </div>

        {/* Right Column - Family Hub (only for private customers) */}
        <div className="lg:col-span-2 order-1 lg:order-2">
          {!isSchool ? (
            <FamilyHub
              customerId={customer.id}
              customerLastName={customer.last_name}
              participants={customer.participants ?? []}
            />
          ) : (
            <div className="p-6 border rounded-lg bg-muted/30 text-center text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                Schulen haben keine Teilnehmer.
                <br />
                Die Schüler werden von der Schule selbst verwaltet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
