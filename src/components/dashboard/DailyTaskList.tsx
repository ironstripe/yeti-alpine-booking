import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Printer, ClipboardList, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTodaysTasks, useToggleTaskCompletion } from "@/hooks/useDailyTasks";
import { cn } from "@/lib/utils";

export function DailyTaskList() {
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useTodaysTasks();
  const toggleMutation = useToggleTaskCompletion();

  const handleToggle = (templateId: string, isCompleted: boolean) => {
    toggleMutation.mutate({ templateId, isCompleted });
  };

  const handleLinkedAction = (action: string) => {
    switch (action) {
      case "print_lunch_list":
        navigate("/lists?tab=lunch&print=true");
        break;
      case "print_group_list":
        navigate("/lists?tab=groups&print=true");
        break;
      case "print_instructor_schedule":
        navigate("/lists?tab=instructor&print=true");
        break;
      case "print_daily_overview":
        navigate("/lists?tab=daily&print=true");
        break;
      default:
        break;
    }
  };

  const completedCount = tasks?.filter((t) => t.isCompleted).length || 0;
  const totalCount = tasks?.length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Tagesaufgaben
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Tagesaufgaben
            </span>
            <Link to="/settings/daily-tasks">
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-4">
            Keine Aufgaben für heute.{" "}
            <Link
              to="/settings/daily-tasks"
              className="text-primary hover:underline"
            >
              Aufgaben verwalten
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const openTasks = tasks.filter((t) => !t.isCompleted);
  const doneTasks = tasks.filter((t) => t.isCompleted);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Tagesaufgaben
            {openTasks.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {completedCount}/{totalCount}
              </Badge>
            )}
            {openTasks.length === 0 && totalCount > 0 && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                ✓ Alles erledigt
              </Badge>
            )}
          </span>
          <Link to="/settings/daily-tasks">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {openTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={() => handleToggle(task.id, task.isCompleted)}
            onAction={handleLinkedAction}
          />
        ))}

        {doneTasks.length > 0 && openTasks.length > 0 && (
          <div className="border-t pt-2 mt-2" />
        )}

        {doneTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={() => handleToggle(task.id, task.isCompleted)}
            onAction={handleLinkedAction}
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface TaskItemProps {
  task: {
    id: string;
    title: string;
    due_time: string | null;
    linked_action: string | null;
    isCompleted: boolean;
  };
  onToggle: () => void;
  onAction: (action: string) => void;
}

function TaskItem({ task, onToggle, onAction }: TaskItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-md transition-colors",
        task.isCompleted ? "opacity-50" : "hover:bg-muted/50"
      )}
    >
      <Checkbox
        checked={task.isCompleted}
        onCheckedChange={onToggle}
        className="shrink-0"
      />
      <span
        className={cn(
          "text-sm flex-1",
          task.isCompleted && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </span>
      {task.due_time && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {task.due_time.slice(0, 5)}
        </span>
      )}
      {task.linked_action && !task.isCompleted && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={() => onAction(task.linked_action!)}
        >
          <Printer className="h-3 w-3" />
          Drucken
        </Button>
      )}
    </div>
  );
}
