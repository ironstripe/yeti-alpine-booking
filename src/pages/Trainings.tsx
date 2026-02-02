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
import { useGroupCourses, useDeleteGroupCourse } from '@/hooks/useGroupCourses';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/hooks/use-toast';
import type { GroupCourseWithSchedules } from '@/types/group-courses';

const Trainings = () => {
  const navigate = useNavigate();
  const { data: courses, isLoading } = useGroupCourses();
  const deleteCourse = useDeleteGroupCourse();
  const { confirm, dialog } = useConfirmDialog();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<GroupCourseWithSchedules | undefined>();
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'copy'>('create');

  // Category toggle: 'courses' for customer trainings, 'internal' for office shifts
  const [category, setCategory] = useState<'courses' | 'internal'>('courses');

  // Filter state
  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const hasFilters = search !== '' || disciplineFilter !== 'all' || statusFilter !== 'all';

  // Filter courses by category first, then by other filters
  const filteredCourses = useMemo(() => {
    if (!courses) return [];

    return courses.filter(course => {
      // Category filter - internal vs customer-facing
      const isInternal = course.is_internal || course.course_type === 'office';
      if (category === 'internal' && !isInternal) return false;
      if (category === 'courses' && isInternal) return false;

      // Search filter - search by name (which IS the level)
      if (search && !course.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // Discipline filter (not relevant for internal trainings)
      if (category === 'courses' && disciplineFilter !== 'all' && course.discipline !== disciplineFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
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

  const handleViewInstances = (course: GroupCourseWithSchedules) => {
    navigate(`/trainings/${course.id}/instances`);
  };

  const handleDeleteClick = async (course: GroupCourseWithSchedules) => {
    const confirmed = await confirm({
      title: 'Training löschen',
      description: `Bist du sicher, dass du "${course.name}" löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      variant: 'destructive',
    });

    if (confirmed) {
      deleteCourse.mutate(course.id, {
        onSuccess: () => {
          toast({
            title: 'Training gelöscht',
            description: `"${course.name}" wurde erfolgreich gelöscht.`,
          });
        },
        onError: () => {
          toast({
            title: 'Fehler',
            description: 'Das Training konnte nicht gelöscht werden.',
            variant: 'destructive',
          });
        },
      });
    }
  };

  return (
    <TrainingsLayout
      actions={
        <Button size="sm" onClick={handleCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          {category === 'internal' ? 'Neue Schicht' : 'Neues Training'}
        </Button>
      }
    >

      {/* Category Tabs */}
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
              onViewInstances={handleViewInstances}
              onDelete={handleDeleteClick}
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

      {dialog}
    </TrainingsLayout>
  );
};

export default Trainings;
