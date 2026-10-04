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
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-3 last:border-b-0 sm:flex-nowrap sm:px-4">
      <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 text-left">
          <h3 className="font-medium text-foreground">{title}</h3>
          <p className="break-words text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="ml-11 flex min-w-0 flex-1 basis-[calc(100%-2.75rem)] items-center justify-between gap-3 sm:ml-0 sm:flex-none sm:basis-auto">
        <p className="min-w-0 text-sm tabular-nums text-muted-foreground sm:w-28 sm:text-right">
          {count} {countLabel}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="control-target shrink-0"
          onClick={onGenerate}
          disabled={count === 0}
        >
          Erstellen
        </Button>
      </div>
    </li>
  );
}
