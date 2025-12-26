import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

const Inbox = () => {
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Manage all incoming messages from WhatsApp, Email, and Phone."
        actions={
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        }
      />

      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Badge variant="secondary" className="text-lg px-3 py-1">
                3
              </Badge>
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Unified Inbox
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Coming soon — View and respond to all customer messages from
              WhatsApp, Email, and Phone in one place.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default Inbox;