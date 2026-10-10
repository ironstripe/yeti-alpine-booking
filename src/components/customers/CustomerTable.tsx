import { Link, useNavigate } from "react-router-dom";
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
import { formatPhoneDisplay } from "@/lib/phone-utils";

interface CustomerTableProps {
  customers: CustomerWithCount[];
  returnTo: string;
}

export function CustomerTable({ customers, returnTo }: CustomerTableProps) {
  const navigate = useNavigate();

  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kundennr.</TableHead>
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
              onClick={(event) => {
                if (event.target instanceof Element && event.target.closest("a, button, [role='checkbox']")) return;
                navigate(`/customers/${customer.id}`, { state: { returnTo } });
              }}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                {customer.customer_number || "–"}
              </TableCell>
              <TableCell className="font-medium">
                <Link to={`/customers/${customer.id}`} state={{ returnTo }}
                  className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  aria-label={`Kunde ${customer.first_name || ""} ${customer.last_name} ansehen`}
                >{customer.first_name} {customer.last_name}</Link>
                {customer.match_reason && customer.match_reason !== "Namenstreffer" && (
                  <div className="text-xs font-normal text-muted-foreground">
                    {customer.match_reason}
                  </div>
                )}
              </TableCell>

              <TableCell>
                {customer.email ? (
                  <a
                    href={`mailto:${customer.email}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {customer.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">–</span>
                )}
              </TableCell>
              <TableCell>
                {customer.phone ? (
                  <a
                    href={`tel:${customer.phone}`}
                    className="text-foreground hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatPhoneDisplay(customer.phone)}
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
