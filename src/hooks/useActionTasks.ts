import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ActionTask {
  id: string;
  created_at: string;
  task_type: string;
  title: string;
  description: string | null;
  related_ticket_id: string | null;
  related_ticket_item_id: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  // Joined data
  ticket?: {
    ticket_number: string;
    customer: {
      first_name: string | null;
      last_name: string;
    } | null;
  } | null;
}

export function useActionTasks(status: "pending" | "completed" | "all" = "pending") {
  return useQuery({
    queryKey: ["action-tasks", status],
    queryFn: async () => {
      let query = supabase
        .from("action_tasks")
        .select(`
          *,
          ticket:tickets(
            ticket_number,
            customer:customers(first_name, last_name)
          )
        `)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ActionTask[];
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("action_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: user?.id || null,
        })
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-tasks"] });
      toast.success("Aufgabe erledigt");
    },
    onError: (error) => {
      console.error("Error completing task:", error);
      toast.error("Fehler beim Erledigen der Aufgabe");
    },
  });
}

export function useDismissTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("action_tasks")
        .update({ status: "dismissed" })
        .eq("id", taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-tasks"] });
      toast.success("Aufgabe verworfen");
    },
    onError: (error) => {
      console.error("Error dismissing task:", error);
      toast.error("Fehler beim Verwerfen der Aufgabe");
    },
  });
}

interface CreateTaskParams {
  task_type: string;
  title: string;
  description?: string;
  related_ticket_id?: string;
  related_ticket_item_id?: string;
  due_date?: string;
  priority?: "low" | "normal" | "high";
}

export function useCreateActionTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateTaskParams) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("action_tasks")
        .insert({
          task_type: params.task_type,
          title: params.title,
          description: params.description || null,
          related_ticket_id: params.related_ticket_id || null,
          related_ticket_item_id: params.related_ticket_item_id || null,
          due_date: params.due_date || null,
          priority: params.priority || "normal",
          status: "pending",
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-tasks"] });
    },
    onError: (error) => {
      console.error("Error creating task:", error);
    },
  });
}
