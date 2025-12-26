import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Users } from "lucide-react";

const Customers = () => {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Manage customer profiles and their participants (children)."
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        }
      />

      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Customer & Family Hub
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Coming soon — View all customers, their participants, booking
              history, and contact preferences.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default Customers;