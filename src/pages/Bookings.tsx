import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Calendar } from "lucide-react";

const Bookings = () => {
  return (
    <>
      <PageHeader
        title="Bookings"
        description="Manage all ski lessons and group course bookings."
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Booking
          </Button>
        }
      />

      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Booking Management
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Coming soon — Create, edit, and manage all bookings with the
              booking wizard. Assign instructors and track payments.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default Bookings;