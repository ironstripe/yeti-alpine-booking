import { useState } from "react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, UtensilsCrossed, Users, FileText, UserCheck, ClipboardList, BarChart3 } from "lucide-react";
import { format, addDays, subDays, isToday, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import {
  useLunchChildren,
  useGroups,
  useDailyBookings,
  useInstructorSchedules,
  useListsSummary,
} from "@/hooks/useListsData";
import { DocumentCard } from "@/components/lists/DocumentCard";
import { LunchListPreview } from "@/components/lists/LunchListPreview";
import { GroupAssignmentPreview } from "@/components/lists/GroupAssignmentPreview";
import { DailyOverviewPreview } from "@/components/lists/DailyOverviewPreview";
import { InstructorSchedulePreview } from "@/components/lists/InstructorSchedulePreview";
import { AttendanceListPreview } from "@/components/lists/AttendanceListPreview";
import { BatchPrintCard } from "@/components/lists/BatchPrintCard";

export default function Lists() {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));

  // Modal states
  const [lunchListOpen, setLunchListOpen] = useState(false);
  const [groupAssignmentOpen, setGroupAssignmentOpen] = useState(false);
  const [dailyOverviewOpen, setDailyOverviewOpen] = useState(false);
  const [instructorScheduleOpen, setInstructorScheduleOpen] = useState(false);
  const [attendanceListOpen, setAttendanceListOpen] = useState(false);

  // Lunch list options
  const [showAllergies, setShowAllergies] = useState(true);
  const [showEmergencyContact, setShowEmergencyContact] = useState(true);
  const [showGroup, setShowGroup] = useState(false);

  // Group assignment options
  const [showLevel, setShowLevel] = useState(true);
  const [showLanguage, setShowLanguage] = useState(true);
  const [showParentContact, setShowParentContact] = useState(false);

  // Daily overview options
  const [showPaymentStatus, setShowPaymentStatus] = useState(true);
  const [showContact, setShowContact] = useState(true);
  const [showInternalNotes, setShowInternalNotes] = useState(false);

  // Instructor schedule options
  const [onlyWithBookings, setOnlyWithBookings] = useState(true);
  const [showInstructorContact, setShowInstructorContact] = useState(true);
  const [showParticipantDetails, setShowParticipantDetails] = useState(true);

  // Attendance list options
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Batch print options
  const [batchLunchList, setBatchLunchList] = useState(true);
  const [batchGroupAssignment, setBatchGroupAssignment] = useState(true);
  const [batchInstructorSchedules, setBatchInstructorSchedules] = useState(true);
  const [batchDailyOverview, setBatchDailyOverview] = useState(false);
  const [batchAttendanceLists, setBatchAttendanceLists] = useState(false);

  // Data hooks
  const { data: lunchChildren = [] } = useLunchChildren(selectedDate);
  const { data: groups = [] } = useGroups(selectedDate);
  const { data: bookings = [] } = useDailyBookings(selectedDate);
  const { data: instructors = [] } = useInstructorSchedules(selectedDate);
  const summary = useListsSummary(selectedDate);

  const dateDisplay = format(selectedDate, "EEEE, d. MMMM yyyy", { locale: de });

  const handleBatchPrint = () => {
    // For MVP, just open all selected dialogs
    toast.info("Stapeldruck: Bitte drucken Sie die Listen einzeln über die jeweiligen Dialoge.");
    if (batchLunchList && lunchChildren.length > 0) setLunchListOpen(true);
    else if (batchGroupAssignment && groups.length > 0) setGroupAssignmentOpen(true);
    else if (batchInstructorSchedules && instructors.length > 0) setInstructorScheduleOpen(true);
    else if (batchDailyOverview && bookings.length > 0) setDailyOverviewOpen(true);
  };

  const hasAnyBatchSelection =
    batchLunchList || batchGroupAssignment || batchInstructorSchedules || batchDailyOverview || batchAttendanceLists;

  return (
    <>
      <PageHeader
        title="Listen & Dokumente"
        description={dateDisplay}
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedDate(subDays(selectedDate, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {!isToday(selectedDate) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(startOfDay(new Date()))}
              >
                Heute
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        {/* Document Cards Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verfügbare Listen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <DocumentCard
                icon={UtensilsCrossed}
                title="Mittagsliste"
                subtitle="Kinder mit Mittagsbetreuung"
                count={summary.lunchChildrenCount}
                countLabel="Kinder"
                onGenerate={() => setLunchListOpen(true)}
              />
              <DocumentCard
                icon={Users}
                title="Gruppeneinteilung"
                subtitle="Alle Gruppen mit Teilnehmern"
                count={summary.groupsCount}
                countLabel="Gruppen"
                onGenerate={() => setGroupAssignmentOpen(true)}
              />
              <DocumentCard
                icon={FileText}
                title="Tagesübersicht"
                subtitle="Alle Buchungen des Tages"
                count={summary.bookingsCount}
                countLabel="Buchungen"
                onGenerate={() => setDailyOverviewOpen(true)}
              />
              <DocumentCard
                icon={UserCheck}
                title="Skilehrer-Einsatzplan"
                subtitle="Individuelle Tagespläne"
                count={summary.instructorsCount}
                countLabel="Lehrer"
                onGenerate={() => setInstructorScheduleOpen(true)}
              />
              <DocumentCard
                icon={ClipboardList}
                title="Anwesenheitsliste"
                subtitle="Zum Ausfüllen pro Gruppe"
                count={summary.groupsCount}
                countLabel="Gruppen"
                onGenerate={() => {
                  if (groups.length > 0 && !selectedGroupId) {
                    setSelectedGroupId(groups[0].id);
                  }
                  setAttendanceListOpen(true);
                }}
              />
              <DocumentCard
                icon={BarChart3}
                title="Ticket-Übersicht"
                subtitle="Alle offenen Tickets"
                count={summary.bookingsCount}
                countLabel="Tickets"
                onGenerate={() => setDailyOverviewOpen(true)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Batch Print */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <BatchPrintCard
            lunchList={batchLunchList}
            setLunchList={setBatchLunchList}
            groupAssignment={batchGroupAssignment}
            setGroupAssignment={setBatchGroupAssignment}
            instructorSchedules={batchInstructorSchedules}
            setInstructorSchedules={setBatchInstructorSchedules}
            dailyOverview={batchDailyOverview}
            setDailyOverview={setBatchDailyOverview}
            attendanceLists={batchAttendanceLists}
            setAttendanceLists={setBatchAttendanceLists}
            onPrint={handleBatchPrint}
            hasAnySelection={hasAnyBatchSelection}
          />

          {/* Quick Info Card */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Hinweise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                • Alle Listen werden für den ausgewählten Tag generiert
              </p>
              <p>
                • "Als PDF speichern" öffnet den Browser-Druckdialog - wählen Sie dort "Als PDF speichern"
              </p>
              <p>
                • Die Skilehrer-Einsatzpläne können einzeln (A5) oder als Übersicht gedruckt werden
              </p>
              <p>
                • Anwesenheitslisten werden pro Gruppe erstellt und enthalten Checkboxen zum Abhaken
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <LunchListPreview
        open={lunchListOpen}
        onOpenChange={setLunchListOpen}
        date={selectedDate}
        children={lunchChildren}
        showAllergies={showAllergies}
        setShowAllergies={setShowAllergies}
        showEmergencyContact={showEmergencyContact}
        setShowEmergencyContact={setShowEmergencyContact}
        showGroup={showGroup}
        setShowGroup={setShowGroup}
      />

      <GroupAssignmentPreview
        open={groupAssignmentOpen}
        onOpenChange={setGroupAssignmentOpen}
        date={selectedDate}
        groups={groups}
        showLevel={showLevel}
        setShowLevel={setShowLevel}
        showLanguage={showLanguage}
        setShowLanguage={setShowLanguage}
        showParentContact={showParentContact}
        setShowParentContact={setShowParentContact}
      />

      <DailyOverviewPreview
        open={dailyOverviewOpen}
        onOpenChange={setDailyOverviewOpen}
        date={selectedDate}
        bookings={bookings}
        showPaymentStatus={showPaymentStatus}
        setShowPaymentStatus={setShowPaymentStatus}
        showContact={showContact}
        setShowContact={setShowContact}
        showInternalNotes={showInternalNotes}
        setShowInternalNotes={setShowInternalNotes}
      />

      <InstructorSchedulePreview
        open={instructorScheduleOpen}
        onOpenChange={setInstructorScheduleOpen}
        date={selectedDate}
        instructors={instructors}
        onlyWithBookings={onlyWithBookings}
        setOnlyWithBookings={setOnlyWithBookings}
        showContact={showInstructorContact}
        setShowContact={setShowInstructorContact}
        showParticipantDetails={showParticipantDetails}
        setShowParticipantDetails={setShowParticipantDetails}
      />

      <AttendanceListPreview
        open={attendanceListOpen}
        onOpenChange={setAttendanceListOpen}
        date={selectedDate}
        groups={groups}
        selectedGroupId={selectedGroupId}
        setSelectedGroupId={setSelectedGroupId}
      />
    </>
  );
}
