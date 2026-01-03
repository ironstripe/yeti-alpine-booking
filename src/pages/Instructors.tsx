import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Plus, Upload } from "lucide-react";
import { useInstructors, type InstructorWithBookings } from "@/hooks/useInstructors";
import { StatusSummaryBar } from "@/components/instructors/StatusSummaryBar";
import { InstructorFilters } from "@/components/instructors/InstructorFilters";
import { InstructorCard } from "@/components/instructors/InstructorCard";
import { InstructorEmptyState } from "@/components/instructors/InstructorEmptyState";
import { InstructorGridSkeleton } from "@/components/instructors/InstructorCardSkeleton";
import { NewInstructorModal } from "@/components/instructors/NewInstructorModal";
import { BulkUploadModal } from "@/components/instructors/BulkUploadModal";

const Instructors = () => {
  const navigate = useNavigate();
  const { data: instructors = [], isLoading, pulsingIds } = useInstructors();

  // Modal state
  const [isNewInstructorModalOpen, setIsNewInstructorModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [specializationFilter, setSpecializationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name-asc");
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [realTimeStatusFilter, setRealTimeStatusFilter] = useState<string | null>(null);

  // Filter and sort instructors
  const filteredInstructors = useMemo(() => {
    let result = [...instructors];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.first_name.toLowerCase().includes(query) ||
          i.last_name.toLowerCase().includes(query)
      );
    }

    // Specialization filter
    if (specializationFilter !== "all") {
      result = result.filter((i) => i.specialization === specializationFilter);
    }

    // Active/Inactive status filter
    if (statusFilter !== "all") {
      result = result.filter((i) => i.status === statusFilter);
    }

    // Real-time status filter (from summary bar)
    if (realTimeStatusFilter) {
      if (realTimeStatusFilter === "unavailable") {
        result = result.filter(
          (i) => i.real_time_status === "unavailable" || !i.real_time_status
        );
      } else {
        result = result.filter((i) => i.real_time_status === realTimeStatusFilter);
      }
    }

    // Show only available toggle
    if (showOnlyAvailable) {
      result = result.filter((i) => i.real_time_status === "available");
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`
          );
        case "name-desc":
          return `${b.last_name} ${b.first_name}`.localeCompare(
            `${a.last_name} ${a.first_name}`
          );
        case "status": {
          const statusOrder = { available: 0, on_call: 1, unavailable: 2 };
          const aOrder = statusOrder[a.real_time_status as keyof typeof statusOrder] ?? 2;
          const bOrder = statusOrder[b.real_time_status as keyof typeof statusOrder] ?? 2;
          return aOrder - bOrder;
        }
        default:
          return 0;
      }
    });

    return result;
  }, [
    instructors,
    searchQuery,
    specializationFilter,
    statusFilter,
    sortBy,
    showOnlyAvailable,
    realTimeStatusFilter,
  ]);

  const hasFilters =
    searchQuery !== "" ||
    specializationFilter !== "all" ||
    statusFilter !== "all" ||
    showOnlyAvailable ||
    realTimeStatusFilter !== null;

  const clearFilters = () => {
    setSearchQuery("");
    setSpecializationFilter("all");
    setStatusFilter("all");
    setShowOnlyAvailable(false);
    setRealTimeStatusFilter(null);
  };

  const handleAddInstructor = () => {
    setIsNewInstructorModalOpen(true);
  };

  const handleInstructorClick = (instructor: InstructorWithBookings) => {
    navigate(`/instructors/${instructor.id}`);
  };

  return (
    <>
      <PageHeader
        title="Skilehrer"
        description="Übersicht aller Skilehrer und ihre Verfügbarkeit"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsBulkUploadModalOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button size="sm" onClick={handleAddInstructor}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Skilehrer
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <InstructorGridSkeleton />
      ) : (
        <>
          <StatusSummaryBar
            instructors={instructors}
            activeFilter={realTimeStatusFilter}
            onFilterClick={setRealTimeStatusFilter}
          />

          <InstructorFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            specializationFilter={specializationFilter}
            onSpecializationChange={setSpecializationFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            showOnlyAvailable={showOnlyAvailable}
            onShowOnlyAvailableChange={setShowOnlyAvailable}
          />

          {filteredInstructors.length === 0 ? (
            <InstructorEmptyState
              hasFilters={hasFilters}
              onClearFilters={clearFilters}
              onAddInstructor={handleAddInstructor}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredInstructors.map((instructor) => (
                <InstructorCard
                  key={instructor.id}
                  instructor={instructor}
                  isPulsing={pulsingIds.has(instructor.id)}
                  onClick={() => handleInstructorClick(instructor)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <NewInstructorModal
        open={isNewInstructorModalOpen}
        onOpenChange={setIsNewInstructorModalOpen}
      />

      <BulkUploadModal
        open={isBulkUploadModalOpen}
        onOpenChange={setIsBulkUploadModalOpen}
      />
    </>
  );
};

export default Instructors;
