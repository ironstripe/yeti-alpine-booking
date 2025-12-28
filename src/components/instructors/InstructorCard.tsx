import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, Snowflake, MountainSnow } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstructorWithBookings } from "@/hooks/useInstructors";
import { getStatusConfig, getSpecializationLabel } from "@/hooks/useInstructors";
import { getInitials, getAvatarColor } from "@/lib/participant-utils";

interface InstructorCardProps {
  instructor: InstructorWithBookings;
  isPulsing?: boolean;
  onClick?: () => void;
}

export function InstructorCard({ instructor, isPulsing, onClick }: InstructorCardProps) {
  const statusConfig = getStatusConfig(instructor.real_time_status);
  const fullName = `${instructor.first_name} ${instructor.last_name}`;
  const initials = getInitials(instructor.first_name, instructor.last_name);
  const avatarColor = getAvatarColor(fullName);
  const SpecIcon = instructor.specialization === "snowboard" ? MountainSnow : Snowflake;

  return (
    <Card
      className="relative overflow-hidden cursor-pointer transition-all hover:shadow-md border"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar with status dot */}
          <div className="relative">
            <Avatar className="h-12 w-12">
              <AvatarFallback className={cn("text-white font-medium", avatarColor)}>
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Status dot - 16px, top-left of avatar */}
            <div
              className={cn(
                "absolute -top-1 -left-1 w-4 h-4 rounded-full border-2 border-background",
                statusConfig.color,
                isPulsing && "animate-status-pulse"
              )}
              style={{
                boxShadow: `0 0 0 3px ${statusConfig.shadowColor}`,
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate hover:underline">
              {fullName}
            </h3>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <SpecIcon className="h-3.5 w-3.5" />
              <span>{getSpecializationLabel(instructor.specialization)}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          {/* Phone */}
          {instructor.phone && (
            <a
              href={`tel:${instructor.phone}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="truncate">{instructor.phone}</span>
            </a>
          )}

          {/* Level badge */}
          {instructor.level && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Level:</span>
              <Badge variant="outline" className="text-xs">
                {instructor.level}
              </Badge>
            </div>
          )}
        </div>

        {/* Today's bookings */}
        <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
          <span>Heute: {instructor.todayBookingsCount} Buchungen</span>
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
