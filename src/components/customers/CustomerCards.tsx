import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CustomerWithCount } from "@/hooks/useCustomers";

interface CustomerCardsProps {
  customers: CustomerWithCount[];
}

function formatPhoneNumber(phone: string | null): string {
  if (!phone) return "";
  return phone;
}

export function CustomerCards({ customers }: CustomerCardsProps) {
  const navigate = useNavigate();

  return (
    <div className="md:hidden space-y-3">
      {customers.map((customer) => (
        <div
          key={customer.id}
          className="bg-card rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => navigate(`/customers/${customer.id}`)}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">
                  {customer.first_name} {customer.last_name}
                </h3>
                <Badge variant="secondary" className="shrink-0">
                  {customer.participant_count}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate mt-1">
                {customer.email}
              </p>
              {customer.phone && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatPhoneNumber(customer.phone)}
                </p>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
