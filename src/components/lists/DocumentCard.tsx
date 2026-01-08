import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface DocumentCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  count: number;
  countLabel: string;
  onGenerate: () => void;
}

export function DocumentCard({
  icon: Icon,
  title,
  subtitle,
  count,
  countLabel,
  onGenerate,
}: DocumentCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6 flex flex-col items-center text-center">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-semibold text-base mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-3">{subtitle}</p>
        <p className="text-lg font-bold mb-4">
          {count} {countLabel}
        </p>
        <Button onClick={onGenerate} className="w-full" disabled={count === 0}>
          Erstellen
        </Button>
      </CardContent>
    </Card>
  );
}
