import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Clock } from "lucide-react";
import { getTodaysTasks, getCompletedTasks, setTaskCompleted, type DailyTask } from "@/lib/daily-tasks";
import { WhatsAppButton } from "./WhatsAppButton";
import { cn } from "@/lib/utils";

export function DailyTaskList() {
  const [tasks] = useState<DailyTask[]>(getTodaysTasks);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  useEffect(() => {
    setCompletedIds(getCompletedTasks());
  }, []);

  const handleToggle = (taskId: string) => {
    const isCompleted = completedIds.includes(taskId);
    setTaskCompleted(taskId, !isCompleted);
    setCompletedIds(prev => 
      isCompleted 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const openTasks = tasks.filter(t => !completedIds.includes(t.id));
  const doneTasks = tasks.filter(t => completedIds.includes(t.id));

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Tagesaufgaben
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Keine Aufgaben für heute.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Tagesaufgaben
          {openTasks.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {openTasks.length} offen
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {openTasks.map(task => (
          <TaskItem 
            key={task.id} 
            task={task} 
            completed={false} 
            onToggle={() => handleToggle(task.id)} 
          />
        ))}
        
        {doneTasks.length > 0 && openTasks.length > 0 && (
          <div className="border-t pt-2 mt-2" />
        )}
        
        {doneTasks.map(task => (
          <TaskItem 
            key={task.id} 
            task={task} 
            completed={true} 
            onToggle={() => handleToggle(task.id)} 
          />
        ))}
      </CardContent>
    </Card>
  );
}

interface TaskItemProps {
  task: DailyTask;
  completed: boolean;
  onToggle: () => void;
}

function TaskItem({ task, completed, onToggle }: TaskItemProps) {
  const Icon = task.icon;
  
  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-md transition-colors",
      completed ? "opacity-50" : "hover:bg-muted/50"
    )}>
      <Checkbox 
        checked={completed} 
        onCheckedChange={onToggle}
        className="shrink-0"
      />
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className={cn(
        "text-sm flex-1",
        completed && "line-through text-muted-foreground"
      )}>
        {task.label}
      </span>
      {task.time && (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {task.time}
        </span>
      )}
      {task.type === "whatsapp" && task.template && !completed && (
        <WhatsAppButton template={task.template} />
      )}
    </div>
  );
}
