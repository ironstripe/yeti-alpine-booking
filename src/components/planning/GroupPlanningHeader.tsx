import { format, addWeeks, getISOWeek, startOfWeek, endOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Target, Calendar, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GroupPlanningHeaderProps {
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  onGenerate: () => void;
  onCopyFromPrevious: () => void;
  isGenerating: boolean;
  isCopying: boolean;
  hasInstances: boolean;
}

export function GroupPlanningHeader({
  weekStart,
  onWeekChange,
  onGenerate,
  onCopyFromPrevious,
  isGenerating,
  isCopying,
  hasInstances,
}: GroupPlanningHeaderProps) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekNumber = getISOWeek(weekStart);
  const isCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 1 }).getTime() === weekStart.getTime();

  const handlePrevWeek = () => {
    onWeekChange(addWeeks(weekStart, -1));
  };

  const handleNextWeek = () => {
    onWeekChange(addWeeks(weekStart, 1));
  };

  const handleToday = () => {
    onWeekChange(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card border border-border rounded-lg p-4 mb-6">
      {/* Week Navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrevWeek}
          className="h-9 w-9"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-center min-w-[200px]">
          <div className="text-sm font-medium text-muted-foreground">
            KW {weekNumber}
          </div>
          <div className="font-semibold">
            {format(weekStart, 'd.', { locale: de })} - {format(weekEnd, 'd. MMM yyyy', { locale: de })}
          </div>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={handleNextWeek}
          className="h-9 w-9"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleToday}
          disabled={isCurrentWeek}
          className={cn(isCurrentWeek && 'opacity-50')}
        >
          <Target className="h-4 w-4 mr-1.5" />
          Heute
        </Button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          onClick={onGenerate}
          disabled={isGenerating || hasInstances}
          variant={hasInstances ? 'outline' : 'default'}
          size="sm"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Calendar className="h-4 w-4 mr-1.5" />
          )}
          {hasInstances ? 'Woche bereits generiert' : 'Woche generieren'}
        </Button>

        <Button
          onClick={onCopyFromPrevious}
          disabled={isCopying || !hasInstances}
          variant="outline"
          size="sm"
        >
          {isCopying ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Copy className="h-4 w-4 mr-1.5" />
          )}
          Von Vorwoche kopieren
        </Button>
      </div>
    </div>
  );
}
