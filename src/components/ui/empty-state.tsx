import { LucideIcon, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const ActionIcon = action?.icon || Plus;
  
  return (
    <Card className="bg-card">
      <CardContent className="py-12">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold font-display mb-2">
            {title}
          </h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
            {description}
          </p>
          {action && (
            <Button onClick={action.onClick}>
              <ActionIcon className="h-4 w-4 mr-2" />
              {action.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
