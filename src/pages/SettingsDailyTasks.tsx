import { useState } from "react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DailyTaskForm } from "@/components/settings/DailyTaskForm";
import {
  useDailyTaskTemplates,
  useDeleteTaskTemplate,
  type DailyTaskTemplate,
} from "@/hooks/useDailyTasks";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function RecurrenceLabel({
  recurrence,
  weekdays,
}: {
  recurrence: string;
  weekdays: number[];
}) {
  if (recurrence === "daily") return <Badge variant="secondary">Täglich</Badge>;
  if (recurrence === "weekdays" && weekdays?.length === 5)
    return <Badge variant="secondary">Mo–Fr</Badge>;
  if (recurrence === "weekly" && weekdays?.length === 1) {
    return <Badge variant="secondary">Jeden {DAY_NAMES[weekdays[0]]}</Badge>;
  }

  return (
    <Badge variant="secondary">
      {weekdays?.map((d) => DAY_NAMES[d]).join(", ")}
    </Badge>
  );
}

export default function SettingsDailyTasks() {
  const [editingTask, setEditingTask] = useState<DailyTaskTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: tasks, isLoading } = useDailyTaskTemplates();
  const deleteMutation = useDeleteTaskTemplate();

  const handleEdit = (task: DailyTaskTemplate) => {
    setEditingTask(task);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingTask(null);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingTask(null);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Aufgabe "${title}" wirklich löschen?`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Aufgabe gelöscht");
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  return (
    <SettingsLayout
      title="Tagesaufgaben"
      description="Verwalte wiederkehrende Aufgaben für das Morgen-Cockpit"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Neue Aufgabe
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aufgabe</TableHead>
                  <TableHead>Fällig</TableHead>
                  <TableHead>Wiederholung</TableHead>
                  <TableHead className="w-[100px]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-12" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-16" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : tasks?.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-8"
                    >
                      Keine Aufgaben vorhanden. Erstelle deine erste Aufgabe.
                    </TableCell>
                  </TableRow>
                ) : (
                  tasks?.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {task.due_time?.slice(0, 5) || "–"}
                      </TableCell>
                      <TableCell>
                        <RecurrenceLabel
                          recurrence={task.recurrence}
                          weekdays={task.weekdays}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(task)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(task.id, task.title)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTask ? "Aufgabe bearbeiten" : "Neue Aufgabe erstellen"}
            </DialogTitle>
          </DialogHeader>
          <DailyTaskForm
            task={editingTask}
            onSuccess={handleDialogClose}
            onCancel={handleDialogClose}
          />
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}
