import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, UserCheck, Inbox } from "lucide-react";

const stats = [
  {
    title: "Today's Bookings",
    value: "12",
    change: "+2 from yesterday",
    icon: Calendar,
  },
  {
    title: "Active Customers",
    value: "156",
    change: "+8 this week",
    icon: Users,
  },
  {
    title: "Instructors Available",
    value: "8/24",
    change: "16 on lessons",
    icon: UserCheck,
  },
  {
    title: "Unread Messages",
    value: "3",
    change: "2 from WhatsApp",
    icon: Inbox,
  },
];

const Dashboard = () => {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's what's happening today."
      />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholder content */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg font-display">Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Schedule overview coming soon...
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg font-display">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Activity feed coming soon...
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Dashboard;