import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, UserCheck } from "lucide-react";

const Instructors = () => {
  return (
    <>
      <PageHeader
        title="Instructors"
        description="Manage ski instructors and their real-time availability."
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Instructor
          </Button>
        }
      />

      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <UserCheck className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Instructor Traffic Light System
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Coming soon — Real-time instructor availability with traffic light
              status. Green = available, Orange = on call, Red = unavailable.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default Instructors;