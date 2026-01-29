import { useState, useEffect } from "react";
import { useCapabilities, groupCapabilitiesByCategory } from "@/hooks/useCapabilities";
import { useInstructorCapabilities } from "@/hooks/useInstructorCapabilities";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Save } from "lucide-react";

interface CapabilitiesManagerProps {
  instructorId: string;
}

export function CapabilitiesManager({ instructorId }: CapabilitiesManagerProps) {
  const { data: capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const {
    capabilityIds,
    isLoading: instructorCapabilitiesLoading,
    setCapabilities,
    isSaving,
  } = useInstructorCapabilities(instructorId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize selected state from fetched data
  useEffect(() => {
    if (capabilityIds.length > 0 || !instructorCapabilitiesLoading) {
      setSelected(new Set(capabilityIds));
      setHasChanges(false);
    }
  }, [capabilityIds, instructorCapabilitiesLoading]);

  const handleToggle = (capabilityId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(capabilityId);
      } else {
        next.delete(capabilityId);
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    setCapabilities(Array.from(selected));
    setHasChanges(false);
  };

  if (capabilitiesLoading || instructorCapabilitiesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!capabilities || capabilities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Keine Qualifikationen verfügbar.</p>
    );
  }

  const grouped = groupCapabilitiesByCategory(capabilities);
  const categories = Object.keys(grouped).sort();

  // Calculate selected count per category
  const getSelectedCount = (category: string) => {
    return grouped[category].filter((cap) => selected.has(cap.id)).length;
  };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={categories} className="space-y-2">
        {categories.map((category) => {
          const caps = grouped[category];
          const selectedCount = getSelectedCount(category);
          
          return (
            <AccordionItem key={category} value={category} className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                <span className="flex items-center gap-2">
                  {category}
                  <span className="text-xs text-muted-foreground">
                    ({selectedCount}/{caps.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid gap-2">
                  {caps.map((cap) => (
                    <label
                      key={cap.id}
                      className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(cap.id)}
                        onCheckedChange={(checked) => handleToggle(cap.id, !!checked)}
                      />
                      <span className="text-sm">{cap.name}</span>
                    </label>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <Button
        onClick={handleSave}
        disabled={!hasChanges || isSaving}
        className="w-full"
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Speichern...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Speichern
          </>
        )}
      </Button>
    </div>
  );
}
