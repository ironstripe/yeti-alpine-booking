import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MessageCircle, CalendarPlus, Mail, Loader2 } from "lucide-react";
import { useInstructorDetail } from "@/hooks/useInstructorDetail";
import { StatusToggle } from "@/components/instructors/detail/StatusToggle";
import { ProfileInfoCard } from "@/components/instructors/detail/ProfileInfoCard";
import { TodayScheduleCard } from "@/components/instructors/detail/TodayScheduleCard";
import { SeasonStatsCard } from "@/components/instructors/detail/SeasonStatsCard";
import { AbsenceRequestCard } from "@/components/instructors/detail/AbsenceRequestCard";
import { RolesCapabilitiesCard } from "@/components/instructors/detail/RolesCapabilitiesCard";
import { RecurringBlocksTab } from "@/components/instructor/RecurringBlocksTab";
import { InstructorRentalsCard } from "@/components/instructors/detail/InstructorRentalsCard";
import { EditInstructorModal } from "@/components/instructors/EditInstructorModal";
import { WebsiteProfileDialog } from "@/components/instructors/WebsiteProfileDialog";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";

import { getSpecializationLabel } from "@/hooks/useInstructors";
import { getLevelLabel } from "@/lib/instructor-utils";
import { useUserRole } from "@/hooks/useUserRole";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import { useStaffInstructorPhotos } from "@/hooks/useStaffInstructorPhotos";
import { useInviteInstructor } from "@/hooks/useInviteInstructor";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function InstructorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isTeacher, isAdminOrOffice, instructorId: currentUserInstructorId } = useUserRole();
  const isSuperAdmin = useIsSuperAdmin();
  const { data: staffPhotoUrls = {} } = useStaffInstructorPhotos(id ? [id] : [], isAdminOrOffice || isSuperAdmin);
  const inviteMutation = useInviteInstructor();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false);
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

  // Check if the current user is viewing their own profile
  const isOwnProfile = isTeacher && currentUserInstructorId === id;

  const handleEdit = () => {
    setEditModalOpen(true);
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
  const canManageWebsite = isAdminOrOffice || isSuperAdmin;
  const isWebsitePublic = instructor.show_on_website && instructor.status === "active" &&
    !!instructor.avatar_url && !!instructor.website_teaser?.trim();

  const formatLastChanged = () => {
    // This would ideally come from a last_status_changed_at column
    // For now, show a placeholder
    return format(new Date(), "'Heute,' HH:mm", { locale: de });
  };

  if (canManageWebsite) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="control-target" onClick={() => navigate("/instructors")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Übersicht
          </Button>
          <div className="flex flex-wrap gap-2">
            {isAdminOrOffice && (
              <Button variant="outline" size="sm" className="control-target" onClick={() => inviteMutation.mutate(instructor.id)} disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Einladen
              </Button>
            )}
            <Button variant="outline" size="sm" className="control-target" onClick={handleSendMessage}>
              <MessageCircle className="mr-2 h-4 w-4" />Nachricht
            </Button>
            <Button variant="outline" size="sm" className="control-target" onClick={handleAssignBooking}>
              <CalendarPlus className="mr-2 h-4 w-4" />Buchung zuweisen
            </Button>
          </div>
        </div>

        <header className="rounded-lg border bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-[16rem] flex-1 basis-[24rem] items-center gap-3">
              <Avatar className="h-12 w-12 shrink-0 text-base">
                {(staffPhotoUrls[instructor.id] || instructor.avatar_url) && (
                  <AvatarImage src={staffPhotoUrls[instructor.id] || instructor.avatar_url} alt={`${instructor.first_name} ${instructor.last_name}`} />
                )}
                <AvatarFallback className="bg-primary/10 text-primary">{getInitials()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="break-words text-xl font-bold sm:text-2xl">{instructor.first_name} {instructor.last_name}</h1>
                <p className="text-muted-foreground">
                  {getSpecializationLabel(instructor.specialization, instructor.roles)} · {getLevelLabel(instructor.level)}
                </p>
              </div>
            </div>
            <div className="min-w-0 flex-1 basis-[20rem] sm:flex-none">
              <StatusToggle currentStatus={instructor.real_time_status} onStatusChange={updateStatus} isPulsing={isPulsing}
                isUpdating={isUpdatingStatus} lastChanged={formatLastChanged()} compact />
            </div>
          </div>
        </header>

        <section aria-label="Heutige Einsätze">
          <TodayScheduleCard bookings={todayBookings} compact />
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <ProfileInfoCard instructor={instructor} onEdit={handleEdit} compact />
          <div className="space-y-5">
            {isAdminOrOffice && id && <InstructorRentalsCard instructorId={id} />}
            <SeasonStatsCard stats={seasonStats} compact />
          </div>
        </div>

        {(canManageWebsite || isWebsitePublic) && (
          <section className="rounded-lg border bg-card p-4" aria-labelledby="website-profile-heading">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="website-profile-heading" className="font-semibold">Websiteprofil</h2>
                  <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" />{isWebsitePublic ? "Auf Website" : "Nur intern"}</Badge>
                </div>
                {isWebsitePublic && instructor.website_teaser && <p className="max-w-3xl break-words text-sm text-muted-foreground">{instructor.website_teaser}</p>}
              </div>
              {canManageWebsite && <Button variant="outline" size="sm" className="control-target" onClick={() => setWebsiteDialogOpen(true)}>Websiteprofil bearbeiten</Button>}
            </div>
          </section>
        )}

        {id && <AbsenceRequestCard instructorId={id} isTeacherView={isOwnProfile} />}
        {isAdminOrOffice && id && instructor && <RolesCapabilitiesCard instructorId={id} currentType={instructor.instructor_type} />}
        {id && <RecurringBlocksTab instructorId={id} />}

        <EditInstructorModal key={instructor.id} open={editModalOpen} onOpenChange={setEditModalOpen} instructor={instructor} />
        <WebsiteProfileDialog key={instructor.id} open={websiteDialogOpen} onOpenChange={setWebsiteDialogOpen} instructor={instructor} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button & Quick Actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/instructors")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Übersicht
        </Button>
        <div className="flex gap-2">
          {isAdminOrOffice && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => instructor?.id && inviteMutation.mutate(instructor.id)}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              <span className="hidden sm:inline">Einladen</span>
            </Button>
          )}
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
            {(staffPhotoUrls[instructor.id] || instructor.avatar_url) && (
              <AvatarImage src={staffPhotoUrls[instructor.id] || instructor.avatar_url} alt={`${instructor.first_name} ${instructor.last_name}`} />
            )}
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
              {getLevelLabel(instructor.level)} · {getSpecializationLabel(instructor.specialization, instructor.roles)}
            </p>
          </div>

          {/* Website publication is separate from changing an internal portrait. */}
          {(canManageWebsite || isWebsitePublic) && (
            <div className="max-w-md space-y-2">
              <Badge variant="secondary" className="gap-1">
                <Globe className="h-3 w-3" />
                {isWebsitePublic ? "Auf Website" : "Nur intern"}
              </Badge>
              {isWebsitePublic && instructor.website_teaser && (
                <p className="text-sm text-muted-foreground">{instructor.website_teaser}</p>
              )}
              {canManageWebsite && (
                <div><Button variant="link" size="sm" onClick={() => setWebsiteDialogOpen(true)}>
                  Websiteprofil bearbeiten
                </Button></div>
              )}
            </div>
          )}

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

        {/* Right Column - Today, Absences & Stats */}
        <div className="lg:col-span-2 space-y-6">
          <TodayScheduleCard bookings={todayBookings} />
          {isAdminOrOffice && id && <InstructorRentalsCard instructorId={id} />}
{id && (
            <AbsenceRequestCard 
              instructorId={id} 
              isTeacherView={isOwnProfile}
            />
          )}
          {id && <RecurringBlocksTab instructorId={id} />}
          <SeasonStatsCard stats={seasonStats} />
          {isAdminOrOffice && id && instructor && (
            <RolesCapabilitiesCard
              instructorId={id}
              currentType={instructor.instructor_type}
            />
          )}
        </div>
      </div>


      {instructor && (
        <EditInstructorModal
          key={instructor.id}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          instructor={instructor}
        />
      )}
      {canManageWebsite && instructor && (
        <WebsiteProfileDialog
          key={instructor.id}
          open={websiteDialogOpen}
          onOpenChange={setWebsiteDialogOpen}
          instructor={instructor}
        />
      )}
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
