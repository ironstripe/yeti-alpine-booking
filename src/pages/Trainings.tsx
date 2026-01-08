import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus } from 'lucide-react';
import { TrainingCard } from '@/components/trainings/TrainingCard';
import { TrainingFormModal } from '@/components/trainings/TrainingFormModal';
import { TrainingsFilters } from '@/components/trainings/TrainingsFilters';
import { TrainingsEmptyState } from '@/components/trainings/TrainingsEmptyState';
import { useGroupCourses } from '@/hooks/useGroupCourses';
import type { GroupCourseWithSchedules } from '@/types/group-courses';

const Trainings = () => {
  const navigate = useNavigate();
  const { data: courses, isLoading } = useGroupCourses();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<GroupCourseWithSchedules | undefined>();

  // Filter state
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('all');
  const [disciplineFilter, setDisciplineFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const hasFilters = search !== '' || skillFilter !== 'all' || disciplineFilter !== 'all' || statusFilter !== 'all';

  // Filter courses
  const filteredCourses = useMemo(() => {
    if (!courses) return [];

    return courses.filter(course => {
      // Search filter
      if (search && !course.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      // Skill level filter
      if (skillFilter !== 'all' && course.skill_level !== skillFilter) {
        return false;
      }

      // Discipline filter
      if (disciplineFilter !== 'all' && course.discipline !== disciplineFilter) {
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
  }, [courses, search, skillFilter, disciplineFilter, statusFilter]);

  const handleCreateClick = () => {
    setSelectedCourse(undefined);
    setIsModalOpen(true);
  };

  const handleEditClick = (course: GroupCourseWithSchedules) => {
    setSelectedCourse(course);
    setIsModalOpen(true);
  };

  const handleViewInstances = (course: GroupCourseWithSchedules) => {
    navigate(`/trainings/${course.id}/instances`);
  };

  return (
    <>
      <PageHeader
        title="Trainings"
        description="Verwalte wiederkehrende Gruppenkurse und deren Instanzen."
        actions={
          <Button size="sm" onClick={handleCreateClick}>
            <Plus className="h-4 w-4 mr-2" />
            Neues Training
          </Button>
        }
      />

      <TrainingsFilters
        search={search}
        onSearchChange={setSearch}
        skillFilter={skillFilter}
        onSkillFilterChange={setSkillFilter}
        disciplineFilter={disciplineFilter}
        onDisciplineFilterChange={setDisciplineFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
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
              onViewInstances={handleViewInstances}
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
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        course={selectedCourse}
      />
    </>
  );
};

export default Trainings;
