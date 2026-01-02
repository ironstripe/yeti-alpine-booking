import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MessageCircle, CalendarPlus } from "lucide-react";
import { useInstructorDetail } from "@/hooks/useInstructorDetail";
import { StatusToggle } from "@/components/instructors/detail/StatusToggle";
import { ProfileInfoCard } from "@/components/instructors/detail/ProfileInfoCard";
import { TodayScheduleCard } from "@/components/instructors/detail/TodayScheduleCard";
import { SeasonStatsCard } from "@/components/instructors/detail/SeasonStatsCard";
import { getSpecializationLabel } from "@/hooks/useInstructors";
import { getLevelLabel } from "@/lib/instructor-utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function InstructorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    instructor,
    isLoading,
    error,
    todayBookings,
    seasonStats,
    isPulsing,
    updateStatus,
    isUpdatingStatus,
  } = useInstructorDetail(id);

  const handleEdit = () => {
    toast.info("Bearbeiten-Funktion kommt bald...");
  };

  const handleSendMessage = () => {
    toast.info("Nachricht senden kommt bald...");
  };

  const handleAssignBooking = () => {
    navigate("/bookings", { state: { preselectedInstructor: id } });
  };

  if (isLoading) {
    return <InstructorDetailSkeleton />;
  }

  if (error || !instructor) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground mb-4">Skilehrer nicht gefunden</p>
        <Button variant="outline" onClick={() => navigate("/instructors")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  const getInitials = () => {
    return `${instructor.first_name?.charAt(0) || ""}${instructor.last_name?.charAt(0) || ""}`.toUpperCase();
  };

  const formatLastChanged = () => {
    // This would ideally come from a last_status_changed_at column
    // For now, show a placeholder
    return format(new Date(), "'Heute,' HH:mm", { locale: de });
  };

  return (
    <div className="space-y-6">
      {/* Back Button & Quick Actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/instructors")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Übersicht
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSendMessage}>
            <MessageCircle className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Nachricht</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleAssignBooking}>
            <CalendarPlus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Buchung zuweisen</span>
          </Button>
        </div>
      </div>

      {/* Hero Section with Status Toggle */}
      <div className="bg-card border rounded-xl p-6 sm:p-8">
        <div className="flex flex-col items-center text-center space-y-4">
          {/* Avatar */}
          <Avatar className="h-24 w-24 text-2xl">
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials()}
            </AvatarFallback>
          </Avatar>

          {/* Name & Info */}
          <div>
            <h1 className="text-2xl font-bold">
              {instructor.first_name} {instructor.last_name}
            </h1>
            <p className="text-muted-foreground">
              {getLevelLabel(instructor.level)} · {getSpecializationLabel(instructor.specialization)}
            </p>
          </div>

          {/* Status Toggle */}
          <div className="pt-4">
            <StatusToggle
              currentStatus={instructor.real_time_status}
              onStatusChange={updateStatus}
              isPulsing={isPulsing}
              isUpdating={isUpdatingStatus}
              lastChanged={formatLastChanged()}
            />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - Profile */}
        <div className="lg:col-span-3">
          <ProfileInfoCard instructor={instructor} onEdit={handleEdit} />
        </div>

        {/* Right Column - Today & Stats */}
        <div className="lg:col-span-2 space-y-6">
          <TodayScheduleCard bookings={todayBookings} />
          <SeasonStatsCard stats={seasonStats} />
        </div>
      </div>
    </div>
  );
}

function InstructorDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      <div className="bg-card border rounded-xl p-8">
        <div className="flex flex-col items-center space-y-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-36" />
          <div className="pt-4 space-y-4">
            <div className="flex gap-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
            <Skeleton className="h-5 w-24 mx-auto" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <Skeleton className="h-96 rounded-lg" />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
