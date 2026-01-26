import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare } from "lucide-react";

export function DailyTasksPlaceholder() {
  return (
    <Card className="bg-muted/30 border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <CheckSquare className="h-4 w-4" />
          Tagesaufgaben
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground text-center py-4">
          Tagesaufgaben-Checkliste wird in einer zukünftigen Version hinzugefügt.
        </p>
      </CardContent>
    </Card>
  );
}
