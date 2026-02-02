import { UserPlus, Split, Merge, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { GroupCapacityInfo } from '@/hooks/useGroupCapacityData';

interface GroupCapacityCardProps {
  group: GroupCapacityInfo;
  variant: 'overbooked' | 'underbooked' | 'ok';
  onSplit?: () => void;
  onMerge?: () => void;
  onAddAssistant?: () => void;
}

export function GroupCapacityCard({ 
  group, 
  variant, 
  onSplit, 
  onMerge, 
  onAddAssistant 
}: GroupCapacityCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const capacityPercent = Math.min((group.participantCount / group.maxParticipants) * 100, 120);
  
  const displayName = group.customName || 
    (group.groupNumber > 1 ? `${group.courseName} ${group.groupNumber}` : group.courseName);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="w-3 h-12 rounded"
              style={{ backgroundColor: group.courseColor }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{displayName}</h3>
                {group.groupNumber > 1 && (
                  <Badge variant="outline" className="text-xs">
                    Gruppe {group.groupNumber}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {group.instructorName || 'Kein Lehrer zugewiesen'}
                {group.assistantName && (
                  <span className="text-primary"> + {group.assistantName}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Capacity indicator */}
            <div className="text-right min-w-[80px]">
              <p className={cn(
                "text-lg font-bold",
                variant === 'overbooked' && "text-orange-600",
                variant === 'underbooked' && "text-yellow-600",
                variant === 'ok' && "text-green-600"
              )}>
                {group.participantCount}/{group.maxParticipants}
              </p>
              <p className="text-xs text-muted-foreground">
                Min: {group.minParticipants}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-24 hidden sm:block">
              <Progress 
                value={capacityPercent} 
                className={cn(
                  variant === 'overbooked' && "[&>div]:bg-orange-500",
                  variant === 'underbooked' && "[&>div]:bg-yellow-500",
                  variant === 'ok' && "[&>div]:bg-green-500"
                )}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {variant === 'overbooked' && (
                <>
                  {onAddAssistant && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={onAddAssistant}
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      <span className="hidden lg:inline">Hilfslehrer</span>
                    </Button>
                  )}
                  {onSplit && (
                    <Button 
                      size="sm"
                      onClick={onSplit}
                    >
                      <Split className="mr-2 h-4 w-4" />
                      <span className="hidden lg:inline">Aufteilen</span>
                    </Button>
                  )}
                </>
              )}
              {variant === 'underbooked' && onMerge && (
                <Button 
                  size="sm"
                  onClick={onMerge}
                >
                  <Merge className="mr-2 h-4 w-4" />
                  <span className="hidden lg:inline">Zusammenlegen</span>
                </Button>
              )}
            </div>

            {/* Expand participants */}
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>

        {/* Participants List */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent>
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">
                Teilnehmer ({group.participants.length})
              </h4>
              {group.participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Teilnehmer angemeldet</p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {group.participants
                    .sort((a, b) => a.firstName.localeCompare(b.firstName))
                    .map(participant => (
                      <div 
                        key={participant.id}
                        className="flex justify-between items-center p-2 bg-muted/50 rounded text-sm"
                      >
                        <span className="font-medium">
                          {participant.firstName} {participant.lastName}
                        </span>
                        <span className="text-muted-foreground">
                          {participant.age} J.
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
