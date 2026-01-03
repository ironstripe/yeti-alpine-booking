import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, ExternalLink, UserPlus, X } from "lucide-react";
import { useActionTasks, useCompleteTask, useDismissTask, ActionTask } from "@/hooks/useActionTasks";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isToday, isTomorrow, isPast } from "date-fns";
import { de } from "date-fns/locale";

function formatDueDate(dateStr: string | null): { text: string; isUrgent: boolean } {
  if (!dateStr) return { text: "Kein Datum", isUrgent: false };
  
  const date = parseISO(dateStr);
  
  if (isToday(date)) {
    return { text: "Heute", isUrgent: true };
  }
  if (isTomorrow(date)) {
    return { text: "Morgen", isUrgent: true };
  }
  if (isPast(date)) {
    return { text: `Überfällig (${format(date, "dd.MM.", { locale: de })})`, isUrgent: true };
  }
  
  return { text: format(date, "dd.MM.yyyy", { locale: de }), isUrgent: false };
}

function getTaskIcon(taskType: string) {
  switch (taskType) {
    case "assign_instructor":
      return <UserPlus className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

function TaskItem({ task }: { task: ActionTask }) {
  const navigate = useNavigate();
  const completeTask = useCompleteTask();
  const dismissTask = useDismissTask();
  
  const { text: dueDateText, isUrgent } = formatDueDate(task.due_date);
  const customerName = task.ticket?.customer
    ? `${task.ticket.customer.first_name || ""} ${task.ticket.customer.last_name}`.trim()
    : "Unbekannt";

  const handleNavigateToBooking = () => {
    if (task.related_ticket_id) {
      // Navigate to booking detail (future) or scheduler for now
      navigate(`/bookings?highlight=${task.related_ticket_id}`);
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
        {getTaskIcon(task.task_type)}
      </div>
      
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{task.title}</span>
          {task.priority === "high" && (
            <Badge variant="destructive" className="text-xs">Dringend</Badge>
          )}
        </div>
        
        {task.description && (
          <p className="text-sm text-muted-foreground truncate">{task.description}</p>
        )}
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {task.ticket && (
            <span className="font-mono">{task.ticket.ticket_number}</span>
          )}
          <span>•</span>
          <span>{customerName}</span>
          <span>•</span>
          <span className={isUrgent ? "text-destructive font-medium" : ""}>
            {dueDateText}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleNavigateToBooking}
          title="Zur Buchung"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
          onClick={() => completeTask.mutate(task.id)}
          disabled={completeTask.isPending}
          title="Als erledigt markieren"
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => dismissTask.mutate(task.id)}
          disabled={dismissTask.isPending}
          title="Verwerfen"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function PendingActionsCard() {
  const { data: tasks, isLoading } = useActionTasks("pending");

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Ausstehende Aktionen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!tasks || tasks.length === 0) {
    return null; // Don't show card if no pending tasks
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Ausstehende Aktionen</CardTitle>
          <Badge variant="secondary">{tasks.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </CardContent>
    </Card>
  );
}
