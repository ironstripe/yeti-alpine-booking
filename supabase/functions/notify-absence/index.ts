import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  instructorId: string;
  instructorEmail: string;
  instructorPhone: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  action: "created" | "approved" | "rejected";
  triggeredBy?: "admin" | "teacher";
  rejectionReason?: string;
}

const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  organization: "Organisation",
  office_duty: "Bürodienst",
  other: "Sonstiges",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: NotificationPayload = await req.json();
    console.log("Received notification request:", payload);

    // Format the date range
    const formatDateRange = (start: string, end: string) => {
      if (start === end) return start;
      return `${start} bis ${end}`;
    };

    // Build notification content
    const absenceLabel = ABSENCE_LABELS[payload.absenceType] || payload.absenceType;
    const dateRange = formatDateRange(payload.startDate, payload.endDate);

    let subject = "";
    let message = "";

    switch (payload.action) {
      case "created":
        subject = `Abwesenheit eingetragen: ${absenceLabel}`;
        message = `Eine Abwesenheit wurde für Sie eingetragen.\n\nTyp: ${absenceLabel}\nZeitraum: ${dateRange}\n\nBei Fragen wenden Sie sich bitte an das Büro.`;
        break;
      case "approved":
        subject = `Abwesenheit genehmigt: ${absenceLabel}`;
        message = `Ihre Abwesenheitsanfrage wurde genehmigt.\n\nTyp: ${absenceLabel}\nZeitraum: ${dateRange}`;
        break;
      case "rejected":
        subject = `Abwesenheit abgelehnt: ${absenceLabel}`;
        message = `Ihre Abwesenheitsanfrage wurde leider abgelehnt.\n\nTyp: ${absenceLabel}\nZeitraum: ${dateRange}\n\nGrund: ${payload.rejectionReason || "Kein Grund angegeben"}\n\nBitte wenden Sie sich an das Büro für weitere Informationen.`;
        break;
    }

    // Queue the notification in the database
    const { data: notification, error: insertError } = await supabase
      .from("notification_queue")
      .insert({
        notification_type: `absence_${payload.action}`,
        recipient_type: "instructor",
        recipient_id: payload.instructorId,
        recipient_email: payload.instructorEmail,
        recipient_phone: payload.instructorPhone,
        payload: {
          subject,
          message,
          absenceType: payload.absenceType,
          startDate: payload.startDate,
          endDate: payload.endDate,
          action: payload.action,
          rejectionReason: payload.rejectionReason,
        },
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to queue notification:", insertError);
      throw insertError;
    }

    console.log("Notification queued successfully:", notification.id);

    // Future: Here you would integrate with actual notification services
    // For example:
    // - Resend for Email: await sendEmail(payload.instructorEmail, subject, message);
    // - Twilio for WhatsApp: await sendWhatsApp(payload.instructorPhone, message);

    // For now, we just mark it as "sent" (simulated)
    const { error: updateError } = await supabase
      .from("notification_queue")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", notification.id);

    if (updateError) {
      console.error("Failed to update notification status:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationId: notification.id,
        message: "Notification queued successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Notification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to process notification";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
