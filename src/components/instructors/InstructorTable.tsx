import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/phone-utils";
import { getInitials, getAvatarColor } from "@/lib/participant-utils";
import { getLevelLabel } from "@/lib/instructor-utils";
import { getSpecializationLabel, getStatusConfig, type InstructorWithBookings } from "@/hooks/useInstructors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useInstructorListEdits, homepageBlocker } from "@/hooks/useInstructorListEdits";

const OPERATIONAL = [
  { value: "available", label: "Verfügbar" },
  { value: "on_call", label: "Auf Abruf" },
  { value: "unavailable", label: "Nicht verfügbar" },
] as const;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

interface InstructorTableProps {
  instructors: InstructorWithBookings[];
  photoUrls: Record<string, string>;
  pulsingIds: Set<string>;
  onRowClick: (instructor: InstructorWithBookings) => void;
  /** Staff (admin/office/super_admin) may edit inline; server enforces it again. */
  canEdit?: boolean;
}

export function InstructorTable({ instructors, photoUrls, pulsingIds, onRowClick, canEdit = false }: InstructorTableProps) {
  const { field, website } = useInstructorListEdits();
  const busy = (id: string) =>
    (field.isPending && field.variables?.id === id) || (website.isPending && website.variables?.instructor.id === id);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">Name</th>
            <th scope="col" className="px-4 py-3">Sportart</th>
            <th scope="col" className="px-4 py-3">Qualifikation</th>
            <th scope="col" className="px-4 py-3">Saisonstatus</th>
            <th scope="col" className="px-4 py-3">Operativer Status</th>
            <th scope="col" className="px-4 py-3">Homepage</th>
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
                    </div>
                  </div>
                </th>
                <td className="px-4 py-3 text-muted-foreground">
                  {getSpecializationLabel(instructor.specialization, instructor.roles)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{getLevelLabel(instructor.level)}</td>
                <td className="px-4 py-3" onClick={stop}>
                  {canEdit ? (
                    <Select
                      value={instructor.status === "inactive" ? "inactive" : "active"}
                      disabled={busy(instructor.id)}
                      onValueChange={(v) => field.mutate({ id: instructor.id, status: v as "active" | "inactive" })}
                    >
                      <SelectTrigger className="h-8 w-[110px]" aria-label={`Saisonstatus ${fullName}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="inactive">Inaktiv</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={instructor.status === "inactive" ? "secondary" : "outline"} className="text-xs">
                      {instructor.status === "inactive" ? "Inaktiv" : "Aktiv"}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3" onClick={stop}>
                  {canEdit ? (
                    <Select
                      value={instructor.real_time_status || "unavailable"}
                      disabled={busy(instructor.id)}
                      onValueChange={(v) => field.mutate({ id: instructor.id, real_time_status: v })}
                    >
                      <SelectTrigger className="h-8 w-[160px]" aria-label={`Operativer Status ${fullName}`}>
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", status.color)} aria-hidden="true" />
                          <SelectValue />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATIONAL.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", status.color)} aria-hidden="true" />
                      <span>{status.label}</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={stop}>
                  {(() => {
                    const shown = !!instructor.show_on_website;
                    const blocker = homepageBlocker(instructor);
                    const live = shown && instructor.status === "active";
                    return (
                      <span className="inline-flex items-center gap-2" title={blocker ?? undefined}>
                        <Switch
                          checked={shown}
                          disabled={!canEdit || !!blocker || busy(instructor.id)}
                          onCheckedChange={(v) => website.mutate({ instructor, show: v })}
                          aria-label={`Auf Homepage anzeigen ${fullName}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {live ? "Sichtbar" : shown ? "Pausiert (inaktiv)" : blocker && canEdit && instructor.status === "active" ? "Teaser fehlt" : "Aus"}
                        </span>
                      </span>
                    );
                  })()}
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