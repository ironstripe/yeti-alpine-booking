import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/phone-utils";
import { getInitials, getAvatarColor } from "@/lib/participant-utils";
import { getLevelLabel } from "@/lib/instructor-utils";
import { getSpecializationLabel, getStatusConfig, type InstructorWithBookings } from "@/hooks/useInstructors";

interface InstructorTableProps {
  instructors: InstructorWithBookings[];
  photoUrls: Record<string, string>;
  pulsingIds: Set<string>;
  onRowClick: (instructor: InstructorWithBookings) => void;
}

export function InstructorTable({ instructors, photoUrls, pulsingIds, onRowClick }: InstructorTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">Name</th>
            <th scope="col" className="px-4 py-3">Sportart</th>
            <th scope="col" className="px-4 py-3">Qualifikation</th>
            <th scope="col" className="px-4 py-3">Verfügbarkeit</th>
            <th scope="col" className="px-4 py-3 text-right">Heute</th>
            <th scope="col" className="px-4 py-3">Kontakt</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {instructors.map((instructor) => {
            const fullName = `${instructor.first_name} ${instructor.last_name}`;
            const status = getStatusConfig(instructor.real_time_status);
            const photoUrl = photoUrls[instructor.id] || instructor.avatar_url;

            return (
              <tr
                key={instructor.id}
                className="cursor-pointer transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
                onClick={() => onRowClick(instructor)}
              >
                <th scope="row" className="px-4 py-3 font-normal">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar className="h-9 w-9 text-xs">
                        {photoUrl && <AvatarImage src={photoUrl} alt={fullName} />}
                        <AvatarFallback className={cn("font-medium text-primary-foreground", getAvatarColor(fullName))}>
                          {getInitials(instructor.first_name, instructor.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                          status.color,
                          pulsingIds.has(instructor.id) && "animate-status-pulse",
                        )}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0">
                      <Link
                        to={`/instructors/${instructor.id}`}
                        className="control-target inline-flex items-center font-semibold text-brand hover:text-brand-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {fullName}
                      </Link>
                      {instructor.status === "inactive" && <Badge variant="secondary" className="ml-2 text-xs">Inaktiv</Badge>}
                    </div>
                  </div>
                </th>
                <td className="px-4 py-3 text-muted-foreground">
                  {getSpecializationLabel(instructor.specialization, instructor.roles)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{getLevelLabel(instructor.level)}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", status.color)} aria-hidden="true" />
                    <span>{status.label}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {instructor.todayBookingsCount} Buchungen
                </td>
                <td className="px-4 py-3">
                  {instructor.phone ? (
                    <a
                      href={`tel:${instructor.phone}`}
                      className="control-target inline-flex items-center text-brand hover:text-brand-hover hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {formatPhoneDisplay(instructor.phone)}
                    </a>
                  ) : <span className="text-muted-foreground">–</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}