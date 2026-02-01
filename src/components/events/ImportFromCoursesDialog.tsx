import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useGroupCourses } from "@/hooks/useGroupCourses";
import {
  useCreateEventCategory,
  useCreateEventParticipant,
  type Event,
} from "@/hooks/useEvents";

interface ImportFromCoursesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
}

export function ImportFromCoursesDialog({
  open,
  onOpenChange,
  event,
}: ImportFromCoursesDialogProps) {
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const { data: courses, isLoading } = useGroupCourses();
  const createCategory = useCreateEventCategory();
  const createParticipant = useCreateEventParticipant();

  // Filter to active weekly courses
  const weeklyCourses = courses?.filter(
    (c) => c.is_active && c.course_type === "weekly"
  ) || [];

  const handleToggleCourse = (courseId: string) => {
    setSelectedCourses((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const handleImport = async () => {
    if (selectedCourses.length === 0) {
      toast.error("Bitte wähle mindestens einen Kurs aus");
      return;
    }

    setIsImporting(true);

    try {
      // For each selected course, create a category
      for (const courseId of selectedCourses) {
        const course = weeklyCourses.find((c) => c.id === courseId);
        if (!course) continue;

        // Create category for this course
        const categoryData = {
          event_id: event.id,
          name: course.name,
          category_type: "course" as const,
          training_id: courseId,
          discipline: course.discipline as "ski" | "snowboard" | null,
          color: course.color,
          sort_order: weeklyCourses.indexOf(course),
        };

        await createCategory.mutateAsync(categoryData);
      }

      toast.success(`${selectedCourses.length} Kurse importiert`);
      setSelectedCourses([]);
      onOpenChange(false);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Fehler beim Importieren");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aus Kursen importieren</DialogTitle>
          <DialogDescription>
            Wähle die Kurse aus, deren Teilnehmer importiert werden sollen.
            Teilnehmer mit 3+ Tagen werden automatisch angemeldet.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : weeklyCourses.length > 0 ? (
          <div className="space-y-3 max-h-[300px] overflow-y-auto py-2">
            {weeklyCourses.map((course) => (
              <div key={course.id} className="flex items-center space-x-3">
                <Checkbox
                  id={course.id}
                  checked={selectedCourses.includes(course.id)}
                  onCheckedChange={() => handleToggleCourse(course.id)}
                />
                <Label
                  htmlFor={course.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  {course.color && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: course.color }}
                    />
                  )}
                  <span>{course.name}</span>
                  <span className="text-muted-foreground text-sm">
                    ({course.discipline})
                  </span>
                </Label>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">
            Keine aktiven Wochenkurse gefunden
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || selectedCourses.length === 0}
          >
            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedCourses.length > 0
              ? `${selectedCourses.length} Kurse importieren`
              : "Importieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
