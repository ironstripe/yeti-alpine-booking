import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import { TrainingCard } from '@/components/trainings/TrainingCard';
import { TrainingFormModal } from '@/components/trainings/TrainingFormModal';
import { TrainingsFilters } from '@/components/trainings/TrainingsFilters';
import { TrainingsEmptyState } from '@/components/trainings/TrainingsEmptyState';
import { TrainingsLayout } from '@/components/trainings/TrainingsLayout';
import { CourseRemovalDialog, RenameCourseDialog, type CourseRemovalMode } from '@/components/trainings/CourseManageDialogs';
import { useGroupCourses } from '@/hooks/useGroupCourses';
import type { GroupCourseWithSchedules } from '@/types/group-courses';

const Trainings = () => {
  const navigate = useNavigate();
  const { data: courses, isLoading } = useGroupCourses();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<GroupCourseWithSchedules | undefined>();
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'copy'>('create');
  const [renameCourse, setRenameCourse] = useState<GroupCourseWithSchedules | null>(null);
  const [removal, setRemoval] = useState<{ course: GroupCourseWithSchedules; mode: CourseRemovalMode } | null>(null);

  // Category toggle: 'courses' for customer trainings, 'internal' for office shifts
  const [category, setCategory] = useState<'courses' | 'internal'>('courses');

  // Filter state
  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const hasFilters = search !== '' || disciplineFilter !== 'all' || statusFilter !== 'all';

  const filteredCourses = useMemo(() => {
    if (!courses) return [];

    return courses.filter(course => {
      const isInternal = course.is_internal || course.course_type === 'office';
      if (category === 'internal' && !isInternal) return false;
      if (category === 'courses' && isInternal) return false;

      // Archived courses only appear in the explicit "Archiviert" filter.
      const isArchived = !!course.archived_at;
      if (statusFilter === 'archived') { if (!isArchived) return false; }
      else if (isArchived) return false;

      if (search && !course.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      if (category === 'courses' && disciplineFilter !== 'all' && course.discipline !== disciplineFilter) {
        return false;
      }

      if (statusFilter === 'active' || statusFilter === 'inactive') {
        const isActive = course.is_active ?? true;
        if (statusFilter === 'active' && !isActive) return false;
        if (statusFilter === 'inactive' && isActive) return false;
      }

      return true;
    });
  }, [courses, category, search, disciplineFilter, statusFilter]);

  const handleCreateClick = () => {
    setSelectedCourse(undefined);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleEditClick = (course: GroupCourseWithSchedules) => {
    setSelectedCourse(course);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleCopyClick = (course: GroupCourseWithSchedules) => {
    setSelectedCourse(course);
    setModalMode('copy');
    setIsModalOpen(true);
  };

  const handleViewCapacity = (course: GroupCourseWithSchedules) => {
    navigate(`/trainings/capacity?course=${course.id}`);
  };

  return (
    <TrainingsLayout
      actions={
        <Button size="sm" onClick={handleCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          {category === 'internal' ? 'Neue Schicht' : 'Neuer Kurs'}
        </Button>
      }
    >

      <Tabs value={category} onValueChange={(v) => setCategory(v as 'courses' | 'internal')} className="mb-4">
        <TabsList>
          <TabsTrigger value="courses">Kurse</TabsTrigger>
          <TabsTrigger value="internal">Intern</TabsTrigger>
        </TabsList>
      </Tabs>

      <TrainingsFilters
        search={search}
        onSearchChange={setSearch}
        disciplineFilter={disciplineFilter}
        onDisciplineFilterChange={setDisciplineFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        showDisciplineFilter={category === 'courses'}
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : filteredCourses.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map(course => (
            <TrainingCard
              key={course.id}
              course={course}
              onEdit={handleEditClick}
              onCopy={handleCopyClick}
              onViewCapacity={handleViewCapacity}
              onDelete={(c) => setRemoval({ course: c, mode: 'delete' })}
              onRename={setRenameCourse}
              onArchive={(c) => setRemoval({ course: c, mode: 'archive' })}
              onRestore={(c) => setRemoval({ course: c, mode: 'restore' })}
            />
          ))}
        </div>
      ) : (
        <TrainingsEmptyState
          onCreateClick={handleCreateClick}
          hasFilters={hasFilters}
        />
      )}

      <TrainingFormModal
        key={isModalOpen ? `${selectedCourse?.id ?? 'new'}-${modalMode}` : 'closed'}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        course={selectedCourse}
        mode={modalMode}
      />

      <RenameCourseDialog course={renameCourse} onClose={() => setRenameCourse(null)} />
      <CourseRemovalDialog
        course={removal?.course ?? null}
        mode={removal?.mode ?? 'delete'}
        onClose={() => setRemoval(null)}
        onSwitchToArchive={() => setRemoval((r) => (r ? { course: r.course, mode: 'archive' } : r))}
      />
    </TrainingsLayout>
  );
};

export default Trainings;
