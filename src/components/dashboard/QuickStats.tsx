import { Card, CardContent } from "@/components/ui/card";
import { Calendar, UserCheck, Inbox } from "lucide-react";
import { useConversationCounts } from "@/hooks/useConversations";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { format } from "date-fns";

export function QuickStats() {
  const today = new Date();
  
  const { data: conversationCounts } = useConversationCounts();
  const { bookings, instructors } = useSchedulerData({ 
    startDate: today, 
    endDate: today 
  });

  const todayStr = format(today, "yyyy-MM-dd");
  const unreadCount = conversationCounts?.unread || 0;
  const todayBookings = bookings?.filter(b => b.date === todayStr).length || 0;
  const availableInstructors = instructors?.filter(i => i.status === "active").length || 0;

  const stats = [
    {
      title: "Buchungen heute",
      value: todayBookings.toString(),
      icon: Calendar,
      color: "text-primary"
    },
    {
      title: "Lehrer verfügbar",
      value: availableInstructors.toString(),
      icon: UserCheck,
      color: "text-green-600"
    },
    {
      title: "Ungelesene",
      value: unreadCount.toString(),
      icon: Inbox,
      color: unreadCount > 0 ? "text-orange-500" : "text-muted-foreground"
    }
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((stat) => (
        <Card key={stat.title} className="bg-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xl font-bold font-display">{stat.value}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {stat.title}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
