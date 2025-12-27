import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, Mail, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Instructor } from "@/hooks/useInstructors";
import { getStatusConfig, getSpecializationLabel } from "@/hooks/useInstructors";
import { getInitials, getAvatarColor } from "@/lib/participant-utils";

interface InstructorCardProps {
  instructor: Instructor;
  onClick?: () => void;
}

export function InstructorCard({ instructor, onClick }: InstructorCardProps) {
  const statusConfig = getStatusConfig(instructor.real_time_status);
  const fullName = `${instructor.first_name} ${instructor.last_name}`;
  const initials = getInitials(instructor.first_name, instructor.last_name);
  const avatarColor = getAvatarColor(fullName);

  return (
    <Card
      className={cn(
        "relative overflow-hidden cursor-pointer transition-all hover:shadow-md",
        `border-l-4 ${statusConfig.borderColor}`
      )}
      onClick={onClick}
    >
      {/* Status indicator dot */}
      <div
        className={cn(
          "absolute top-3 right-3 w-3 h-3 rounded-full animate-pulse",
          statusConfig.color
        )}
      />

      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className={cn("text-white font-medium", avatarColor)}>
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{fullName}</h3>
            <p className="text-sm text-muted-foreground">
              {getSpecializationLabel(instructor.specialization)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {/* Status badge */}
          <Badge
            className={cn(
              "font-medium",
              statusConfig.bgLight,
              statusConfig.textColor,
              "border-0"
            )}
          >
            {statusConfig.label}
          </Badge>

          {/* Level badge if available */}
          {instructor.level && (
            <Badge variant="outline" className="ml-2">
              {instructor.level}
            </Badge>
          )}
        </div>

        <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          {instructor.phone && (
            <a
              href={`tel:${instructor.phone}`}
              className="flex items-center gap-2 hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="truncate">{instructor.phone}</span>
            </a>
          )}
          {instructor.email && (
            <a
              href={`mailto:${instructor.email}`}
              className="flex items-center gap-2 hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{instructor.email}</span>
            </a>
          )}
        </div>

        {/* Hourly rate */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Stundensatz</span>
          <span className="font-medium">CHF {instructor.hourly_rate.toFixed(2)}</span>
        </div>

        {/* Active/Inactive status */}
        {instructor.status === "inactive" && (
          <Badge variant="secondary" className="mt-2">
            Inaktiv
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
