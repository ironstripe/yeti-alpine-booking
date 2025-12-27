import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { CustomerWithCount } from "@/hooks/useCustomers";

interface CustomerTableProps {
  customers: CustomerWithCount[];
}

function formatPhoneNumber(phone: string | null): string {
  if (!phone) return "—";
  // Simple formatting: keep as-is if already formatted, otherwise just return
  return phone;
}

export function CustomerTable({ customers }: CustomerTableProps) {
  const navigate = useNavigate();

  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>E-Mail</TableHead>
            <TableHead>Telefon</TableHead>
            <TableHead>Kinder</TableHead>
            <TableHead>Erstellt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow
              key={customer.id}
              className="cursor-pointer"
              onClick={() => navigate(`/customers/${customer.id}`)}
            >
              <TableCell className="font-medium">
                {customer.first_name} {customer.last_name}
              </TableCell>
              <TableCell>
                <a
                  href={`mailto:${customer.email}`}
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {customer.email}
                </a>
              </TableCell>
              <TableCell>
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="text-foreground hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatPhoneNumber(customer.phone)}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {customer.participant_count}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(customer.created_at), "dd.MM.yyyy", {
                  locale: de,
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
