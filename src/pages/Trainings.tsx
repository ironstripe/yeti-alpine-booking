import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, GraduationCap } from "lucide-react";

const Trainings = () => {
  return (
    <>
      <PageHeader
        title="Trainings"
        description="Manage internal instructor training events and attendance."
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Training
          </Button>
        }
      />

      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <GraduationCap className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Training Management
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Coming soon — Schedule training events, track instructor
              participation, and manage mandatory training requirements.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default Trainings;