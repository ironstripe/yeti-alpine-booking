import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, getDay } from "date-fns";

export interface DailyTaskTemplate {
  id: string;
  title: string;
  due_time: string | null;
  recurrence: "daily" | "weekdays" | "weekly";
  weekdays: number[];
  linked_action: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyTaskWithCompletion extends DailyTaskTemplate {
  isCompleted: boolean;
}

export function useDailyTaskTemplates() {
  return useQuery({
    queryKey: ["daily-task-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_task_templates")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as DailyTaskTemplate[];
    },
  });
}

export function useTodaysTasks() {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const dayOfWeek = getDay(today); // 0 = Sunday

  return useQuery({
    queryKey: ["daily-tasks-today", todayStr],
    queryFn: async () => {
      // Get templates for today
      const { data: templates, error: tErr } = await supabase
        .from("daily_task_templates")
        .select("*")
        .eq("is_active", true)
        .contains("weekdays", [dayOfWeek])
        .order("sort_order", { ascending: true });
      if (tErr) throw tErr;

      // Get completions for today
      const { data: completions, error: cErr } = await supabase
        .from("daily_task_completions")
        .select("template_id")
        .eq("completed_date", todayStr);
      if (cErr) throw cErr;

      const completedIds = new Set(completions?.map((c) => c.template_id));

      return (templates as DailyTaskTemplate[])?.map((t) => ({
        ...t,
        isCompleted: completedIds.has(t.id),
      })) as DailyTaskWithCompletion[];
    },
  });
}

export function useToggleTaskCompletion() {
  const queryClient = useQueryClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return useMutation({
    mutationFn: async ({
      templateId,
      isCompleted,
    }: {
      templateId: string;
      isCompleted: boolean;
    }) => {
      if (isCompleted) {
        // Mark as incomplete (delete completion)
        const { error } = await supabase
          .from("daily_task_completions")
          .delete()
          .eq("template_id", templateId)
          .eq("completed_date", todayStr);
        if (error) throw error;
      } else {
        // Mark as complete
        const { error } = await supabase
          .from("daily_task_completions")
          .insert({ template_id: templateId, completed_date: todayStr });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-tasks-today"] });
    },
  });
}

export function useCreateTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: Omit<DailyTaskTemplate, "id" | "created_at" | "updated_at">
    ) => {
      const { error } = await supabase
        .from("daily_task_templates")
        .insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-task-templates"] });
    },
  });
}

export function useUpdateTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Partial<DailyTaskTemplate> & { id: string }) => {
      const { error } = await supabase
        .from("daily_task_templates")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-task-templates"] });
    },
  });
}

export function useDeleteTaskTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("daily_task_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-task-templates"] });
    },
  });
}
