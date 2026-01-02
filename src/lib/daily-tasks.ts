import { Printer, Users, PartyPopper, MessageSquare, Star, type LucideIcon } from "lucide-react";
import { format } from "date-fns";

export interface DailyTask {
  id: string;
  label: string;
  time?: string;
  icon: LucideIcon;
  type?: "whatsapp";
  template?: "welcome" | "bbq" | "thank_you" | "review";
}

export const DAILY_TASKS: Record<string, DailyTask[]> = {
  daily: [
    { id: "lunch-list", label: "Mittagsliste drucken", time: "09:00", icon: Printer }
  ],
  sunday: [
    { id: "welcome-wa", label: "Willkommens-WhatsApp senden", icon: MessageSquare, type: "whatsapp", template: "welcome" },
    { id: "group-assign", label: "Gruppeneinteilung prüfen", icon: Users }
  ],
  monday: [
    { id: "bbq-invite", label: "BBQ-Einladungen versenden", icon: PartyPopper, type: "whatsapp", template: "bbq" }
  ],
  saturday: [
    { id: "thank-you", label: "Dankes-Nachricht senden", icon: MessageSquare, type: "whatsapp", template: "thank_you" },
    { id: "google-review", label: "Google-Bewertung anfragen", icon: Star, type: "whatsapp", template: "review" }
  ]
};

export function getTodaysTasks(): DailyTask[] {
  const dayOfWeek = format(new Date(), "EEEE").toLowerCase();
  const dailyTasks = DAILY_TASKS.daily || [];
  const daySpecificTasks = DAILY_TASKS[dayOfWeek] || [];
  
  return [...dailyTasks, ...daySpecificTasks];
}

export function getStorageKey(): string {
  return `cockpit-tasks-${format(new Date(), "yyyy-MM-dd")}`;
}

export function getCompletedTasks(): string[] {
  const key = getStorageKey();
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

export function setTaskCompleted(taskId: string, completed: boolean): void {
  const key = getStorageKey();
  const current = getCompletedTasks();
  
  if (completed && !current.includes(taskId)) {
    localStorage.setItem(key, JSON.stringify([...current, taskId]));
  } else if (!completed) {
    localStorage.setItem(key, JSON.stringify(current.filter(id => id !== taskId)));
  }
}
